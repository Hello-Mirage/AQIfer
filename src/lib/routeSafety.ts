import { Type, Schema } from "@google/genai";
import { EvaluatedRoute, FamilyProfile, RouteSafetyResult } from "@/types";

export const routeVerdictSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    verdict: {
      type: Type.STRING,
      description: "Must be one of: 'SAFE', 'CAUTION', or 'AVOID'",
    },
    verdictHeadline: {
      type: Type.STRING,
      description: "Crisp one-sentence verdict on route safety.",
    },
    analysis: {
      type: Type.STRING,
      description: "2-3 sentences explaining the air quality exposure along the route, citing exact AQI and PM2.5 levels.",
    },
    betterRouteSuggestion: {
      type: Type.STRING,
      description: "Specific suggestion comparing the cleaner alternative route (if any) or advising safer transit/timing/masking.",
    },
    recommendedRouteIndex: {
      type: Type.NUMBER,
      description: "0-based index of the safest route from the provided routes list.",
    },
  },
  required: ["verdict", "verdictHeadline", "analysis", "betterRouteSuggestion", "recommendedRouteIndex"],
};

/**
 * Sample up to `count` evenly spaced [lat, lon] waypoints along a route polyline.
 */
export function sampleWaypoints(coords: [number, number][], count = 5): [number, number][] {
  if (coords.length <= count) return coords;
  const sampled: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(coords.length - 1, Math.round((i / (count - 1)) * (coords.length - 1)));
    sampled.push(coords[idx]);
  }
  return sampled;
}

/**
 * Compute a grounded heuristic route safety verdict and cleaner route recommendation
 * based on waypoint US AQI, PM2.5 exposure, commute mode, and vulnerable household members.
 */
export function generateHeuristicRouteVerdict(
  routes: EvaluatedRoute[],
  originName: string,
  destName: string,
  profile: FamilyProfile
): Omit<RouteSafetyResult, "origin" | "destination" | "routes"> {
  let bestIdx = 0;
  for (let i = 1; i < routes.length; i++) {
    if (
      routes[i].avgAqi < routes[bestIdx].avgAqi ||
      (routes[i].avgAqi === routes[bestIdx].avgAqi && routes[i].maxAqi < routes[bestIdx].maxAqi)
    ) {
      bestIdx = i;
    }
  }

  const primary = routes[0];
  const best = routes[bestIdx];
  const isExposed = profile.commute === "Two-wheeler" || profile.commute === "Walk/Cycle";
  const hasVulnerable = profile.members.length > 0;

  let verdict: "SAFE" | "CAUTION" | "AVOID" = "SAFE";
  let verdictHeadline = `Route from ${originName} to ${destName} is currently clear (Avg AQI ${primary.avgAqi}).`;

  if (primary.maxAqi >= 200 || (primary.avgAqi >= 150 && isExposed)) {
    verdict = "AVOID";
    verdictHeadline = `Avoid ${profile.commute.toLowerCase()} travel on this route — peak AQI hits ${primary.maxAqi}.`;
  } else if (primary.avgAqi >= 100 || primary.maxAqi >= 120 || (hasVulnerable && primary.avgAqi >= 75)) {
    verdict = "CAUTION";
    verdictHeadline = `Proceed with N95 protection — route averages AQI ${primary.avgAqi} (PM2.5 ${primary.avgPm25} µg/m³).`;
  }

  const analysis = `Your primary route (${primary.distanceKm} km, ~${primary.durationMin} min) from ${originName} to ${destName} passes through zones averaging US AQI ${primary.avgAqi} (${primary.avgPm25} µg/m³ PM2.5), peaking at AQI ${primary.maxAqi}. ${
    isExposed
      ? `Using a ${profile.commute.toLowerCase()} leaves ${profile.members.join(", ") || "riders"} directly exposed to concentrated roadside tailpipe soot.`
      : `Keep cabin windows sealed and AC on internal recirculation to block roadside particulates.`
  }`;

  let betterRouteSuggestion = "";
  if (bestIdx !== 0 && best.avgAqi < primary.avgAqi) {
    const diff = primary.avgAqi - best.avgAqi;
    betterRouteSuggestion = `Take Alternative Route ${bestIdx} instead (${best.distanceKm} km, ~${best.durationMin} min): it lowers your average AQI exposure by ${diff} points (Avg AQI ${best.avgAqi}, Peak ${best.maxAqi}).`;
  } else if (verdict === "AVOID") {
    betterRouteSuggestion = `All road corridors along this stretch currently exceed safe particulate thresholds. Switch to enclosed public transit (Metro/AC bus) or delay travel until the midday dispersion window (12 PM – 3 PM), and wear an airtight N95 mask.`;
  } else if (verdict === "CAUTION") {
    betterRouteSuggestion = `This is the cleanest road corridor available right now. Wear a fitted N95 mask${isExposed ? " or switch to an enclosed car/metro" : ""}, and avoid idling at major traffic intersections.`;
  } else {
    betterRouteSuggestion = `Your primary route is already the cleanest corridor (${best.distanceKm} km, Avg AQI ${best.avgAqi}). Normal precautions apply.`;
  }

  return {
    recommendedRouteIndex: bestIdx,
    verdict,
    verdictHeadline,
    analysis,
    betterRouteSuggestion,
  };
}
