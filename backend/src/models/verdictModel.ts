import { Schema, model, Document } from 'mongoose';
import { LlmOutput } from '../schemas/schemas';

export interface IMathEngineResult {
  A: number;       // Authenticity Coefficient (0.00 to 1.00)
  F_f: number;     // Weighted Defect Frequency
  C_f: number;     // Weighted Nuance Frequency
  tier: number;    // Assigned Tier (1 to 5)
  verdictDirective: 'CLEAR TO BUY' | 'CAUTION' | 'AVOID' | 'QUARANTINE' | 'INSUFFICIENT DATA';
  badgeColor: 'green' | 'yellow' | 'red' | 'black' | 'gray';
  lowVolume?: boolean; // Flag for low volume warning (1-9 reviews)
}

export interface IVerdict extends Document {
  asin: string;
  title: string;
  category: string;
  llmOutput: LlmOutput;
  mathEngineResult: IMathEngineResult;
  createdAt: Date;
}

const MathEngineResultSchema = new Schema<IMathEngineResult>({
  A: { type: Number, required: true },
  F_f: { type: Number, required: true },
  C_f: { type: Number, required: true },
  tier: { type: Number, required: true, min: 1, max: 5 },
  verdictDirective: { type: String, required: true, enum: ['CLEAR TO BUY', 'CAUTION', 'AVOID', 'QUARANTINE', 'INSUFFICIENT DATA'] },
  badgeColor: { type: String, required: true, enum: ['green', 'yellow', 'red', 'black', 'gray'] },
  lowVolume: { type: Boolean, default: false }
}, { _id: false });

const ReviewAnalysisSchema = new Schema({
  classification: { type: String, required: true, enum: ['none', 'spam', 'nuance', 'degradation', 'catastrophic', 'safety'] },
  persona: { type: String, required: true, enum: ['professional', 'casual', 'brand_loyalist', 'perfectionist', 'critic'] }
}, { _id: false });

const LlmOutputSchema = new Schema<LlmOutput>({
  R_total: { type: Number, required: true },
  N_spam: { type: Number, required: true },
  N_fatal: { type: Number, required: true },
  N_nuance: { type: Number, required: true },
  S_mismatch: { type: Number, required: true, enum: [0, 1] },
  S_hijacked: { type: Number, required: true, enum: [0, 1] },
  aspects: { type: Schema.Types.Mixed, required: true }, // Dynamic aspect-based sentiment map
  pros: { type: [String], required: true },
  cons: { type: [String], required: true },
  verdict_reason: { type: String, required: true },
  fatal_flaw_summary: { type: String, default: '' },
  reviews_analysis: { type: [ReviewAnalysisSchema], required: true }
}, { _id: false });

const VerdictSchema = new Schema<IVerdict>({
  asin: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  category: { type: String, default: 'Uncategorized' },
  llmOutput: { type: LlmOutputSchema, required: true },
  mathEngineResult: { type: MathEngineResultSchema, required: true },
  createdAt: { type: Date, default: Date.now, expires: 30 * 24 * 60 * 60 } // TTL: 30 days
});

export const Verdict = model<IVerdict>('Verdict', VerdictSchema);
