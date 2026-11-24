"use client";

import React from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Clock,
  Sparkles,
  ArrowRight,
  Wind,
} from "lucide-react";
import { OutdoorVerdict, CurrentAQI, FamilyProfile } from "@/types";

interface Props {
  verdict: OutdoorVerdict | null;
  current: CurrentAQI | null;
  city: string;
  familyProfile: FamilyProfile;
  loading: boolean;
  onQuickAsk: (question: string) => void;
}

export function OutdoorVerdictHero({
  verdict,
  current,
  city,
  familyProfile,
  loading,
  onQuickAsk,
}: Props) {
  if (loading || !verdict || !current) {
    return (
      <div className="w-full bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 animate-pulse space-y-4">
        <div className="h-6 w-48 bg-slate-800 rounded" />
        <div className="h-10 w-3/4 bg-slate-800 rounded" />
        <div className="h-20 bg-slate-800/60 rounded-2xl" />
      </div>
    );
  }

  const isStayIndoors = verdict.status === "STAY_INDOORS";
  const isHazardous = verdict.status === "HAZARDOUS";
  const isCaution = verdict.status === "CAUTION";
  const isSafe = verdict.status === "SAFE";

  const getBorderColor = () => {
    if (isStayIndoors) return "border-rose-500/30 bg-gradient-to-b from-rose-950/20 via-slate-900/80 to-slate-900/80";
    if (isHazardous) return "border-orange-500/30 bg-gradient-to-b from-orange-950/20 via-slate-900/80 to-slate-900/80";
    if (isCaution) return "border-amber-500/30 bg-gradient-to-b from-amber-950/20 via-slate-900/80 to-slate-900/80";
    return "border-emerald-500/30 bg-gradient-to-b from-emerald-950/20 via-slate-900/80 to-slate-900/80";
  };

  const getBadgeStyle = () => {
    if (isStayIndoors) return "bg-rose-500/20 text-rose-300 border-rose-500/40 ring-1 ring-rose-500/20";
    if (isHazardous) return "bg-orange-500/20 text-orange-300 border-orange-500/40 ring-1 ring-orange-500/20";
    if (isCaution) return "bg-amber-500/20 text-amber-300 border-amber-500/40 ring-1 ring-amber-500/20";
    return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500/20";
  };

  return (
    <div
      className={`w-full rounded-3xl p-6 sm:p-8 border backdrop-blur-xl shadow-2xl relative overflow-hidden transition-all ${getBorderColor()}`}
    >
      {/* Background ambient glow circle */}
      <div
        className={`absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none ${
          isStayIndoors
            ? "bg-rose-500"
            : isHazardous
            ? "bg-orange-500"
            : isCaution
            ? "bg-amber-500"
            : "bg-emerald-500"
        }`}
      />

      <div className="relative z-10 space-y-6">
        {/* Top bar: Assistant Label & Live Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 block">
                Aqifier Outdoor Safety Verdict
              </span>
              <span className="text-xs text-slate-400">
                Live Environmental Assessment for {city}
              </span>
            </div>
          </div>

          <div
            className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide border flex items-center gap-1.5 shadow-sm ${getBadgeStyle()}`}
          >
            {isStayIndoors || isHazardous ? (
              <ShieldAlert className="w-3.5 h-3.5" />
            ) : isCaution ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            <span>{verdict.badgeLabel}</span>
          </div>
        </div>

        {/* Primary Verdict Headline */}
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
            {verdict.headline}
          </h2>
          <p className="text-sm sm:text-base text-slate-300 font-medium leading-relaxed max-w-3xl">
            {verdict.summary}
          </p>
        </div>

        {/* Key Real-Time Telemetry Bar (Visibility + Smog + Safe Window) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Visibility metric */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center gap-3 shadow-inner">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Current Visibility
              </span>
              <div className="text-lg font-black text-white flex items-baseline gap-1">
                {current.visibilityKm} <span className="text-xs font-medium text-slate-400">km</span>
              </div>
              <span className="text-[11px] text-cyan-300/90 truncate block max-w-[180px]">
                {current.visibilityCondition}
              </span>
            </div>
          </div>

          {/* Actionable Prompt */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center gap-3 shadow-inner">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Safe Window Advisory
              </span>
              <p className="text-xs font-medium text-slate-200 mt-0.5 line-clamp-2">
                {verdict.safeWindowPrompt}
              </p>
            </div>
          </div>

          {/* Family Recommendation */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center gap-3 shadow-inner">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <Wind className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Family Profile Alert
              </span>
              <p className="text-xs font-medium text-slate-200 mt-0.5 line-clamp-2">
                {verdict.recommendation}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Question Triggers for the Chatbot */}
        <div className="pt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400 mr-1 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Ask Assistant:
          </span>
          <button
            type="button"
            onClick={() => onQuickAsk("What is the visibility right now and is it safe to drive?")}
            className="text-xs bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl border border-slate-700/60 transition-all flex items-center gap-1.5"
          >
            <span>👁️ How bad is the visibility for driving?</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={() => onQuickAsk("Can I go outside for a walk or run right now?")}
            className="text-xs bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl border border-slate-700/60 transition-all flex items-center gap-1.5"
          >
            <span>🏃 Can I go out for a walk right now?</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={() => onQuickAsk("Is it safe for children to play outside at 5 PM today?")}
            className="text-xs bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl border border-slate-700/60 transition-all flex items-center gap-1.5"
          >
            <span>🧒 Is 5 PM safe for kids outside?</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
