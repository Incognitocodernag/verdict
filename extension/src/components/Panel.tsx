import { useState } from 'react';
import { 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  ShieldAlert, 
  Settings,
  HelpCircle,
  HeartCrack,
  FileText,
  Lock,
  ThumbsUp,
  ThumbsDown,
  ChevronRight,
  ArrowLeft,
  Info
} from 'lucide-react';
import { VerdictLogo } from '../App';

interface LlmOutput {
  R_total: number;
  N_spam: number;
  N_fatal: number;
  N_nuance: number;
  S_mismatch: number;
  S_hijacked: number;
  aspects: Record<string, number>;
  pros: string[];
  cons: string[];
  verdict_reason: string;
  fatal_flaw_summary: string;
}

interface MathEngineResult {
  A: number;
  F_f: number;
  C_f: number;
  tier: number;
  verdictDirective: 'CLEAR TO BUY' | 'CAUTION' | 'AVOID' | 'QUARANTINE' | 'INSUFFICIENT DATA';
  badgeColor: 'green' | 'yellow' | 'red' | 'black' | 'gray';
  lowVolume?: boolean;
}

interface VerdictData {
  asin: string;
  title: string;
  category: string;
  llmOutput: LlmOutput;
  mathEngineResult: MathEngineResult;
  createdAt: string;
}

interface PanelProps {
  data: VerdictData;
  onClose: () => void;
  onRefresh: () => void;
}

/**
 * Premium SVG Circular Progress Gauge for dashboard metrics.
 */
function CircularProgress({ value, label, colorClass, colorStroke }: { value: number; label: string; colorClass: string; colorStroke: string }) {
  const radius = 28;
  const stroke = 5;
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="flex flex-col items-center space-y-2 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex-1 text-center">
      <div className="relative flex items-center justify-center w-14 h-14">
        <svg className="w-full h-full transform -rotate-90">
          <circle stroke="#f1f5f9" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={28} cy={28} />
          <circle 
            stroke={colorStroke} 
            fill="transparent" 
            strokeWidth={stroke} 
            strokeDasharray={circumference + ' ' + circumference} 
            style={{ strokeDashoffset }} 
            strokeLinecap="round" 
            r={normalizedRadius} 
            cx={28} 
            cy={28} 
          />
        </svg>
        <span className={`absolute text-[11px] font-black tracking-tighter ${colorClass}`}>{value}%</span>
      </div>
      <span className="text-[8px] font-black tracking-widest text-slate-400 uppercase">{label}</span>
    </div>
  );
}

