"use client";

import React from "react";
import { getAQICategory } from "@/lib/openmeteo";
import { AISmogPlan, FamilyProfile, HourlyAQIPoint, SafeWindowSummary } from "@/types";

interface DetailedSmogPlanViewProps {
  safeWindows: SafeWindowSummary[];
  smogPlan: AISmogPlan | null;
  familyProfile: FamilyProfile;
  currentPoint: HourlyAQIPoint;
  onClose: () => void;
}

/**
 * Expanded action report displaying safest daytime windows, indoor air-quality hacks,
 * and commute swap recommendations tailored to the active household profile.
 */
export default function DetailedSmogPlanView({
  safeWindows,
  smogPlan,
  familyProfile,
  currentPoint,
  onClose,
}: DetailedSmogPlanViewProps) {
  return (
    <div className="detailed-plan-view">
      <div className="detailed-plan-banner">
        <span className="detailed-plan-banner-title">Detailed Smog Plan &amp; Actions</span>
        <button type="button" className="detailed-plan-return-link" onClick={onClose}>
          Return to Chat
        </button>
      </div>

      <div>
        <h2 className="detailed-plan-heading">Safest times to go out</h2>
        {safeWindows.length > 0 ? (
          safeWindows.map((w, idx) => {
            const windowCat = getAQICategory(w.aqiVal);
            return (
              <div key={idx} className="item">
                <span className="tag" style={{ "--c": windowCat.color } as React.CSSProperties}>
                  {windowCat.category}
                </span>
                <strong>
                  {w.day}, {w.label}
                </strong>
                <p>
                  Average AQI about {w.aqiVal}.{" "}
                  {familyProfile.members.includes("School Kids")
                    ? "Best for school runs and play."
                    : "Best for errands and exercise."}{" "}
                  Midday sun lifts the haze layer and winds disperse ground-level soot, so the
                  lowest readings usually fall in the early afternoon.
                </p>
              </div>
            );
          })
        ) : (
          <div className="item">
            <strong>Any time works</strong>
            <p>
              Readings stay in a comfortable range all day. Early afternoon is still the cleanest
              stretch.
            </p>
          </div>
        )}
      </div>

      <div>
        <h2 className="detailed-plan-heading">Inside your home</h2>
        {smogPlan?.indoorHacks && smogPlan.indoorHacks.length > 0 ? (
          smogPlan.indoorHacks.map((hack, idx) => (
            <div key={idx} className="item">
              <strong>{hack.title}</strong>
              <p>
                {hack.action}{" "}
                <span style={{ fontStyle: "italic", opacity: 0.9 }}>{hack.why}</span>
              </p>
            </div>
          ))
        ) : (
          <div className="item">
            <strong>
              {familyProfile.homeSetup === "Air Purifier"
                ? "Air Purifier High-CADR Lockdown"
                : "Strict Midday-Only Natural Ventilation"}
            </strong>
            <p>
              {familyProfile.homeSetup === "Air Purifier"
                ? "Seal window seams with draft stoppers and run HEPA purifiers on medium-high in sleeping quarters before bedtime."
                : "Keep exterior windows shut during peak inversion hours (7 AM - 11 AM and 6 PM - 10 PM). Open cross-ventilation only between 1 PM and 3 PM."}
            </p>
          </div>
        )}
      </div>

      <div>
        <h2 className="detailed-plan-heading">Your commute</h2>
        <div className="item">
          <strong>
            {smogPlan?.commuteSwap?.recommendation ||
              (familyProfile.commute === "Two-wheeler"
                ? "Swap the bike or wear a sealed N95"
                : "Keep vehicle windows up with AC recirculation")}
          </strong>
          <p>
            {smogPlan?.commuteSwap?.why ||
              "Two-wheeler and roadside commuters inhale 4x higher concentrations of fresh black carbon directly from exhaust pipes."}
          </p>
        </div>
        {familyProfile.members.includes("School Kids") && currentPoint.us_aqi >= 150 && (
          <div className="item">
            <strong>School kids</strong>
            <p>
              Move outdoor games and PE indoors today. Cut outdoor play short and watch for
              coughing.
            </p>
          </div>
        )}
      </div>

      <div style={{ paddingTop: "8px" }}>
        <button type="button" className="detailed-plan-close-btn" onClick={onClose}>
          Close &amp; Return to Chat Assistant
        </button>
      </div>
    </div>
  );
}
