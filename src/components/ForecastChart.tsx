"use client";

import React from "react";
import { getAQICategory } from "@/lib/openmeteo";
import { HourlyAQIPoint } from "@/types";

interface ForecastChartProps {
  forecast24h: HourlyAQIPoint[];
  bestWindowIndices: Set<number>;
  selectedHourIdx: number;
  maxForecastPm: number;
  onSelectHour: (idx: number) => void;
}

/**
 * Interactive 24-hour PM2.5 bar chart color-coded by US AQI with safest 2-hour windows highlighted.
 */
export default function ForecastChart({
  forecast24h,
  bestWindowIndices,
  selectedHourIdx,
  maxForecastPm,
  onSelectHour,
}: ForecastChartProps) {
  return (
    <div>
      <h2>Next 24 hours</h2>
      <p className="sub">
        PM2.5 in µg/m³, coloured by US AQI. Outlined bars are your safest two-hour windows. Tap an
        hour for detail.
      </p>

      <div className="legend">
        <span>
          <i style={{ background: "#2f9e63" }} /> 0–50 Good
        </span>
        <span>
          <i style={{ background: "#c99700" }} /> 51–100 Moderate
        </span>
        <span>
          <i style={{ background: "#e07b1f" }} /> 101–150 Sensitive
        </span>
        <span>
          <i style={{ background: "#d6403a" }} /> 151–200 Unhealthy
        </span>
        <span>
          <i style={{ background: "#8a3fb0" }} /> 201–300 Very Unhealthy
        </span>
        <span>
          <i style={{ background: "#7a1e3a" }} /> 301+ Hazardous
        </span>
      </div>

      <div className="scroller">
        <div className="bars">
          {forecast24h.map((point, idx) => {
            const h = new Date(point.time).getHours();
            const timeLabel = (h % 12 || 12) + (h < 12 ? " am" : " pm");
            const pointCat = getAQICategory(point.us_aqi);
            const isBest = bestWindowIndices.has(idx);
            const isSelected = selectedHourIdx === idx;
            const barHeight = Math.max(4, (point.pm2_5 / maxForecastPm) * 118);

            return (
              <button
                key={`${point.time}-${idx}`}
                className={`bar${isBest ? " best" : ""}`}
                aria-pressed={isSelected}
                style={{ "--c": pointCat.color } as React.CSSProperties}
                title={`${timeLabel}: PM2.5 ${point.pm2_5}, AQI ${point.us_aqi}`}
                type="button"
                onClick={() => onSelectHour(idx)}
              >
                <b>{Math.round(point.pm2_5)}</b>
                <i style={{ height: `${barHeight}px` }} />
                <span>{timeLabel}</span>
                <span>{point.us_aqi}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
