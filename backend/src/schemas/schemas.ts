import { z } from 'zod';

/**
 * Validates the raw structured JSON output returned from the Gemini LLM.
 */
export const LlmOutputSchema = z.object({
  R_total: z.number().int().nonnegative(),
  N_spam: z.number().int().nonnegative(),
  N_fatal: z.number().int().nonnegative(),
  N_nuance: z.number().int().nonnegative(),
  S_mismatch: z.union([z.literal(0), z.literal(1)]),
  S_hijacked: z.union([z.literal(0), z.literal(1)]),
  aspects: z.record(z.number()), // Dynamic aspect-based sentiment ratings (-1 to 1)
  pros: z.array(z.string()).length(3),
  cons: z.array(z.string()).length(3),
  verdict_reason: z.string().min(1),
  fatal_flaw_summary: z.string(),
  reviews_analysis: z.array(
    z.object({
      classification: z.enum(['none', 'spam', 'nuance', 'degradation', 'catastrophic', 'safety']),
      persona: z.enum(['professional', 'casual', 'brand_loyalist', 'perfectionist', 'critic'])
    })
  )
});

export type LlmOutput = z.infer<typeof LlmOutputSchema>;

/**
 * Validates the analysis request body POSTed by the extension.
 */
export const AnalyzeRequestSchema = z.object({
  asin: z.string().min(1),
  title: z.string().min(1),
  category: z.string().default('Uncategorized'),
  forceRefresh: z.boolean().optional(),
  reviews: z.array(
    z.object({
      text: z.string().min(1),
      rating: z.number().min(1).max(5).optional(),
      date: z.string().optional(),
      isPositive: z.boolean(),
      isVerified: z.boolean(),
      helpfulVotes: z.number(),
      hasImages: z.boolean()
    })
  ).min(1)
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
