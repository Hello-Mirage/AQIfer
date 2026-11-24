"use client";

import React from "react";
import { Sun, Home, Compass, Info, CheckCircle2 } from "lucide-react";
import { AISmogPlan } from "@/types";

interface Props {
  plan: AISmogPlan | null;
  loading: boolean;
}

export function AISmogPlanCards({ plan, loading }: Props) {
  if (loading || !plan) {
    return (
      <div className="w-full space-y-4 animate-pulse">
        <div className="h-20 bg-slate-900/60 rounded-3xl border border-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-56 bg-slate-900/60 rounded-3xl border border-slate-800" />
          <div className="h-56 bg-slate-900/60 rounded-3xl border border-slate-800" />
          <div className="h-56 bg-slate-900/60 rounded-3xl border border-slate-800" />
        </div>
      </div>
    );
  }

  const getRiskColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case "low":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      case "moderate":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "high":
        return "bg-orange-500/20 text-orange-300 border-orange-500/30";
      default:
        return "bg-rose-500/20 text-rose-300 border-rose-500/30";
    }
  };

  return (
    <div className="w-full space-y-5">
      {/* Headline Banner */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-900 border border-indigo-500/30 text-white shadow-xl flex items-start gap-3 backdrop-blur-md">
        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-300">
            Actionable Smog Advisory (Gemini 2.5 Flash)
          </span>
          <p className="text-sm font-medium mt-0.5 text-slate-200 leading-relaxed">
            {plan.headlineSummary}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Safe Outdoor Windows */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4 flex flex-col justify-between backdrop-blur-md">
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <Sun className="w-5 h-5 text-amber-400" />
              <h4 className="font-bold text-white text-sm">Safe Outdoor Windows</h4>
            </div>

            <div className="space-y-3">
              {plan.safeWindows.map((win, idx) => (
                <div key={idx} className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{win.timeWindow}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getRiskColor(win.riskLevel)}`}>
                      {win.riskLevel} Risk
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium">
                    <span className="text-slate-500">Best for:</span> {win.bestFor}
                  </p>
                  <p className="text-[11px] text-slate-400 italic bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                    <span className="font-semibold text-slate-300 not-italic">Why: </span>
                    {win.why}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: Indoor Air Hacks */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4 flex flex-col justify-between backdrop-blur-md">
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <Home className="w-5 h-5 text-indigo-400" />
              <h4 className="font-bold text-white text-sm">Indoor Air Hacks (Home Setup)</h4>
            </div>

            <div className="space-y-2.5">
              {plan.indoorHacks.map((hack, idx) => (
                <div key={idx} className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-slate-200">{hack.title}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-normal">{hack.action}</p>
                  <p className="text-[11px] text-slate-500 italic bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
                    <span className="font-semibold text-slate-300 not-italic">Why: </span>
                    {hack.why}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Sustainable Commute Swap */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4 flex flex-col justify-between backdrop-blur-md">
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <Compass className="w-5 h-5 text-teal-400" />
              <h4 className="font-bold text-white text-sm">Sustainable Commute Swap</h4>
            </div>

            <div className="p-3.5 bg-teal-950/20 border border-teal-900/30 rounded-2xl space-y-2.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-teal-400 block">
                Recommended Alternative
              </span>
              <p className="text-xs font-bold text-teal-200 leading-relaxed">
                {plan.commuteSwap.recommendation}
              </p>
              <div className="p-2.5 bg-slate-950/80 rounded-xl border border-teal-900/30 text-[11px] text-slate-300">
                <span className="font-bold text-teal-300">Health Impact: </span>
                {plan.commuteSwap.why}
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 text-[11px] text-slate-400">
            Commute shifts protect lungs during ground inversion while cutting local vehicle soot.
          </div>
        </div>
      </div>
    </div>
  );
}
