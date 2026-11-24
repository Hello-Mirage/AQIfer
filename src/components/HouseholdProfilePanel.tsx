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

      <div
        style={{
          marginTop: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          borderTop: "1px solid var(--line)",
          paddingTop: "16px",
        }}
      >
        <button
          type="button"
          className="chip"
          onClick={onReevaluate}
          disabled={loadingPlan || !hasAqiData}
          style={{
            background: "var(--ink)",
            color: "var(--bg)",
            borderColor: "var(--ink)",
            padding: "10px 22px",
            fontSize: "14px",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            cursor: loadingPlan ? "not-allowed" : "pointer",
            borderRadius: "999px",
            transition: "all 0.2s ease",
          }}
        >
          <RefreshCw size={16} className={loadingPlan ? "spin" : ""} />
          {loadingPlan ? "Re-evaluating report..." : "Re-evaluate Report"}
        </button>

        <span style={{ fontSize: "12px", color: "var(--mute)" }}>
          Click to re-evaluate your family&apos;s tailored smog plan and safest windows.
        </span>
      </div>
    </div>
  );
}