export function Panel({ data, onClose, onRefresh }: PanelProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  
  const { title, category, llmOutput, mathEngineResult } = data;
  const { A, F_f, C_f, tier, verdictDirective } = mathEngineResult;

  const authenticityPct = Math.round(A * 100);

  // Styling helper for the Hero Banner matching BuyHatke material styling
  const getHeroStyles = () => {
    // If listing hijacked override
    if (llmOutput.S_hijacked === 1) {
      return {
        cardBg: 'bg-slate-900 border-slate-800 border-l-purple-600 shadow-[0_4px_20px_rgba(147,51,234,0.08)]',
        titleColor: 'text-slate-100',
        descColor: 'text-slate-400',
        badgeBg: 'bg-purple-600 text-white',
        badgeText: 'LISTING HIJACK DETECTED',
        icon: <ShieldAlert className="w-6 h-6 text-purple-400 animate-pulse" />
      };
    }

    switch (tier) {
      case 1:
        return {
          cardBg: 'bg-emerald-50/80 border-emerald-100 border-l-emerald-500',
          titleColor: 'text-emerald-950',
          descColor: 'text-emerald-800/90',
          badgeBg: 'bg-emerald-500 text-white',
          badgeText: 'SECURE PURCHASE',
          icon: <ShieldCheck className="w-6 h-6 text-emerald-600" />
        };
      case 2:
        return {
          cardBg: 'bg-amber-50/90 border-amber-200 border-l-amber-500',
          titleColor: 'text-amber-950',
          descColor: 'text-amber-850/90',
          badgeBg: 'bg-amber-500 text-white',
          badgeText: 'PROCEED WITH CAUTION',
          icon: <HelpCircle className="w-6 h-6 text-amber-600" />
        };
      case 3:
        return {
          cardBg: 'bg-rose-50/85 border-rose-150 border-l-rose-500',
          titleColor: 'text-rose-950',
          descColor: 'text-rose-850/90',
          badgeBg: 'bg-rose-600 text-white',
          badgeText: 'CRITICAL FAILURE RISK',
          icon: <AlertTriangle className="w-6 h-6 text-rose-600" />
        };
      case 5:
        return {
          cardBg: 'bg-slate-50 border-slate-200 border-l-slate-400',
          titleColor: 'text-slate-700',
          descColor: 'text-slate-500',
          badgeBg: 'bg-slate-400 text-white',
          badgeText: 'INSUFFICIENT REVIEW DATA',
          icon: <Info className="w-6 h-6 text-slate-500" />
        };
      case 4:
      default:
        return {
          cardBg: 'bg-slate-950 border-slate-900 border-l-red-600 shadow-md',
          titleColor: 'text-slate-100',
          descColor: 'text-slate-400',
          badgeBg: 'bg-red-600 text-white',
          badgeText: 'SPECIFICATION FRAUD DETECTED',
          icon: <ShieldAlert className="w-6 h-6 text-red-500" />
        };
    }
  };

  const hero = getHeroStyles();

  return (
    <div className="flex flex-col h-full bg-white text-slate-700 font-sans relative select-none animate-slideIn">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white/95 backdrop-blur-md sticky top-0 z-10 shadow-sm shadow-slate-100/50">
        <div className="flex items-center space-x-2">
          <div className="bg-indigo-50 p-1 rounded-xl shadow-sm text-indigo-600">
            <VerdictLogo className="w-7 h-7" />
          </div>
          <span className="font-extrabold text-md tracking-tight text-slate-800">
            Verdict Decision Engine
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button 
            onClick={onRefresh}
            className="p-2 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-indigo-600 transition-colors"
            title="Force Re-Analyze Listing (Bypass Cache)"
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
          </button>
          <button 
            onClick={() => {
              setShowSettings(!showSettings);
              setShowAuditTrail(false);
            }}
            className={`p-2 rounded-lg hover:bg-slate-50 transition-colors ${showSettings ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-400 hover:text-slate-600'}`}
            title="Privacy Compliance Logs"
          >
            <Settings className="w-4.5 h-4.5" />
          </button>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-rose-500 transition-colors"
            title="Close Panel"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {showSettings ? (
        /* Settings Sheet Overlay */
        <div className="flex-1 flex flex-col p-5 space-y-5 bg-slate-50 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase">
              COMPLIANCE LOGS & SETTINGS
            </h3>
            <button 
              onClick={() => setShowSettings(false)}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-bold"
            >
              Back to analysis
            </button>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-sm space-y-3">
            <div className="flex items-center space-x-2.5 text-indigo-600">
              <Lock className="w-4 h-4" />
              <h4 className="font-bold text-xs uppercase tracking-wider">Zero-PII Privacy Protection</h4>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Verdict operates with zero tracking logs and collects no personally identifiable information (PII). No accounts, cookies, or registration keys are utilized in our architecture.
            </p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-sm space-y-3">
            <div className="flex items-center space-x-2.5 text-rose-500">
              <ShieldAlert className="w-4 h-4" />
              <h4 className="font-bold text-xs uppercase tracking-wider">Liability Disclaimer</h4>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed italic">
              "Verdict uses AI to aggregate and analyze public user reviews. It is an informational tool, not a guarantee of product quality, safety, or authenticity. Verdict and its developers assume no liability for purchases made based on these algorithmic summaries."
            </p>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-sm space-y-3">
            <div className="flex items-center space-x-2.5 text-slate-700">
              <FileText className="w-4 h-4" />
              <h4 className="font-bold text-xs uppercase tracking-wider">Store Justification</h4>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Verdict runs on standard Chrome <code>activeTab</code> and <code>scripting</code> permissions solely to load reviews and ASIN information directly in your active tab. Single purpose is to consolidate public data and bypass analysis paralysis.
            </p>
          </div>
          
          <div className="text-center text-[10px] text-slate-400 pt-4">
            Document: VERDICT-LEG-001 • Version 2.0.0
          </div>
        </div>
      ) : showAuditTrail ? (
        /* Audit Trail Sub-Panel (Math & Aspect Sentiment Details) */
        <div className="flex-1 flex flex-col p-5 space-y-5 bg-slate-50 overflow-y-auto">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setShowAuditTrail(false)}
              className="flex items-center space-x-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-bold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to summary</span>
            </button>
            <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full tracking-widest">
              ASPECTS & RATINGS
            </span>
          </div>

          {/* Math Computations Row of Circular Progress Gauges */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-sm space-y-4">
            <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase">
              Summary Metrics
            </h3>

            {tier === 5 ? (
              <p className="text-[11px] text-slate-400 text-center py-4">
                Math metrics cannot be calculated without reviews.
              </p>
            ) : (
              <div className="flex space-x-3.5">
                <CircularProgress 
                  value={authenticityPct} 
                  label="Review Trust" 
                  colorClass="text-emerald-600" 
                  colorStroke="#10b981" 
                />
                <CircularProgress 
                  value={Math.round(F_f * 100)} 
                  label="Reported Defects" 
                  colorClass={F_f >= 0.36 ? 'text-rose-600' : F_f >= 0.12 ? 'text-amber-500' : 'text-emerald-500'} 
                  colorStroke={F_f >= 0.36 ? '#ef4444' : F_f >= 0.12 ? '#f59e0b' : '#10b981'} 
                />
                <CircularProgress 
                  value={Math.round(C_f * 100)} 
                  label="Minor Complaints" 
                  colorClass="text-indigo-600" 
                  colorStroke="#6366f1" 
                />
              </div>
            )}
          </div>

          {/* Dynamic Aspects Sentiment Scores */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-sm space-y-4">
            <h3 className="text-xs font-black tracking-widest text-slate-400 uppercase">
              Features Analysis
            </h3>

            {tier === 5 || !llmOutput.aspects || Object.entries(llmOutput.aspects).length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-4">
                No aspect sentiment parameters parsed for this category.
              </p>
            ) : (
              <div className="space-y-4">
                {Object.entries(llmOutput.aspects || {}).map(([key, value]) => {
                  const percent = Math.round(((value + 1.0) / 2.0) * 100);
                  const formatKey = key.replace(/_/g, ' ').toUpperCase();
                  
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span className="capitalize">{formatKey}</span>
                        <span className={value >= 0.2 ? 'text-emerald-600' : value <= -0.2 ? 'text-rose-500' : 'text-slate-500'}>
                          {value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-200 z-10" />
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${value >= 0.2 ? 'bg-emerald-500' : value <= -0.2 ? 'bg-rose-500' : 'bg-slate-400'}`} 
                          style={{ width: `${percent}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center space-x-3 text-slate-400">
            <FileText className="w-5 h-5 flex-shrink-0" />
            <p className="text-[10px] leading-relaxed">
              Verdict weights scores based on review recency, voter helpfulness, and verified purchaser status.
            </p>
          </div>
        </div>
      ) : (
        /* Core Dashboard */
        <div className="flex-1 flex flex-col p-5 space-y-5 overflow-y-auto bg-slate-50/50">
          
          {/* Product Info Card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="inline-block text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full tracking-widest">
                ASIN: {data.asin}
              </span>
              <span className="inline-block text-[9px] font-bold text-slate-400 line-clamp-1 truncate max-w-[200px]">
                {category}
              </span>
            </div>
            <h2 className="text-[13px] font-bold text-slate-800 leading-relaxed line-clamp-2" title={title}>
              {title}
            </h2>
          </div>

          {/* Low Volume Warning Alert Banner */}
          {mathEngineResult.lowVolume && tier !== 5 && (
            <div className="bg-amber-50 border border-amber-100 border-l-4 border-l-amber-500 rounded-2xl p-3.5 flex items-start space-x-3 shadow-sm">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-600 flex-shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-0.5">
                <h5 className="text-[10px] font-black uppercase tracking-wider text-amber-700">LOW REVIEW VOLUME</h5>
                <p className="text-[10px] text-slate-600 leading-relaxed font-semibold">
                  This listing has under 10 reviews. Mathematical metrics have wider statistical error margins.
                </p>
              </div>
            </div>
          )}

          {/* Hero Banner (Clean Border Left Accent) */}
          <div className={`border border-l-4 rounded-2xl p-4.5 flex items-start space-x-4 shadow-sm relative overflow-hidden transition-all duration-300 ${hero.cardBg}`}>
            <div className="p-2 bg-white rounded-xl shadow-sm flex-shrink-0">
              {hero.icon}
            </div>
            <div className="space-y-1.5 flex-1">
              <span className={`inline-block text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full ${hero.badgeBg}`}>
                {hero.badgeText}
              </span>
              <h1 className={`text-2xl font-black tracking-tight uppercase ${hero.titleColor}`}>
                {llmOutput.S_hijacked === 1 ? 'QUARANTINE' : verdictDirective}
              </h1>
              <p className={`text-[12px] font-medium leading-relaxed ${hero.descColor}`}>
                {tier === 5 
                  ? "This product has zero reviews. Verdict cannot formulate a mathematical analysis or trust rating."
                  : llmOutput.S_hijacked === 1 
                    ? "Listing Hijack Detected. Older reviews discuss a completely unrelated product vertical. Avoid buying."
                    : llmOutput.verdict_reason
                }
              </p>
            </div>
          </div>

          {tier === 5 ? (
            /* Insufficient Data Layout (Empty State) */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-full text-slate-400">
                <Info className="w-10 h-10" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">NO USER REVIEWS FOUND</h4>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
                To prevent false positives, Verdict requires a minimum review volume to formulate authenticity or defect ratings. Check back once purchasers post reviews on this listing.
              </p>
            </div>
          ) : (
            /* Standard Dashboard Content */
            <>
              {/* Deep Insight TL;DR Panel */}
              <div className="bg-gradient-to-r from-indigo-50/50 to-indigo-100/10 border border-slate-100 rounded-2xl p-4 flex items-start space-x-3.5 shadow-sm">
                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg flex-shrink-0">
                  <Info className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
                    VERDICT AUDIT INSIGHT
                  </h4>
                  <p className="text-[11px] text-slate-650 leading-relaxed font-medium">
                    {llmOutput.S_hijacked === 1 
                      ? "SCAM PATTERN: The seller has merged this listing with an old highly-rated listing to hijack its review stars. The original items described in historical reviews are incongruent with the current product."
                      : llmOutput.S_mismatch === 1
                        ? "SPECIFICATION GAP: The reviews show a clear discrepancy with the seller's advertised specifications (e.g. materials, sizes, functions)."
                        : "STABILITY THREAT: Authentic reviews verify consistent structural features. Check the ABSA sliders for component sentiment."
                    }
                  </p>
                </div>
              </div>

              {/* Fatal Flaw Warning Module */}
              {llmOutput.fatal_flaw_summary ? (
                <div className="bg-red-50/60 border border-red-100 border-l-4 border-l-red-500 rounded-2xl p-4 flex items-start space-x-3.5 shadow-sm">
                  <div className="p-1.5 bg-red-100 text-red-600 rounded-lg flex-shrink-0">
                    <HeartCrack className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-red-700">
                      RECURRING FATAL FLAW DETECTED
                    </h4>
                    <p className="text-xs text-slate-605 leading-relaxed font-medium">
                      {llmOutput.fatal_flaw_summary}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center space-x-3.5 shadow-sm">
                  <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg flex-shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                      NO STRUCTURAL FLAWS
                    </h4>
                    <p className="text-[11px] text-slate-405 leading-normal">
                      Zero recurring catastrophic failures reported in verified reviews.
                    </p>
                  </div>
                </div>
              )}

              {/* Authenticity Module */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Review Authenticity Meter
                    </span>
                    <h3 className="text-sm font-bold text-slate-800">
                      {authenticityPct}% Organic Reviews
                    </h3>
                  </div>
                  <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                    authenticityPct >= 85 
                      ? 'bg-emerald-50 text-emerald-700' 
                      : authenticityPct >= 60 
                        ? 'bg-amber-50 text-amber-700' 
                        : 'bg-rose-50 text-rose-700'
                  }`}>
                    {authenticityPct >= 85 ? 'HIGH INTEGRITY' : authenticityPct >= 60 ? 'INCENTIVIZED' : 'SPAM BOT ALERT'}
                  </span>
                </div>

                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden relative">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      authenticityPct >= 85 ? 'bg-emerald-500' : authenticityPct >= 60 ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                    style={{ width: `${authenticityPct}%` }}
                  />
                </div>
                
                <p className="text-[11px] text-slate-400 leading-normal font-medium">
                  {llmOutput.N_spam > 0 
                    ? `${llmOutput.N_spam} bot-like or incentivized reviews filtered out of ${llmOutput.R_total} parsed reviews.`
                    : `Verified reviews indicate organic purchaser sentiment.`
                  }
                </p>
              </div>

              {/* Pros & Cons Card */}
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-700 text-xs font-extrabold tracking-wide uppercase">
                    <ThumbsUp className="w-4 h-4 text-emerald-500" />
                    <span>Product Pros (Helpful Sentiment)</span>
                  </div>
                  <ul className="space-y-2.5">
                    {(llmOutput.pros || []).map((pro, i) => (
                      <li key={i} className="flex items-start space-x-2.5 text-xs text-slate-650 font-medium leading-relaxed">
                        <div className="p-0.5 bg-emerald-50 text-emerald-500 rounded-full flex-shrink-0 mt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <span>{pro}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-slate-100 my-2" />

                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-rose-700 text-xs font-extrabold tracking-wide uppercase">
                    <ThumbsDown className="w-4 h-4 text-rose-500" />
                    <span>Product Cons (Flaws & Nuances)</span>
                  </div>
                  <ul className="space-y-2.5">
                    {(llmOutput.cons || []).map((con, i) => (
                      <li key={i} className="flex items-start space-x-2.5 text-xs text-slate-650 font-medium leading-relaxed">
                        <div className="p-0.5 bg-rose-50 text-rose-500 rounded-full flex-shrink-0 mt-0.5">
                          <XCircle className="w-3.5 h-3.5" />
                        </div>
                        <span>{con}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Audit Trail Navigation Trigger Button */}
              <button 
                onClick={() => setShowAuditTrail(true)}
                className="w-full bg-white hover:bg-slate-50 border border-slate-150 text-slate-705 font-bold py-3.5 px-4 rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-sm cursor-pointer hover:shadow-md"
              >
                <span>View Product Aspects</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Footer Metrics */}
          <div className="flex flex-col space-y-2 pt-3 border-t border-slate-100/60">
            <div className="flex items-center justify-between text-[9px] text-slate-400 px-1">
              <span className="flex items-center space-x-1 font-semibold">
                <span>Aggregated Reviews: {llmOutput.R_total}</span>
                {tier !== 5 && (
                  <span 
                    className="text-indigo-600 cursor-help underline hover:text-indigo-800" 
                    title="Verdict analyzes a representative sample of reviews (recent, helpful, and historical) to deliver instant analysis without rate limits."
                  >
                    (Why?)
                  </span>
                )}
              </span>
              <span>Refreshed 7 Days ago</span>
            </div>
            {tier !== 5 && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-start space-x-2 text-slate-405">
                <Info className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                <p className="text-[9px] leading-relaxed">
                  Verdict analyzes a representative sample of reviews (including recent, helpful, and historical reviews) to calculate scores instantly.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
