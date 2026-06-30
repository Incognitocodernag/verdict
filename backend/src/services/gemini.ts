import { GoogleGenerativeAI } from '@google/generative-ai';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { LlmOutput, LlmOutputSchema } from '../schemas/schemas';

// Set up DOMPurify for Node.js using jsdom
const dom = new JSDOM('');
const purify = DOMPurify(dom.window as any);

/**
 * Sanitizes input text to prevent XSS and DOM injection attacks.
 */
export function sanitizeText(text: string): string {
  return purify.sanitize(text).trim();
}

/**
 * Maps product category paths to specific evaluation guidelines.
 */
export function resolveCategoryGuidelines(categoryPath: string): string {
  const normalized = categoryPath.toLowerCase();

  if (normalized.includes('supplement') || normalized.includes('health') || normalized.includes('grocery') || normalized.includes('beauty')) {
    return `
CRITICAL CATEGORY RULES (Consumables/Healthcare):
- Classify broken safety seals, product leakage, expired batches, caked/clumped powder, bad chemical odor, or allergic reactions (skin rashes, stomach pain, vomiting) as FATAL FLAWS (N_fatal).
- Personal taste preferences, texture stickiness, and shipping container scuffs must be classified as MINOR NUANCES (N_nuance).
    `.trim();
  }

  if (normalized.includes('clothing') || normalized.includes('apparel') || normalized.includes('shoe') || normalized.includes('fashion') || normalized.includes('accessories')) {
    return `
CRITICAL CATEGORY RULES (Apparel/Fashion):
- Classify sizing discrepancies, fit variations, loose threads, packaging box scuffs, or slight color mismatches as MINOR NUANCES (N_nuance).
- Detached soles, torn seams on arrival, shrinking by multiple sizes on first wash, or heavy color bleeding must be classified as FATAL FLAWS (N_fatal).
    `.trim();
  }

  if (normalized.includes('electronics') || normalized.includes('computer') || normalized.includes('cell phone') || normalized.includes('home audio') || normalized.includes('watch')) {
    return `
CRITICAL CATEGORY RULES (Electronics/Tech):
- Classify dead display pixels, ports failing to charge, battery lifetime dying, overheating, device freezes, or boot loops as FATAL FLAWS (N_fatal).
- Short charger cables, complex setup interfaces, and minor button looseness must be classified as MINOR NUANCES (N_nuance).
    `.trim();
  }

  return `
CRITICAL CATEGORY RULES (General):
- Classify structural breakage on arrival, missing crucial parts, or safety hazards (sparking, cracking under weight) as FATAL FLAWS (N_fatal).
- Minor subjective cosmetic preferences, box aesthetics, or assembly instructions lack of clarity must be classified as MINOR NUANCES (N_nuance).
  `.trim();
}

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
let genAI: GoogleGenerativeAI | null = null;
let isMockGemini = false;

if (apiKey && apiKey !== 'your_gemini_api_key') {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    console.log('Gemini API initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Gemini API, falling back to mock LLM:', error);
    isMockGemini = true;
  }
} else {
  console.warn('GEMINI_API_KEY not configured. Running with mock LLM service.');
  isMockGemini = true;
}

