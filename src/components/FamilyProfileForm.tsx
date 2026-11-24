"use client";

import React from "react";
import { Users, Sparkles } from "lucide-react";
import { FamilyProfile } from "@/types";

interface Props {
  profile: FamilyProfile;
  onChange: (profile: FamilyProfile) => void;
  onRefreshPlan: () => void;
  loadingPlan: boolean;
}

const MEMBER_OPTIONS = [
  "Infants (0-2 yrs)",
  "School Kids",
  "Elderly (60+ yrs)",
  "Asthma / Respiratory",
];

const COMMUTE_OPTIONS: FamilyProfile["commute"][] = [
  "Two-wheeler",
  "Public Transit",
  "Car",
  "Walk/Cycle",
];

const HOME_OPTIONS: FamilyProfile["homeSetup"][] = [
  "Air Purifier",
  "Natural Ventilation",
];

export function FamilyProfileForm({ profile, onChange, onRefreshPlan, loadingPlan }: Props) {
  const toggleMember = (member: string) => {
    const exists = profile.members.includes(member);
    const updated = exists
      ? profile.members.filter((m) => m !== member)
      : [...profile.members, member];
    onChange({ ...profile, members: updated });
  };

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 backdrop-blur-md">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-bold text-white tracking-tight">Family Context Profile</h3>
        </div>
        <span className="text-xs text-slate-400 font-medium">Personalizes Plan</span>
      </div>

      {/* Household Members */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
          Vulnerable Household Members
        </label>
        <div className="grid grid-cols-2 gap-2">
          {MEMBER_OPTIONS.map((m) => {
            const isSelected = profile.members.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMember(m)}
                className={`px-3 py-2 text-xs font-medium rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold ring-1 ring-indigo-400/50 shadow-sm"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                {isSelected ? "✓ " : "+ "}
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Commute and Home Setup */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Daily Commute */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
            Primary Daily Commute
          </label>
          <div className="grid grid-cols-2 gap-2">
            {COMMUTE_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange({ ...profile, commute: opt })}
                className={`px-2.5 py-2 text-xs rounded-xl border font-medium transition-all ${
                  profile.commute === opt
                    ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold ring-1 ring-indigo-400/50"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Home Setup */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
            Home Setup
          </label>
          <div className="grid grid-cols-2 gap-2">
            {HOME_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange({ ...profile, homeSetup: opt })}
                className={`px-2.5 py-2 text-xs rounded-xl border font-medium transition-all ${
                  profile.homeSetup === opt
                    ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold ring-1 ring-indigo-400/50"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action CTA */}
      <div className="pt-1">
        <button
          type="button"
          onClick={onRefreshPlan}
          disabled={loadingPlan}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {loadingPlan ? (
            <>Re-calculating Family AI Plan...</>
          ) : (
            <>Update Smog Strategy with Gemini 2.5 Flash</>
          )}
        </button>
      </div>
    </div>
  );
}
