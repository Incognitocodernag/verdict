// Background worker service script for Verdict Extension (Manifest V3)

interface ScrapedReview {
  text: string;
  rating?: number;
  isPositive: boolean;
  isVerified: boolean;
  helpfulVotes: number;
  hasImages: boolean;
  date?: string; // ISO String
}

interface CachedVerdict {
  data: any;
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour client-side cache
const pendingRequests = new Map<string, Promise<any>>();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('keepalive-')) {
    console.log(`[Broker] Keep-alive alarm pinged for ASIN: ${alarm.name}`);
  }
});

/**
 * Normalizes and parses network error statuses.
 */
function parseNetworkError(status?: number): { errorCode: string; message: string } {
  if (status === 429) {
    return {
      errorCode: 'RATE_LIMITED',
      message: 'You have exceeded the analysis limit (max 14 requests/min). Please wait a moment.'
    };
  }
  if (status === 401) {
    return {
      errorCode: 'API_KEY_ERROR',
      message: 'The Gemini API key is missing or unauthorized. Check your .env file.'
    };
  }
  if (status === 403) {
    return {
      errorCode: 'QUOTA_EXCEEDED',
      message: 'Gemini API credits or quota has been exceeded for this key.'
    };
  }
  if (status === 503) {
    return {
      errorCode: 'SERVER_OFFLINE',
      message: 'Verdict server is starting up or temporarily offline.'
    };
  }
  return {
    errorCode: 'INTERNAL_ERROR',
    message: 'An internal server error occurred while calculating the verdict.'
  };
}

/**
 * Clean HTML entities and tags without window/document.
 */
function sanitizeHtmlString(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Worker-compliant Amazon Review Page Regex Parser.
 */
function parseAmazonReviewsHtml(html: string): ScrapedReview[] {
  const reviews: ScrapedReview[] = [];
  
  const reviewContainers = html.split('data-hook="review"');
  if (reviewContainers.length <= 1) return reviews;

  for (let i = 1; i < reviewContainers.length; i++) {
    const card = reviewContainers[i];

    // 1. Extract Body Text
    const bodyMatch = card.match(/<span[^>]*data-hook="review-body"[^>]*>([\s\S]*?)<\/span>/i);
    let text = '';
    if (bodyMatch && bodyMatch[1]) {
      text = sanitizeHtmlString(bodyMatch[1]).replace(/Read more/g, '').trim();
    }
    if (!text || text.length < 15) continue;

    // 2. Extract Rating Stars
    let rating = 3;
    const ratingMatch = card.match(/<i[^>]*data-hook="review-star-rating"[^>]*>[\s\S]*?<span[^>]*class="a-icon-alt"[^>]*>([\d.]+)/i) 
      || card.match(/a-star-(\d)/i);
    if (ratingMatch && ratingMatch[1]) {
      rating = parseFloat(ratingMatch[1]);
    }

    // 3. Extract Date
    let dateISO = new Date().toISOString();
    const dateMatch = card.match(/<span[^>]*data-hook="review-date"[^>]*>([\s\S]*?)<\/span>/i);
    if (dateMatch && dateMatch[1]) {
      const rawDate = sanitizeHtmlString(dateMatch[1]);
      const datePattern = /(?:reviewed in|rezensiert in|revisado en|recensito in).*(?:on|am|el|il)\s+(.*)/i;
      const m = rawDate.match(datePattern);
      const parsed = new Date(m && m[1] ? m[1].trim() : rawDate);
      if (!isNaN(parsed.getTime())) {
        dateISO = parsed.toISOString();
      }
    }

    // 4. Extract Verification Status
    const isVerified = card.includes('data-hook="avp-badge"') || card.toLowerCase().includes('verified purchase');

    // 5. Extract Helpful Votes Count
    let helpfulVotes = 0;
    const helpfulMatch = card.match(/<span[^>]*data-hook="helpful-vote-statement"[^>]*>([\s\S]*?)<\/span>/i);
    if (helpfulMatch && helpfulMatch[1]) {
      const helpfulText = helpfulMatch[1].toLowerCase();
      if (helpfulText.includes('one person') || helpfulText.includes('1 person')) {
        helpfulVotes = 1;
      } else {
        const numMatch = helpfulText.match(/(\d[\d,]*)/);
        if (numMatch && numMatch[1]) {
          helpfulVotes = parseInt(numMatch[1].replace(/,/g, ''), 10);
        }
      }
    }

    // 6. Check for Images
    const hasImages = card.includes('data-hook="review-image-container"') || card.includes('review-image-tile');

    reviews.push({
      text,
      rating,
      isPositive: rating >= 3,
      isVerified,
      helpfulVotes,
      hasImages,
      date: dateISO
    });
  }

  return reviews;
}

/**
 * Fetches 10 review pages (100 reviews) from Amazon.
 */
async function fetchBackgroundReviews(domain: string, asin: string): Promise<ScrapedReview[]> {
  const cleanDomain = domain;
  
  // Balanced 100 reviews selection pages
  const pagesToFetch = [
    { type: 'recent', page: 1 },
    { type: 'recent', page: 2 },
    { type: 'recent', page: 3 },
    { type: 'recent', page: 4 },
    { type: 'critical', page: 1 },
    { type: 'critical', page: 2 },
    { type: 'critical', page: 3 },
    { type: 'oldest', page: 1 },
    { type: 'oldest', page: 2 },
    { type: 'oldest', page: 3 }
  ];

  const allBackgroundReviews: ScrapedReview[] = [];

  const promises = pagesToFetch.map(async (p) => {
    try {
      let url = '';
      if (p.type === 'recent') {
        url = `https://${cleanDomain}/product-reviews/${asin}/ref=cm_cr_arp_d_viewopt_srt?sortBy=recent&pageNumber=${p.page}`;
      } else if (p.type === 'oldest') {
        url = `https://${cleanDomain}/product-reviews/${asin}/ref=cm_cr_arp_d_viewopt_srt?sortBy=oldest&pageNumber=${p.page}`;
      } else {
        url = `https://${cleanDomain}/product-reviews/${asin}/ref=cm_cr_arp_d_viewopt_sr?filterByStar=critical&pageNumber=${p.page}`;
      }

      const res = await fetch(url, {
        headers: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'same-origin',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) return;
      const html = await res.text();
      const parsed = parseAmazonReviewsHtml(html);
      allBackgroundReviews.push(...parsed);
      console.log(`[Broker] Scraped background page. Type: ${p.type}, Page: ${p.page}. Found ${parsed.length} reviews.`);
    } catch (err) {
      console.error(`[Broker] Failed background reviews fetch. Type: ${p.type}, Page: ${p.page}`, err);
    }
  });

  await Promise.all(promises);
  return allBackgroundReviews;
}

function getCachedResult(asin: string): Promise<any | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([asin], (result) => {
      const entry = result[asin] as CachedVerdict;
      if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
        resolve(entry.data);
      } else {
        resolve(null);
      }
    });
  });
}

