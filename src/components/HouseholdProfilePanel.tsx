"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import { FamilyProfile } from "@/types";

interface HouseholdProfilePanelProps {
  familyProfile: FamilyProfile;
  loadingPlan: boolean;
  hasAqiData: boolean;
  onToggleMember: (member: string) => void;
  onChangeCommute: (commute: FamilyProfile["commute"]) => void;
  onChangeHomeSetup: (setup: FamilyProfile["homeSetup"]) => void;
  onReevaluate: () => void;
}

const HOUSEHOLD_MEMBERS: ReadonlyArray<[string, string]> = [
  ["Infants", "Infants"],
  ["School Kids", "School kids"],
  ["Elderly", "Elderly"],
  ["Asthma", "Asthma or lung condition"],
];

const COMMUTE_OPTIONS: ReadonlyArray<[FamilyProfile["commute"], string]> = [
  ["Two-wheeler", "Two-wheeler"],
  ["Public Transit", "Public transit"],
  ["Car", "Car"],
  ["Walk/Cycle", "Walk or cycle"],
];

const HOME_SETUP_OPTIONS: ReadonlyArray<[FamilyProfile["homeSetup"], string]> = [
  ["Air Purifier", "Air purifier"],
  ["Natural Ventilation", "Natural ventilation"],
];

/**
 * Household profile selector allowing users to customize vulnerable members,
 * commute mode, and home setup, and trigger a full AI smog report re-evaluation.
 */
export default function HouseholdProfilePanel({
  familyProfile,
  loadingPlan,
  hasAqiData,
  onToggleMember,
  onChangeCommute,
  onChangeHomeSetup,
  onReevaluate,
}: HouseholdProfilePanelProps) {
  return (
    <div className="panel" id="profile">
      <h3>Who is in your household?</h3>
      <div className="tg">
        {HOUSEHOLD_MEMBERS.map(([id, label]) => {
          const pressed = familyProfile.members.some((m) =>
            m.toLowerCase().includes(id.toLowerCase())
          );
          return (
            <button
              key={id}
              type="button"
              aria-pressed={pressed}
              onClick={() => onToggleMember(id)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <h3>How do you get around?</h3>
      <div className="tg">
        {COMMUTE_OPTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={familyProfile.commute === id}
            onClick={() => onChangeCommute(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <h3>What does your home have?</h3>
      <div className="tg">
        {HOME_SETUP_OPTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={familyProfile.homeSetup === id}
            onClick={() => onChangeHomeSetup(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="reevaluate-bar">
        <button
          type="button"
          className="chip reevaluate-btn"
          onClick={onReevaluate}
          disabled={loadingPlan || !hasAqiData}
        >
          <RefreshCw size={16} className={loadingPlan ? "spin" : ""} />
          {loadingPlan ? "Re-evaluating report..." : "Re-evaluate Report"}
        </button>

        <span className="reevaluate-hint">
          Click to re-evaluate your family&apos;s tailored smog plan and safest windows.
        </span>
      </div>
    </div>
  );
}
