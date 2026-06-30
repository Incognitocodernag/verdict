import { LlmOutput } from '../schemas/schemas';
import { IMathEngineResult } from '../models/verdictModel';

export interface EnrichedReviewInput {
  date?: string;
  isVerified: boolean;
  helpfulVotes: number;
  rating?: number;
}

/**
 * Calculates the product evaluation verdict using a multi-factor weighted mathematical model.
 * Handles low-review volume edge cases.
 */
export function calculateVerdict(
  rawReviews: Array<EnrichedReviewInput>,
  llmOutput: LlmOutput
): IMathEngineResult {
  const { S_mismatch, S_hijacked, reviews_analysis } = llmOutput;

  // 1. Edge Case: 0 Reviews -> INSUFFICIENT DATA
  if (rawReviews.length === 0) {
    return {
      A: 1.0,
      F_f: 0.0,
      C_f: 0.0,
      tier: 5,
      verdictDirective: 'INSUFFICIENT DATA',
      badgeColor: 'gray',
      lowVolume: false
    };
  }

  // 2. Determine if low-volume warning is active (1 to 9 reviews)
  const lowVolume = rawReviews.length < 10;

  let W_total = 0;
  let W_spam = 0;
  let W_defect_sum = 0;
  let W_nuance_sum = 0;
  let hasCriticalSafety = false;

  const now = Date.now();
  const LAMBDA = 0.0077; // 90-day half-life decay constant

  // Loop through and calculate weights
  rawReviews.forEach((r, i) => {
    const analysis = reviews_analysis[i] || { classification: 'none', persona: 'casual' };
    const defectTier = analysis.classification;
    const persona = analysis.persona;

    // Temporal decay
    const reviewTime = r.date ? new Date(r.date).getTime() : now;
    const diffDays = Math.max(0, (now - reviewTime) / (1000 * 60 * 60 * 24));
    const W_time = Math.exp(-LAMBDA * diffDays);

    // Metadata verified Buy & Helpfulness log scaling
    const verifiedFactor = r.isVerified ? 1.5 : 0.8;
    const helpfulFactor = 1.0 + Math.log10(1 + r.helpfulVotes);
    const W_meta = verifiedFactor * helpfulFactor;

    // Reviewer Persona multipliers
    const personaMultipliers = {
      professional: 2.0,
      casual: 1.0,
      brand_loyalist: 0.8,
      perfectionist: 0.7,
      critic: 0.5
    };
    const M_persona = personaMultipliers[persona] || 1.0;

    // Product Lifecycle multipliers
    let M_lifecycle = 1.0;
    if (diffDays <= 3) {
      M_lifecycle = 0.3; // Unboxing phase
    } else if (diffDays <= 30) {
      M_lifecycle = 0.8; // Active use
    } else if (diffDays > 90) {
      M_lifecycle = 1.5; // Long term durability
    }

    // Congruence check (Rating-sentiment mismatch)
    const isMajorDefect = defectTier === 'catastrophic' || defectTier === 'safety';
    const isStarMismatched = isMajorDefect && r.rating !== undefined && r.rating >= 4;
    const M_congruence = isStarMismatched ? 0.5 : 1.0;

    // Combined weight
    const W_i = W_meta * W_time * M_persona * M_lifecycle * M_congruence;
    W_total += W_i;

    if (defectTier === 'spam') {
      W_spam += W_i;
    } else {
      if (defectTier === 'safety') {
        W_defect_sum += W_i * 5.0;
        hasCriticalSafety = true;
      } else if (defectTier === 'catastrophic') {
        W_defect_sum += W_i * 3.0;
      } else if (defectTier === 'degradation') {
        W_defect_sum += W_i * 1.0;
      } else if (defectTier === 'nuance') {
        W_nuance_sum += W_i * 0.2;
      }
    }
  });

  // Calculate Ratios
  const A = W_total > 0 ? parseFloat((1.0 - (W_spam / W_total)).toFixed(4)) : 1.0;
  const W_organic = W_total - W_spam;

  const F_f = W_organic > 0 ? parseFloat((W_defect_sum / W_organic).toFixed(4)) : 0.0;
  const C_f = W_organic > 0 ? parseFloat((W_nuance_sum / W_organic).toFixed(4)) : 0.0;

  // Decision Tiers Routing

  // TIER 4: QUARANTINE Check
  if (A <= 0.60 || S_mismatch === 1 || S_hijacked === 1) {
    return {
      A,
      F_f,
      C_f,
      tier: 4,
      verdictDirective: 'QUARANTINE',
      badgeColor: 'black',
      lowVolume
    };
  }

  // TIER 3: AVOID Check
  if (F_f >= 0.36 || hasCriticalSafety) {
    return {
      A,
      F_f,
      C_f,
      tier: 3,
      verdictDirective: 'AVOID',
      badgeColor: 'red',
      lowVolume
    };
  }

  // TIER 2: CAUTION Check
  if (C_f >= 0.20 || F_f >= 0.12) {
    return {
      A,
      F_f,
      C_f,
      tier: 2,
      verdictDirective: 'CAUTION',
      badgeColor: 'yellow',
      lowVolume
    };
  }

  // TIER 1: CLEAR TO BUY Check
  return {
    A,
    F_f,
    C_f,
    tier: 1,
    verdictDirective: 'CLEAR TO BUY',
    badgeColor: 'green',
    lowVolume
  };
}
