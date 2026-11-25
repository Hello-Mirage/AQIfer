"use client";

import React from "react";
import { SafeWindowSummary } from "@/types";

interface HeroSummaryGridProps {
  selectedCity: string;
  headline: string;
  category: string;
  usAqi: number;
  pm25: number;
  pm10: number;
  activeHourTimeLabel: string;
  visibilityKm: number;
  visibilityCondition: string;
  safestWindow: SafeWindowSummary | null;
}

/**
 * Hero AQI dial banner paired with the 4-metric current particulate, visibility,
 * and safest daytime window summary grid.
 */
export default function HeroSummaryGrid({
  selectedCity,
  headline,
  category,
  usAqi,
  pm25,
  pm10,
  activeHourTimeLabel,
  visibilityKm,
  visibilityCondition,
  safestWindow,
}: HeroSummaryGridProps) {
  const heroGuidance =
    usAqi >= 201
      ? "Today is a day to plan around the air, not ignore it."
      : usAqi >= 101
      ? "Children, older adults and anyone with asthma should take it easy."
      : "Normal activity is fine.";

  return (
    <>
      <section className="hero" aria-live="polite">
        <div>
          <h1>{headline}</h1>
          <p>
            {selectedCity}: fine soot (PM2.5) passes the upper airways and reaches deep into the
            lungs. {heroGuidance}
          </p>
        </div>

        <div className="dial">
          <b>{usAqi}</b>
          <span>{category}</span>
          <i>US AQI, reading for {activeHourTimeLabel}</i>
        </div>
      </section>

      <div className="stats">
        <div>
          <small>PM2.5</small>
          <b>
            {pm25}
            <em>µg/m³</em>
          </b>
          <br />
          <span>Fine soot</span>
        </div>
        <div>
          <small>PM10</small>
          <b>
            {pm10}
            <em>µg/m³</em>
          </b>
          <br />
          <span>Dust and ash</span>
        </div>
        <div>
          <small>Visibility</small>
          <b>
            {visibilityKm}
            <em>km</em>
          </b>
          <br />
          <span>{visibilityCondition}</span>
        </div>
        <div>
          <small>Safest window</small>
          <b>{safestWindow ? safestWindow.label : "–"}</b>
          <br />
          <span>
            {safestWindow
              ? `${safestWindow.day}, about ${safestWindow.avgPm} µg/m³`
              : "None found"}
          </span>
        </div>
      </div>
    </>
  );
}
