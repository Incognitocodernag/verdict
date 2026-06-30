import { useState, useEffect } from 'react';
import { Panel } from './components/Panel';
import { SkeletonLoader } from './components/SkeletonLoader';
import { getASIN, getProductTitle, scrapeReviews, extractProductCategory } from './utils/scraper';
import { HeartCrack, X } from 'lucide-react';

const BACKEND_URL = 'http://localhost:5000/api/v1';
const FRESH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours

/**
 * EventBoundary prevents user clicks, key presses, and mouse scrolling
 * from bubbling out of the Verdict panel and colliding with Amazon's host scripts.
 */
function EventBoundary({ children }: { children: React.ReactNode }) {
  const stopEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div 
      onClick={stopEvent}
      onKeyDown={stopEvent}
      onWheel={stopEvent}
      onScroll={stopEvent}
      className="h-full w-full"
    >
      {children}
    </div>
  );
}

/**
 * Renders the custom packaged Verdict logo image.
 */
export function VerdictLogo({ className = "w-5 h-5" }: { className?: string }) {
  const logoUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('logo.png') : '';
  if (!logoUrl) {
    return (
      <svg className={`${className} text-indigo-600`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  return <img src={logoUrl} className={`${className} rounded-md object-contain`} alt="Verdict" />;
}

export default function App() {
  const [asin, setAsin] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdictData, setVerdictData] = useState<any | null>(null);

  // Initialize ASIN and Product Title on mount
  useEffect(() => {
    const detectedAsin = getASIN();
    const detectedTitle = getProductTitle();
    
    if (detectedAsin) {
      setAsin(detectedAsin);
      setTitle(detectedTitle);
      console.log(`Verdict App: Detected product page. ASIN: ${detectedAsin}`);
    }
  }, []);

  // Helper to trigger API request through background.js (CSP bypass)
  const queryBackend = (method: 'GET' | 'POST', endpoint: string, body?: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      try {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
          reject(new Error('Verdict was updated in the background. Please refresh this tab.'));
          return;
        }

        chrome.runtime.sendMessage(
          {
            type: 'FETCH_API',
            payload: {
              url: `${BACKEND_URL}${endpoint}`,
              method,
              body
            }
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error('Extension context was invalidated during reload. Please refresh the page.'));
              return;
            }
            if (!response) {
              reject(new Error('Extension messaging channel disconnected. Verify server is running.'));
              return;
            }
            if (response.success) {
              resolve(response.data);
            } else {
              reject(new Error(response.error || `HTTP Error ${response.status || 'unknown'}`));
            }
          }
        );
      } catch (err: any) {
        console.error('Verdict connection failed:', err);
        reject(new Error('Verdict was updated in the background. Please reload this tab to re-enable analysis.'));
      }
    });
  };

  const handleFabClick = async (forceBypass = false) => {
    if (!asin) return;
    
    setIsOpen(true);
    
    // If we already have the verdict loaded and are not forcing re-scraping, don't query again
    if (verdictData && !forceBypass) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Client Cache/SWR check (GET request)
      console.log(`Verdict App: Checking cache for ASIN: ${asin}`);
      const checkResult = await queryBackend('GET', `/verdict?asin=${asin}`);

      if (checkResult.cached && checkResult.data) {
        const payload = checkResult.data;
        const cacheAge = Date.now() - new Date(payload.createdAt).getTime();

        console.log(`Verdict App: Cache HIT. Age: ${Math.round(cacheAge / 1000 / 60)} minutes.`);
        setVerdictData(payload);
        setLoading(false);

        // If the cache entry is older than 24 hours, perform SWR (Stale-While-Revalidate)
        if (cacheAge > FRESH_CACHE_TTL_MS) {
          console.log('Verdict App: Cache is stale (>24h). Triggering background SWR revalidation...');
          revalidateBackground();
        }
        return;
      }

      // 2. Cache MISS: Proceed to harvest reviews
      console.log('Verdict App: Cache MISS. Commencing reviews extraction.');
      await new Promise(resolve => setTimeout(resolve, 600)); // Premium skeleton transition

      const reviews = scrapeReviews(30);
      if (reviews.length === 0) {
        throw new Error('No review text detected. Reviews container may be empty or dynamically lazy-loaded.');
      }

      // 3. POST reviews to Backend (Triggers LLM + Math Engine)
      const postResult = await queryBackend('POST', '/verdict', {
        asin,
        title,
        domain: window.location.hostname,
        category: extractProductCategory(),
        reviews
      });

      if (postResult && postResult.data) {
        setVerdictData(postResult.data);
      } else {
        throw new Error('Received invalid analysis payload from server.');
      }
    } catch (err: any) {
      console.error('Verdict App analysis failed:', err);
      setError(err.message || 'Server is temporarily unavailable. Try again later.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Performs background review extraction and cache update without showing loading skeletons.
   */
  const revalidateBackground = async () => {
    try {
      const reviews = scrapeReviews(30);
      if (reviews.length === 0) return;

      const postResult = await queryBackend('POST', '/verdict', {
        asin,
        title,
        domain: window.location.hostname,
        category: extractProductCategory(),
        reviews,
        forceRefresh: true // Force backend to execute fresh LLM query
      });

      if (postResult && postResult.data) {
        console.log('Verdict App: Background revalidation completed successfully.');
        setVerdictData(postResult.data);
      }
    } catch (err) {
      console.error('Verdict App: Background revalidation failed:', err);
    }
  };

  return (
    <div>
      {/* Sleek Vertical Tab Trigger (Honey / BuyHatke Material Aesthetic) */}
      {!isOpen && asin && (
        <div 
          onClick={() => handleFabClick(false)}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-gradient-to-l from-indigo-600 to-indigo-700 text-white flex items-center space-x-2 py-3 px-3 rounded-l-2xl cursor-pointer shadow-[-4px_4px_20px_rgba(79,70,229,0.25)] hover:shadow-[-4px_4px_25px_rgba(79,70,229,0.4)] transition-all duration-300 z-[999998] hover:-translate-x-1 hover:pl-5 group"
          title="Click to analyze product reviews with Verdict"
        >
          <div className="bg-white p-1.5 rounded-xl shadow-sm text-indigo-600 group-hover:rotate-6 transition-transform">
            <VerdictLogo className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-[10px] uppercase tracking-widest hidden group-hover:inline-block animate-slideIn">
            Analyze Verdict
          </span>
        </div>
      )}

      {/* Slide-over Drawer Panel */}
      <div 
        className={`fixed top-0 right-0 h-full w-[410px] bg-white z-[999999] border-l border-slate-100 shadow-[-10px_0_35px_rgba(0,0,0,0.08)] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <EventBoundary>
          {loading ? (
            <SkeletonLoader />
          ) : error ? (
            /* Error display panel */
            <div className="flex flex-col h-full bg-white p-6 font-sans justify-between">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <span className="font-extrabold text-lg text-slate-800">Analysis Error</span>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 px-4">
                <div className="p-4 bg-rose-50 border border-rose-100 text-rose-500 rounded-full animate-pulse">
                  <HeartCrack className="w-12 h-12" />
                </div>
                <h3 className="text-md font-bold text-slate-800">Execution Failed</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {error}
                </p>
              </div>
              
              <button 
                onClick={() => handleFabClick(true)} // Retrying forces cache bypass
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wide transition-colors cursor-pointer shadow-md"
              >
                Retry Analysis
              </button>
            </div>
          ) : verdictData ? (
            <Panel 
              data={verdictData} 
              onClose={() => setIsOpen(false)} 
              onRefresh={() => handleFabClick(true)}
            />
          ) : null}
        </EventBoundary>
      </div>
    </div>
  );
}