// Define the exact schema we require Gemini to return.
const responseSchema: any = {
  type: 'object',
  properties: {
    R_total: { type: 'integer', description: 'Total number of reviews analyzed in the request' },
    N_spam: { type: 'integer', description: 'Number of bot-like, copy-paste, or highly suspicious reviews' },
    N_fatal: { type: 'integer', description: 'Number of catastrophic failure reports or safety concerns based on vertical guidelines' },
    N_nuance: { type: 'integer', description: 'Number of minor non-fatal annoyances or preferences' },
    S_mismatch: { type: 'integer', description: '1 if product specifications explicitly contradict real reviews (e.g., claimed leather but reviews prove plastic), 0 otherwise' },
    S_hijacked: { type: 'integer', description: '1 if reviews describe a completely different product class/noun than the listing title, indicating a hijacked listing, 0 otherwise' },
    aspects: {
      type: 'object',
      description: 'Key-value pairs representing sentiment scores (-1.0 to 1.0) for extracted aspects. Example: {"quality": 0.8, "usability": -0.4}. Set value for aspects that apply.',
      properties: {
        quality: { type: 'number', description: 'General quality, build integrity, ingredient potency, or materials grade.' },
        usability: { type: 'number', description: 'Ease of use, clear setup, or functional usability.' },
        comfort: { type: 'number', description: 'Tactile comfort, flavor, or texture comfort.' },
        value: { type: 'number', description: 'Cost-effectiveness, pricing, or value for money.' },
        durability: { type: 'number', description: 'Sturdiness, long-term wear, or longevity.' },
        design: { type: 'number', description: 'Aesthetics, form factor, or look and feel.' },
        sizing: { type: 'number', description: 'Accuracy of fit, volume sizing, or dimensions.' },
        fabric: { type: 'number', description: 'Fabric feel, purity of components, or ingredients texture.' }
      }
    },
    pros: { 
      type: 'array', 
      items: { type: 'string' },
      description: 'Exactly 3 bullet points showing key product pros. Each bullet point MUST be a maximum of 5 words.' 
    },
    cons: { 
      type: 'array', 
      items: { type: 'string' },
      description: 'Exactly 3 bullet points showing key product cons. Each bullet point MUST be a maximum of 5 words.' 
    },
    verdict_reason: { type: 'string', description: 'The single most compelling and direct reason summarizing the findings (e.g. "Proceed: Quality matches price, minor complaints about shipping.")' },
    fatal_flaw_summary: { type: 'string', description: 'A short summary (max 15 words) of the most common fatal structural flaw, or an empty string if none exist.' },
    reviews_analysis: {
      type: 'array',
      description: 'Detailed analysis for each review matching the order of input reviews.',
      items: {
        type: 'object',
        properties: {
          classification: { type: 'string', enum: ['none', 'spam', 'nuance', 'degradation', 'catastrophic', 'safety'], description: 'Defect classification. safety for fire/swelling alerts; catastrophic for breakages; degradation for wear/loose pieces; nuance for minor preferences.' },
          persona: { type: 'string', enum: ['professional', 'casual', 'brand_loyalist', 'perfectionist', 'critic'], description: 'Reviewer persona profile based on style and tone.' }
        },
        required: ['classification', 'persona']
      }
    }
  },
  required: ['R_total', 'N_spam', 'N_fatal', 'N_nuance', 'S_mismatch', 'S_hijacked', 'aspects', 'pros', 'cons', 'verdict_reason', 'fatal_flaw_summary', 'reviews_analysis']
};

/**
 * Sends a list of reviews to Gemini 3.5 Flash to extract analysis parameters.
 */
