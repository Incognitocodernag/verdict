import React from 'react';
import ReactDOM from 'react-dom/client';
import { ShieldCheck, Info } from 'lucide-react';
import './style.css'; // Load global Tailwind styles compiled for the popup page

/**
 * Renders the toolbar action popup interface.
 */
function Popup() {
  return (
    <div className="w-[320px] bg-slate-950 text-slate-100 p-5 font-sans border border-slate-900 rounded-xl space-y-4 select-none">
      {/* Header */}
      <div className="flex items-center space-x-2 pb-3 border-b border-slate-900">
        <div className="bg-indigo-600 text-white rounded-lg p-1.5 font-black text-xs tracking-wider">
          VT
        </div>
        <span className="font-extrabold text-md tracking-tight">Verdict Dashboard</span>
      </div>

      {/* Status Card */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-2 text-center">
        <div className="inline-flex p-2 bg-emerald-500/10 text-emerald-400 rounded-full">
          <ShieldCheck className="w-6 h-6 animate-pulse" />
        </div>
        <h3 className="text-sm font-bold text-slate-200">Decision Engine Ready</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Open any Amazon product page. Click the floating "Analyze Verdict" button on the bottom right to trigger evaluation.
        </p>
      </div>

      {/* Zero PII Notice */}
      <div className="text-[10px] text-slate-500 flex items-start space-x-2 pt-2">
        <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />
        <span className="leading-relaxed">
          Verdict operates under zero tracking. We do not require accounts, logins, or gather browsing histories. Product details are evaluated completely anonymously.
        </span>
      </div>
      
      <div className="text-center text-[9px] text-slate-700 pt-2 border-t border-slate-900/60">
        Verdict Decision Engine • Version 1.0.0
      </div>
    </div>
  );
}

const rootEl = document.getElementById('popup-root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}
