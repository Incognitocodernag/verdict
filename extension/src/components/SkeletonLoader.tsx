import { useState, useEffect } from 'react';

/**
 * Animated Loading Skeleton redesigned in a premium light-mode material theme.
 * Integrates smoothly with the new clean panel visual identity.
 */
export function SkeletonLoader() {
  const [statusMsg, setStatusMsg] = useState('Reading top reviews...');

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setStatusMsg('Hunting for hidden return fees...');
    }, 1500);

    const timer2 = setTimeout(() => {
      setStatusMsg('Calculating authenticity score...');
    }, 3000);

    const timer3 = setTimeout(() => {
      setStatusMsg('Verifying specification consistency...');
    }, 4500);

    const timer4 = setTimeout(() => {
      setStatusMsg('Finalizing verdict decree...');
    }, 6000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-700 font-sans p-6 space-y-5 animate-slideIn">
      {/* Product Title Skeleton */}
      <div className="animate-pulse bg-white border border-slate-100 rounded-2xl p-4.5 shadow-sm space-y-2">
        <div className="h-3 bg-slate-100 rounded w-1/4"></div>
        <div className="h-4.5 bg-slate-100 rounded w-5/6"></div>
      </div>

      {/* Hero Module Skeleton */}
      <div className="animate-pulse flex flex-col space-y-3 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <div className="h-3 bg-slate-100 rounded w-1/3"></div>
        <div className="h-8 bg-slate-100 rounded w-2/3"></div>
        <div className="h-4 bg-slate-100 rounded w-full"></div>
      </div>

      {/* Dynamic Status Progress Message */}
      <div className="flex items-center space-x-3 bg-indigo-50/60 border border-indigo-100/70 rounded-2xl px-4.5 py-3.5 shadow-sm">
        <div className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
        </div>
        <p className="text-xs font-semibold text-indigo-700 tracking-wide">
          {statusMsg}
        </p>
      </div>

      {/* Fatal Flaw Module Skeleton */}
      <div className="animate-pulse flex items-start space-x-4 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <div className="rounded-xl bg-slate-100 h-9 w-9 flex-shrink-0"></div>
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-slate-100 rounded w-1/4"></div>
          <div className="h-3.5 bg-slate-100 rounded w-full"></div>
        </div>
      </div>

      {/* Pros & Cons List Skeleton */}
      <div className="animate-pulse flex-1 flex flex-col space-y-4 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm justify-between">
        <div className="space-y-3">
          <div className="h-3.5 bg-slate-100 rounded w-1/3"></div>
          <div className="space-y-2.5">
            <div className="h-3 bg-slate-100 rounded w-11/12"></div>
            <div className="h-3 bg-slate-100 rounded w-10/12"></div>
            <div className="h-3 bg-slate-100 rounded w-11/12"></div>
          </div>
        </div>
        
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="h-3.5 bg-slate-100 rounded w-1/3"></div>
          <div className="space-y-2.5">
            <div className="h-3 bg-slate-100 rounded w-11/12"></div>
            <div className="h-3 bg-slate-100 rounded w-10/12"></div>
            <div className="h-3 bg-slate-100 rounded w-11/12"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
