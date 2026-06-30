export interface ScrapedReview {
  text: string;
  rating?: number;
  isPositive: boolean;
  isVerified: boolean;
  helpfulVotes: number;
  hasImages: boolean;
  date?: string; // ISO 8601 String
}

export interface ScrapedProduct {
  asin: string;
  title: string;
  category: string;
  reviews: ScrapedReview[];
}

/**
 * Robust ASIN parser that checks the URL path first,
 * falling back to hidden DOM inputs used by Amazon's form states.
 */
export function getASIN(): string | null {
  // 1. Try parsing from URL path
  const url = window.location.href;
  const urlMatch = url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // 2. Fallback: Search in hidden inputs
  const hiddenInput = document.getElementById('ASIN') as HTMLInputElement | null;
  if (hiddenInput && hiddenInput.value) {
    return hiddenInput.value;
  }

  const nameInput = document.querySelector('input[name="ASIN"]') as HTMLInputElement | null;
  if (nameInput && nameInput.value) {
    return nameInput.value;
  }

  return null;
}

/**
 * Extracts the product title from standard Amazon containers.
 */
export function getProductTitle(): string {
  const selectors = ['#productTitle', '.qa-title', 'h1.a-size-large'];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent) {
      return element.textContent.trim();
    }
  }
  return 'Unknown Amazon Product';
}

/**
 * Extracts the product category breadcrumbs hierarchy.
 */
export function extractProductCategory(): string {
  const selectors = [
    '#wayfinding-breadcrumbs_container li a',
    '#showing-breadcrumbs_div li a',
    '.a-breadcrumbs li a'
  ];

  let breadcrumbElements: NodeListOf<Element> | null = null;
  for (const selector of selectors) {
    const found = document.querySelectorAll(selector);
    if (found && found.length > 0) {
      breadcrumbElements = found;
      break;
    }
  }

  if (!breadcrumbElements || breadcrumbElements.length === 0) {
    return "Uncategorized";
  }

  return Array.from(breadcrumbElements)
    .map(el => el.textContent?.trim() || '')
    .filter(Boolean)
    .join(' > ');
}

/**
 * Parses and normalizes regional Amazon review dates into an ISO string.
 */
export function parseAmazonReviewDate(reviewEl: Element): string {
  const dateEl = reviewEl.querySelector('[data-hook="review-date"], .review-date');
  if (!dateEl || !dateEl.textContent) {
    return new Date().toISOString();
  }

  const rawText = dateEl.textContent.trim();
  
  // Regex covers regional prefixes: "Reviewed in X on ", "Rezensiert in X am ", "Revisado en X el "
  const datePattern = /(?:reviewed in|rezensiert in|revisado en|recensito in).*(?:on|am|el|il)\s+(.*)/i;
  const match = rawText.match(datePattern);
  
  const extractedDate = match && match[1] ? match[1].trim() : rawText;
  const parsed = new Date(extractedDate);

  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/**
 * Traverses a review container to extract verification tags, helpfulness votes, and media.
 */
export function extractReviewMetadata(reviewEl: Element): { isVerified: boolean; helpfulVotes: number; hasImages: boolean } {
  // 1. Check for verified purchase badge
  const badge = reviewEl.querySelector('[data-hook="avp-badge"], .a-size-mini.a-color-state.a-text-bold');
  const isVerified = badge ? badge.textContent?.toLowerCase().includes('verified purchase') || badge.getAttribute('data-hook') === 'avp-badge' : false;

  // 2. Check for helpful vote statement
  const voteEl = reviewEl.querySelector('[data-hook="helpful-vote-statement"], .cr-vote-text');
  let helpfulVotes = 0;

  if (voteEl && voteEl.textContent) {
    const text = voteEl.textContent.trim().toLowerCase();
    if (text.includes('one person') || text.includes('1 person')) {
      helpfulVotes = 1;
    } else {
      const match = text.match(/(\d[\d,]*)/);
      if (match && match[1]) {
        helpfulVotes = parseInt(match[1].replace(/,/g, ''), 10);
      }
    }
  }

  // 3. Check for image attachments
  const hasImages = !!reviewEl.querySelector('[data-hook="review-image-container"], .review-image-container, .review-image-tile, img[src*="media-amazon.com/images"]');

  return { isVerified, helpfulVotes, hasImages };
}

/**
 * Semantically traverses the page to harvest product reviews with metadata.
 */
export function scrapeReviews(maxCount = 30): ScrapedReview[] {
  const reviews: ScrapedReview[] = [];
  
  // Find review containers on page
  let reviewElements = Array.from(document.querySelectorAll('[data-hook="review"]'));
  if (reviewElements.length === 0) {
    reviewElements = Array.from(document.querySelectorAll('.review, .review-container, #cm_cr-review_list .a-section'));
  }

  console.log(`Verdict Scraper: Found ${reviewElements.length} raw review containers.`);

  for (const reviewEl of reviewElements) {
    // A. Text body
    const textEl = reviewEl.querySelector('[data-hook="review-body"], .review-text, .review-data');
    let text = '';
    
    if (textEl) {
      text = textEl.textContent?.replace(/Read more/g, '').trim() || '';
    } else {
      const blocks = Array.from(reviewEl.querySelectorAll('p, span.a-size-base'));
      text = blocks
        .map(b => b.textContent?.trim() || '')
        .filter(t => t.length > 25)
        .join(' ');
    }

    if (!text || text.length < 15) {
      continue; // Skip brief reviews
    }

    // B. Star Rating
    let rating = 3;
    const starEl = reviewEl.querySelector('[data-hook="review-star-rating"], .review-rating, .a-icon-star');
    if (starEl) {
      const starText = starEl.textContent || '';
      const match = starText.match(/(\d+(\.\d+)?)/);
      if (match && match[1]) {
        rating = parseFloat(match[1]);
      } else {
        const classes = Array.from(starEl.classList);
        for (const cls of classes) {
          const matchStar = cls.match(/a-star-(\d+)/);
          if (matchStar && matchStar[1]) {
            rating = parseInt(matchStar[1], 10);
            break;
          }
        }
      }
    }

    const isPositive = rating >= 3;

    // C. Metadata & Date
    const { isVerified, helpfulVotes, hasImages } = extractReviewMetadata(reviewEl);
    const dateISO = parseAmazonReviewDate(reviewEl);

    reviews.push({
      text,
      rating,
      isPositive,
      isVerified,
      helpfulVotes,
      hasImages,
      date: dateISO
    });
  }

  // Deduplicate and split to maintain balance
  const positiveReviews = reviews.filter(r => r.isPositive).slice(0, maxCount);
  const negativeReviews = reviews.filter(r => !r.isPositive).slice(0, maxCount);
  
  console.log(`Verdict Scraper: Filtered down to ${positiveReviews.length} positive and ${negativeReviews.length} negative reviews.`);

  return [...positiveReviews, ...negativeReviews];
}
