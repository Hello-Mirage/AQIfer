"use client";

import React from "react";
import { AQI_BANDS, getAQICategory } from "@/lib/openmeteo";
import { formatHourLabel } from "@/lib/format";
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
        {AQI_BANDS.map((band) => (
          <span key={band.category}>
            <i style={{ background: band.color }} /> {band.rangeLabel} {band.shortName}
          </span>
        ))}
      </div>

      <div className="scroller">
        <div className="bars" role="group" aria-label="24-hour PM2.5 forecast">
          {forecast24h.map((point, idx) => {
            const timeLabel = formatHourLabel(point.time);
            const pointCat = getAQICategory(point.us_aqi);
            const isBest = bestWindowIndices.has(idx);
            const isSelected = selectedHourIdx === idx;
            const barHeight = Math.max(4, (point.pm2_5 / maxForecastPm) * 118);

            return (
              <button
                key={`${point.time}-${idx}`}
                className={`bar${isBest ? " best" : ""}`}
                aria-pressed={isSelected}
                aria-label={`${timeLabel}: PM2.5 ${point.pm2_5} µg/m³, US AQI ${point.us_aqi}${
                  isBest ? ", safest window" : ""
                }`}
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
