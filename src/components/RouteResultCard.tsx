"use client";

import React from "react";
import { AlertTriangle, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { RouteSafetyResult } from "@/types";

interface RouteResultCardProps {
  result: RouteSafetyResult;
}

const VERDICT_STYLE_MAP: Record<
  RouteSafetyResult["verdict"],
  { color: string; bg: string; Icon: typeof ShieldCheck }
> = {
  SAFE: { color: "#2f9e63", bg: "rgba(47, 158, 99, 0.14)", Icon: ShieldCheck },
  CAUTION: { color: "#e07b1f", bg: "rgba(224, 123, 31, 0.14)", Icon: AlertTriangle },
  AVOID: { color: "#d6403a", bg: "rgba(214, 64, 58, 0.14)", Icon: ShieldAlert },
};

/**
 * Displays AI safety evaluation, exposure analysis, cleaner route suggestions,
 * and per-corridor AQI comparisons beneath the OpenStreetMap view.
 */
export default function RouteResultCard({ result }: RouteResultCardProps) {
  const verdictStyle = VERDICT_STYLE_MAP[result.verdict] ?? VERDICT_STYLE_MAP.AVOID;
  const VerdictIcon = verdictStyle.Icon;

  return (
    <div
      className="map-verdict-card"
      style={{
        border: `1px solid ${verdictStyle.color}`,
        background: verdictStyle.bg,
      }}
    >
      <div className="map-verdict-top">
        <span className="map-verdict-badge" style={{ background: verdictStyle.color }}>
          <VerdictIcon size={14} />
          {result.verdict}
        </span>
        <strong className="map-verdict-headline">{result.verdictHeadline}</strong>
      </div>

      <p className="map-verdict-analysis">{result.analysis}</p>

      <div className="map-advice-box">
        <strong className="map-advice-title">
          <Sparkles size={14} /> AI Better Route &amp; Commute Advice:
        </strong>{" "}
        <span>{result.betterRouteSuggestion}</span>
      </div>

      <div className="map-routes-grid">
        {result.routes.map((route) => {
          const isRecommended = route.index === result.recommendedRouteIndex;
          return (
            <div
              key={route.index}
              className="map-route-pill"
              style={{ border: `1px solid ${isRecommended ? route.color : "var(--line)"}` }}
            >
              <i className="map-route-dot" style={{ background: route.color }} />
              <span>
                <strong>{route.label}</strong>
                {isRecommended ? " ★ Recommended" : ""}: {route.distanceKm} km (
                {route.durationMin} min) • Avg AQI{" "}
                <strong style={{ color: route.color }}>{route.avgAqi}</strong> (Peak {route.maxAqi})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