function setCachedResult(asin: string, data: any): void {
  const entry: CachedVerdict = {
    data,
    timestamp: Date.now()
  };
  chrome.storage.local.set({ [asin]: entry });
}

/**
 * Message Proxy Broker
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FETCH_API') {
    const { url, method, body } = message.payload;
    
    let asin = '';
    if (body && body.asin) {
      asin = body.asin;
    } else {
      const asinMatch = url.match(/[?&]asin=([A-Z0-9]{10})/i);
      if (asinMatch && asinMatch[1]) {
        asin = asinMatch[1];
      }
    }

    // 1. GET Cache Check
    if (method === 'GET' && asin) {
      getCachedResult(asin).then((cachedData) => {
        if (cachedData) {
          console.log(`[Broker] Cache HIT for ASIN: ${asin}`);
          sendResponse({ success: true, data: { cached: true, data: cachedData } });
          return;
        }
        executeFetch();
      });
      return true;
    }

    // 2. Perform POST request with SWR/Background Scrape
    executeFetch();
    return true;

    function executeFetch() {
      if (asin) {
        chrome.alarms.create(`keepalive-${asin}`, { delayInMinutes: 1 });
      }

      let fetchPromise = asin ? pendingRequests.get(asin) : null;

      if (!fetchPromise) {
        fetchPromise = (async () => {
          let mergedBody = { ...body };

          if (method === 'POST' && body && body.reviews && body.domain && asin) {
            console.log(`[Broker] Harvesting 100 background reviews for ASIN: ${asin}`);
            const backgroundReviews = await fetchBackgroundReviews(body.domain, asin);
            
            const seenText = new Set<string>();
            const uniqueReviews: ScrapedReview[] = [];

            // 1. Add background reviews
            backgroundReviews.forEach(r => {
              const normalized = r.text.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (!seenText.has(normalized)) {
                seenText.add(normalized);
                uniqueReviews.push(r);
              }
            });

            // 2. Add local client reviews
            body.reviews.forEach((r: ScrapedReview) => {
              const normalized = r.text.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (!seenText.has(normalized)) {
                seenText.add(normalized);
                uniqueReviews.push(r);
              }
            });

            mergedBody.reviews = uniqueReviews;
            console.log(`[Broker] 100-Review Scraper complete. Merged Total: ${uniqueReviews.length}`);
          }

          const fetchOptions: RequestInit = {
            method,
            headers: { 'Content-Type': 'application/json' }
          };

          if (method === 'POST' || method === 'PUT') {
            fetchOptions.body = JSON.stringify(mergedBody);
          }

          try {
            const response = await fetch(url, fetchOptions);
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
              data = await response.json();
            } else {
              data = { text: await response.text() };
            }
            
            if (!response.ok) {
              const errDetails = parseNetworkError(response.status);
              return { 
                success: false, 
                status: response.status,
                error: data.error || errDetails.message,
                errorCode: errDetails.errorCode
              };
            } else {
              if (asin && data && data.data) {
                setCachedResult(asin, data.data);
              }
              return { success: true, data };
            }
          } catch (error) {
            console.error('[Broker] Fetch failed:', error);
            return { 
              success: false, 
              error: 'Verdict server is unreachable. Verify that your backend is running.',
              errorCode: 'SERVER_OFFLINE'
            };
          }
        })().finally(() => {
          if (asin) {
            pendingRequests.delete(asin);
            chrome.alarms.clear(`keepalive-${asin}`);
          }
        });

        if (asin) {
          pendingRequests.set(asin, fetchPromise);
        }
      } else {
        console.log(`[Broker] Deduplicating parallel fetch for ASIN: ${asin}`);
      }

      fetchPromise.then((res) => {
        sendResponse(res);
      });
    }
  }
  return false;
});
