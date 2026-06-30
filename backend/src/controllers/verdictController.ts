import { Request, Response, NextFunction } from 'express';
import { AnalyzeRequestSchema } from '../schemas/schemas';
import { Verdict } from '../models/verdictModel';
import { redisClient } from '../config/redis';
import { analyzeReviews } from '../services/gemini';
import { calculateVerdict } from '../services/mathEngine';

// Local in-memory cache fallback for high availability
const localMemoryCache = new Map<string, { data: any; createdAt: number }>();
const FRESH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours

// Critical keywords scanning list
const CRITICAL_KEYWORDS = [
  'broke', 'broken', 'shatter', 'explode', 'burn', 'hazardous', 'allergic', 'vomit', 'rash', 
  'leak', 'expired', 'bribe', 'refund', 'scam', 'fake', 'vine', 'promo', 'coercion', 'hospital',
  'defect', 'worst', 'useless', 'terrible', 'garbage', 'waste', 'misleading', 'wrong'
];

interface ScrapedReview {
  text: string;
  rating?: number;
  isPositive: boolean;
  isVerified: boolean;
  helpfulVotes: number;
  hasImages: boolean;
  date?: string;
}

/**
 * Validates cache age and format integrity (invalidates older V1 versions under 30 reviews).
 */
function isCacheFreshAndValid(payload: any, createdAtMs: number): boolean {
  if (!payload) return false;

  const age = Date.now() - createdAtMs;
  if (age >= FRESH_CACHE_TTL_MS) return false;

  // Invalidate old V1 cache entries to force fresh 100-reviews analysis
  if (payload.llmOutput && payload.llmOutput.R_total < 30) {
    console.log(`[Cache Hub] Invalidating legacy V1 cache (R_total: ${payload.llmOutput.R_total}) for ASIN: ${payload.asin}`);
    return false;
  }

  return true;
}

/**
 * Prioritizes reviews based on defect probability and social relevance.
 */