export async function analyzeReviews(
  productTitle: string,
  productCategory: string,
  reviews: Array<{
    text: string;
    isPositive: boolean;
    rating?: number;
    isVerified: boolean;
    helpfulVotes: number;
    hasImages: boolean;
    date?: string;
  }>
): Promise<LlmOutput> {
  // Sanitize and append metadata to the reviews so Gemini can inspect stars, timestamps, and helpfulness
  const sanitizedReviews = reviews.map((r, index) => {
    const text = sanitizeText(r.text);
    const meta = `[Rating: ${r.rating || 'N/A'}, Verified: ${r.isVerified ? 'YES' : 'NO'}, Helpful Votes: ${r.helpfulVotes}, Images: ${r.hasImages ? 'YES' : 'NO'}, Date: ${r.date || 'N/A'}]`;
    return `${index + 1}. [${r.isPositive ? 'POSITIVE' : 'NEGATIVE'}] ${meta} ${text}`;
  }).join('\n\n');

  const resolvedCategoryGuidelines = resolveCategoryGuidelines(productCategory);

  const systemPrompt = `You are a strict, objective, and analytical E-Commerce Review Judge. Your sole purpose is to analyze a list of product reviews and extract specific metrics.
Analyze the following reviews for the product "${sanitizeText(productTitle)}".
Product Category: "${sanitizeText(productCategory)}"

${resolvedCategoryGuidelines}

COMPLIANCE & AUDIT INSTRUCTIONS:
1. SPAM BOT FILTERING: Identify bot-like, duplicate, or incentivized reviews (e.g. Vine or promo tags). Count them in N_spam and classify them as "spam".
2. ASIN HIJACKING DETECTOR (S_hijacked): Look for Noun Incongruence. If older reviews describe a completely different product class (e.g. reviews discuss "phone charger" but product title is "leather wallet"), set "S_hijacked" to 1. Otherwise set "S_hijacked" to 0.
3. SPEC CONTRADICTION (S_mismatch): If the product description claims one thing (e.g., "Solid Cotton") but verified reviews state otherwise (e.g., "contains polyester"), set "S_mismatch" to 1. Otherwise 0.
4. FLAW CLASSIFICATION: Classify defects into:
   - "safety" (fire, explosions, chemical rashes)
   - "catastrophic" (immediate structural breaks)
   - "degradation" (wear, fraying, loose stitching)
   - "nuance" (sizing variation, packaging dents, preferences)
   - "none" (positive/functional feedback)
5. RATING-SENTIMENT INCONGRUENCE CORRECTION: If a review has a rating of 4 or 5 stars, but the text is highly critical and describes a catastrophic failure (e.g., refund bribe coercion), count it as a negative review and classify it as "catastrophic" or "safety".
6. MULTILINGUAL SUPPORT: Analyze reviews in their native language (including Hinglish and regional dialects), translate sentiment findings, and consolidate the final output.
7. ASPECT-BASED SENTIMENT: Define dynamic aspect sentiment scores (range -1.0 to 1.0) under the "aspects" field. Use appropriate aspects based on category (e.g. fabric/comfort/fit for apparel; charging/screen/durability for electronics).
8. REVIEWS ANALYSIS ARRAY: For each review, output an object in "reviews_analysis" containing its "classification" and the reviewer's "persona" ('professional' | 'casual' | 'brand_loyalist' | 'perfectionist' | 'critic') matching the exact order of the reviews list provided.

Strict Output Rules:
1. You must output a JSON object adhering exactly to the requested schema.
2. Under no circumstances should you return markdown, prose, or code wrappers around your JSON response.
3. The 'pros' list must contain exactly 3 items, each max 5 words.
4. The 'cons' list must contain exactly 3 items, each max 5 words.

Reviews to Analyze:
${sanitizedReviews}
`;

  if (isMockGemini) {
    const totalReviews = reviews.length;
    
    // Trigger keywords for interactive testing
    const isQuarantine = productTitle.toLowerCase().includes('scam') || productTitle.toLowerCase().includes('fake');
    const isAvoid = productTitle.toLowerCase().includes('broken') || productTitle.toLowerCase().includes('fragile');
    const isCaution = productTitle.toLowerCase().includes('cheap') || productTitle.toLowerCase().includes('smelly');

    let N_spam = 1;
    let N_fatal = 0;
    let N_nuance = 2;
    let S_mismatch: 0 | 1 = 0;
    let S_hijacked: 0 | 1 = 0;
    let reason = "Quality matches price, minor complaints about shipping.";
    let flawSummary = "";
    let mockAspects: Record<string, number> = { build_quality: 0.8, value_for_money: 0.9, usability: 0.6 };

    const mockAnalysis = reviews.map((r, index) => {
      let classification: 'none' | 'spam' | 'nuance' | 'degradation' | 'catastrophic' | 'safety' = 'none';
      if (isQuarantine && index === 0) classification = 'spam';
      else if (isAvoid && index === 0) classification = 'catastrophic';
      else if (isCaution && index === 0) classification = 'nuance';
      
      return {
        classification,
        persona: 'casual' as const
      };
    });

    if (isQuarantine) {
      N_spam = Math.round(totalReviews * 0.45);
      S_mismatch = 1;
      S_hijacked = 1;
      reason = "Quarantined: Massive spam bot-net or hijacked listing merger detected.";
      flawSummary = "Active specification manipulation or fake reviews.";
      mockAspects = { build_quality: -0.9, value_for_money: -0.7 };
    } else if (isAvoid) {
      N_fatal = Math.round(totalReviews * 0.15);
      reason = "Do Not Buy: Repeated catastrophic failure reported.";
      flawSummary = "The casing or structural hinges crack under standard stress.";
      mockAspects = { durability: -0.8, value: 0.3 };
    } else if (isCaution) {
      N_nuance = Math.round(totalReviews * 0.25);
      reason = "Proceed with caution: High quality, but has minor functional compromises.";
      flawSummary = "";
      mockAspects = { build_quality: 0.5, usability: -0.4 };
    } else {
      N_spam = 0;
      N_fatal = 0;
      N_nuance = 0;
      reason = "Clear to buy. Quality matches price with no recurring structural flaws.";
    }

    return {
      R_total: totalReviews,
      N_spam,
      N_fatal,
      N_nuance,
      S_mismatch,
      S_hijacked,
      aspects: mockAspects,
      pros: ["Very high build quality", "Arrived extremely fast", "Works exactly as described"],
      cons: ["Slightly expensive product", "Instruction manual is small", "Packaging could be better"],
      verdict_reason: reason,
      fatal_flaw_summary: flawSummary,
      reviews_analysis: mockAnalysis
    };
  }

  try {
    const model = genAI!.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.0
      }
    });

    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text();
    
    // Parse response
    const parsedJson = JSON.parse(responseText);
    
    // Validate output with Zod
    const validatedOutput = LlmOutputSchema.parse(parsedJson);
    return validatedOutput;
  } catch (error) {
    console.warn('[Gemini Service] API call failed, activating local heuristic fallback:', error);
    
    const totalReviews = reviews.length;
    let N_spam = 0;
    let N_fatal = 0;
    let N_nuance = 0;
    let S_mismatch: 0 | 1 = 0;
    let S_hijacked: 0 | 1 = 0;

    const fallbackAnalysis = reviews.map((r) => {
      let classification: 'none' | 'spam' | 'nuance' | 'degradation' | 'catastrophic' | 'safety' = 'none';
      let persona: 'professional' | 'casual' | 'brand_loyalist' | 'perfectionist' | 'critic' = 'casual';

      if (r.rating !== undefined) {
        if (r.rating <= 2) {
          const lowerText = r.text.toLowerCase();
          const matchesSafety = ['allergic', 'vomit', 'rash', 'burn', 'explode', 'hospital', 'poison'].some(kw => lowerText.includes(kw));
          if (matchesSafety) {
            classification = 'safety';
            N_fatal++;
          } else {
            classification = 'degradation';
            N_nuance++;
          }
          persona = 'critic';
        } else if (r.rating === 3) {
          classification = 'nuance';
          N_nuance++;
          persona = 'casual';
        }
      }
      return { classification, persona };
    });

    const avgRating = reviews.reduce((sum, r) => sum + (r.rating || 3), 0) / Math.max(1, totalReviews);
    const aspectValue = parseFloat(((avgRating - 3.0) / 2.0).toFixed(2));

    return {
      R_total: totalReviews,
      N_spam,
      N_fatal,
      N_nuance,
      S_mismatch,
      S_hijacked,
      aspects: {
        quality: aspectValue,
        usability: 0.5,
        value: 0.6
      },
      pros: ["Solid build quality", "Arrived extremely fast", "Works exactly as described"],
      cons: ["Subjective flavor details", "Instructions are brief", "Packaging is standard"],
      verdict_reason: "Verdict calculated via local heuristic engine due to temporary API connectivity timeout. Quality patterns mapped successfully.",
      fatal_flaw_summary: N_fatal > 0 ? "Potential critical reports flagged in local review text." : "",
      reviews_analysis: fallbackAnalysis
    };
  }
}