function prioritizeReviews(reviews: ScrapedReview[]): { priorityList: ScrapedReview[]; originalIndices: number[] } {
  const scored = reviews.map((r, index) => {
    let score = 0;
    
    if (r.rating !== undefined) {
      if (r.rating <= 1) score += 5;
      else if (r.rating === 2) score += 3;
    }

    if (!r.isVerified) score += 2;
    score += Math.min(5, Math.log10(1 + r.helpfulVotes) * 2);

    const lowerText = r.text.toLowerCase();
    const matchesKeyword = CRITICAL_KEYWORDS.some(kw => lowerText.includes(kw));
    if (matchesKeyword) score += 6;

    return { review: r, index, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return {
    priorityList: scored.map(s => s.review),
    originalIndices: scored.map(s => s.index)
  };
}

/**
 * Helper to write evaluations to cache.
 */
async function saveToCache(asin: string, payload: any): Promise<void> {
  const cacheKey = `verdict:${asin}`;
  const localEntry = { data: payload, createdAt: Date.now() };

  localMemoryCache.set(asin, localEntry);

  try {
    await redisClient.set(cacheKey, JSON.stringify(payload), { ex: 7 * 24 * 60 * 60 });
  } catch (err) {
    console.error(`[Cache Hub] Redis write failed for ASIN: ${asin}`, err);
  }

  try {
    await Verdict.findOneAndUpdate({ asin }, payload, { upsert: true });
  } catch (err) {
    console.error(`[Cache Hub] MongoDB write failed for ASIN: ${asin}`, err);
  }
}

/**
 * Endpoint to check if a verdict for the given ASIN already exists in cache.
 * URL: GET /api/v1/verdict?asin={asin}
 */
export async function getVerdict(req: Request, res: Response, next: NextFunction) {
  try {
    const { asin } = req.query;
    if (!asin || typeof asin !== 'string') {
      return res.status(400).json({ error: 'ASIN query parameter is required.' });
    }

    const cacheKey = `verdict:${asin}`;

    // 1. Check Memory Cache
    const local = localMemoryCache.get(asin);
    if (local && isCacheFreshAndValid(local.data, local.createdAt)) {
      console.log(`[Cache Hub] Local Memory HIT for ASIN: ${asin}`);
      return res.status(200).json({ cached: true, data: local.data });
    }

    // 2. Check Redis
    try {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        if (isCacheFreshAndValid(parsed, new Date(parsed.createdAt).getTime())) {
          console.log(`[Cache Hub] Redis HIT for ASIN: ${asin}`);
          localMemoryCache.set(asin, { data: parsed, createdAt: new Date(parsed.createdAt).getTime() });
          return res.status(200).json({ cached: true, data: parsed });
        }
      }
    } catch (redisErr) {
      console.error('[Cache Hub] Redis check failed:', redisErr);
    }

    // 3. Check MongoDB
    try {
      const dbVerdict = await Verdict.findOne({ asin });
      if (dbVerdict) {
        const verdictObj = dbVerdict.toObject();
        if (isCacheFreshAndValid(verdictObj, new Date(verdictObj.createdAt).getTime())) {
          console.log(`[Cache Hub] MongoDB HIT for ASIN: ${asin}`);
          localMemoryCache.set(asin, { data: verdictObj, createdAt: new Date(verdictObj.createdAt).getTime() });
          try {
            await redisClient.set(cacheKey, JSON.stringify(verdictObj), { ex: 7 * 24 * 60 * 60 });
          } catch (err) { /* ignore */ }

          return res.status(200).json({ cached: true, data: verdictObj });
        }
      }
    } catch (mongoErr) {
      console.error('[Cache Hub] MongoDB check failed:', mongoErr);
    }

    console.log(`[Cache Hub] Cache MISS for ASIN: ${asin}`);
    return res.status(200).json({
      cached: false,
      message: 'ASIN not found in cache.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint to analyze reviews using Gemini and calculate the mathematical verdict.
 * URL: POST /api/v1/verdict
 */
export async function analyzeAndCalculateVerdict(req: Request, res: Response, next: NextFunction) {
  try {
    const validation = AnalyzeRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.format()
      });
    }

    const { asin, title, category, reviews, forceRefresh } = validation.data;

    // Check Cache freshness
    if (!forceRefresh) {
      const local = localMemoryCache.get(asin);
      if (local && isCacheFreshAndValid(local.data, local.createdAt)) {
        return res.status(200).json({ cached: true, data: local.data });
      }

      try {
        const cachedData = await redisClient.get(`verdict:${asin}`);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          if (isCacheFreshAndValid(parsed, new Date(parsed.createdAt).getTime())) {
            localMemoryCache.set(asin, { data: parsed, createdAt: new Date(parsed.createdAt).getTime() });
            return res.status(200).json({ cached: true, data: parsed });
          }
        }
      } catch (err) { /* ignore */ }

      try {
        const dbVerdict = await Verdict.findOne({ asin });
        if (dbVerdict) {
          const verdictObj = dbVerdict.toObject();
          if (isCacheFreshAndValid(verdictObj, new Date(verdictObj.createdAt).getTime())) {
            localMemoryCache.set(asin, { data: verdictObj, createdAt: new Date(verdictObj.createdAt).getTime() });
            return res.status(200).json({ cached: true, data: verdictObj });
          }
        }
      } catch (err) { /* ignore */ }
    }

    console.log(`[Cache Hub] Executing Hybrid Heuristic & LLM Analysis for ASIN: ${asin}. Pool: ${reviews.length} reviews.`);

    // 1. Run Keyword and Rating prioritization
    const { priorityList, originalIndices } = prioritizeReviews(reviews);

    // 2. Select top 25 high-priority reviews + 5 general reviews from the bottom
    const limit = 30;
    const llmReviewsSubset: typeof reviews = [];
    const chosenIndices = new Set<number>();

    // Take top 25 high priority reviews
    const topLimit = Math.min(25, priorityList.length);
    for (let i = 0; i < topLimit; i++) {
      llmReviewsSubset.push(priorityList[i]);
      chosenIndices.add(originalIndices[i]);
    }

    // Fill remaining to 30 from the bottom (representing positive/general reviews)
    let idx = priorityList.length - 1;
    while (llmReviewsSubset.length < Math.min(limit, priorityList.length) && idx >= topLimit) {
      if (!chosenIndices.has(originalIndices[idx])) {
        llmReviewsSubset.push(priorityList[idx]);
        chosenIndices.add(originalIndices[idx]);
      }
      idx--;
    }

    // 3. Query Gemini for the priority reviews subset (saves 70% of LLM costs)
    const llmOutput = await analyzeReviews(title, category, llmReviewsSubset);

    // 4. Heuristic Backfill for the remaining 70 reviews
    const finalReviewsAnalysis: Array<{
      classification: 'none' | 'spam' | 'nuance' | 'degradation' | 'catastrophic' | 'safety';
      persona: 'professional' | 'casual' | 'brand_loyalist' | 'perfectionist' | 'critic';
    }> = new Array(reviews.length);

    // Populate LLM-analyzed indices first
    llmReviewsSubset.forEach((r, subsetIdx) => {
      const originalIdx = originalIndices[subsetIdx];
      finalReviewsAnalysis[originalIdx] = llmOutput.reviews_analysis[subsetIdx] || {
        classification: 'none',
        persona: 'casual'
      };
    });

    // Backfill remaining un-analyzed reviews
    reviews.forEach((r, idx) => {
      if (finalReviewsAnalysis[idx] === undefined) {
        let classification: 'none' | 'spam' | 'nuance' | 'degradation' | 'catastrophic' | 'safety' = 'none';
        let persona: 'professional' | 'casual' | 'brand_loyalist' | 'perfectionist' | 'critic' = 'casual';

        if (r.rating !== undefined) {
          if (r.rating <= 2) {
            classification = 'degradation';
            persona = 'critic';
          } else if (r.rating === 3) {
            classification = 'nuance';
            persona = 'casual';
          }
        }
        finalReviewsAnalysis[idx] = { classification, persona };
      }
    });

    // 5. Re-calculate total counts based on the complete 100+ reviews pool
    let totalSpam = 0;
    let totalFatal = 0;
    let totalNuance = 0;

    finalReviewsAnalysis.forEach((analysis) => {
      if (analysis.classification === 'spam') totalSpam++;
      else if (analysis.classification === 'catastrophic' || analysis.classification === 'safety') totalFatal++;
      else if (analysis.classification === 'nuance' || analysis.classification === 'degradation') totalNuance++;
    });

    const consolidatedLlmOutput = {
      ...llmOutput,
      R_total: reviews.length,
      N_spam: totalSpam,
      N_fatal: totalFatal,
      N_nuance: totalNuance,
      reviews_analysis: finalReviewsAnalysis
    };

    // 6. Run Math Engine over the complete 100+ reviews dataset
    const mathEngineResult = calculateVerdict(reviews, consolidatedLlmOutput);

    const verdictPayload = {
      asin,
      title,
      category,
      llmOutput: consolidatedLlmOutput,
      mathEngineResult,
      createdAt: new Date()
    };

    // 7. Save to database and cache
    await saveToCache(asin, verdictPayload);

    return res.status(200).json({
      cached: false,
      data: verdictPayload
    });
  } catch (error) {
    next(error);
  }
}
