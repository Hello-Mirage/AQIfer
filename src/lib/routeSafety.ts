import { Type, Schema } from "@google/genai";
import { EvaluatedRoute, FamilyProfile, RouteSafetyResult, RouteWaypointAQI } from "@/types";
import { getAQICategory, OpenMeteoGridRawItem } from "@/lib/openmeteo";

const DEFAULT_WAYPOINT_PM25 = 55;
const DEFAULT_WAYPOINT_AQI = 135;
const WAYPOINTS_PER_ROUTE = 5;

/** Raw OSRM route geometry object returned by `router.project-osrm.org`. */
export interface OsrmRawRoute {
  distance: number;
  duration: number;
  geometry?: {
    coordinates?: [number, number][];
  };
}

/** Gemini structured schema for evaluating route exposure safety. */
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
      description:
        "2-3 sentences explaining the air quality exposure along the route, citing exact AQI and PM2.5 levels.",
    },
    betterRouteSuggestion: {
      type: Type.STRING,
      description:
        "Specific suggestion comparing the cleaner alternative route (if any) or advising safer transit/timing/masking.",
    },
    recommendedRouteIndex: {
      type: Type.NUMBER,
      description: "0-based index of the safest route from the provided routes list.",
    },
  },
  required: [
    "verdict",
    "verdictHeadline",
    "analysis",
    "betterRouteSuggestion",
    "recommendedRouteIndex",
  ],
};

/**
 * Sample up to `count` evenly spaced `[lat, lon]` waypoints along a route polyline.
 */
export function sampleWaypoints(coords: [number, number][], count = 5): [number, number][] {
  if (coords.length <= count) {
    return coords;
  }
  const sampled: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(
      coords.length - 1,
      Math.round((i / (count - 1)) * (coords.length - 1))
    );
    sampled.push(coords[idx]);
  }
  return sampled;
}

/**
 * Build a straight-line fallback corridor when OSRM is unreachable or returns no corridors.
 */
export function buildFallbackCorridor(
  origin: { latitude: number; longitude: number },
  dest: { latitude: number; longitude: number }
): OsrmRawRoute[] {
  const midLat = (origin.latitude + dest.latitude) / 2;
  const midLon = (origin.longitude + dest.longitude) / 2;
  return [
    {
      distance: 5000,
      duration: 900,
      geometry: {
        coordinates: [
          [origin.longitude, origin.latitude],
          [midLon, midLat],
          [dest.longitude, dest.latitude],
        ],
      },
    },
  ];
}

/**
 * Convert raw OSRM polylines into Leaflet `[lat, lon]` coordinates and sampled AQI waypoints.
 */
export function prepareRouteSamples(rawRoutes: OsrmRawRoute[]): Array<{
  raw: OsrmRawRoute;
  latLngs: [number, number][];
  waypoints: [number, number][];
}> {
  return rawRoutes.map((raw) => {
    const latLngs: [number, number][] = (raw.geometry?.coordinates ?? []).map((c) => [c[1], c[0]]);
    return {
      raw,
      latLngs,
      waypoints: sampleWaypoints(latLngs, WAYPOINTS_PER_ROUTE),
    };
  });
}

/**
 * Combine sampled route corridors with Open-Meteo waypoint AQI measurements to compute
 * per-route average AQI, peak AQI, and category color coding.
 */
export function evaluateOsrmRoutes(
  routeSamples: ReturnType<typeof prepareRouteSamples>,
  aqResults: OpenMeteoGridRawItem[]
): EvaluatedRoute[] {
  let pointOffset = 0;

  return routeSamples.map((sample, idx) => {
    const waypointAqis: RouteWaypointAQI[] = sample.waypoints.map(([lat, lon], wIdx) => {
      const aqItem = aqResults[pointOffset + wIdx];
      const pm2_5 = Math.round((aqItem?.current?.pm2_5 ?? DEFAULT_WAYPOINT_PM25) * 10) / 10;
      const us_aqi = Math.round(aqItem?.current?.us_aqi ?? DEFAULT_WAYPOINT_AQI);
      const cat = getAQICategory(us_aqi);
      return {
        latitude: lat,
        longitude: lon,
        us_aqi,
        pm2_5,
        category: cat.category,
        color: cat.color,
      };
    });

    pointOffset += sample.waypoints.length;

    const count = Math.max(1, waypointAqis.length);
    const avgAqi = Math.round(waypointAqis.reduce((sum, w) => sum + w.us_aqi, 0) / count);
    const maxAqi = waypointAqis.length > 0 ? Math.max(...waypointAqis.map((w) => w.us_aqi)) : avgAqi;
    const avgPm25 =
      Math.round((waypointAqis.reduce((sum, w) => sum + w.pm2_5, 0) / count) * 10) / 10;

    return {
      index: idx,
      label: idx === 0 ? "Primary Route" : `Alternative Route ${idx}`,
      distanceKm: Math.round((sample.raw.distance / 1000) * 10) / 10,
      durationMin: Math.max(1, Math.round(sample.raw.duration / 60)),
      avgAqi,
      maxAqi,
      avgPm25,
      coordinates: sample.latLngs,
      waypoints: waypointAqis,
      color: getAQICategory(avgAqi).color,
    };
  });
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
    const isCleanerAvg = routes[i].avgAqi < routes[bestIdx].avgAqi;
    const isTiedCleanerPeak =
      routes[i].avgAqi === routes[bestIdx].avgAqi && routes[i].maxAqi < routes[bestIdx].maxAqi;
    if (isCleanerAvg || isTiedCleanerPeak) {
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
  } else if (
    primary.avgAqi >= 100 ||
    primary.maxAqi >= 120 ||
    (hasVulnerable && primary.avgAqi >= 75)
  ) {
    verdict = "CAUTION";
    verdictHeadline = `Proceed with N95 protection — route averages AQI ${primary.avgAqi} (PM2.5 ${primary.avgPm25} µg/m³).`;
  }

  const exposureNote = isExposed
    ? `Using a ${profile.commute.toLowerCase()} leaves ${
        profile.members.join(", ") || "riders"
      } directly exposed to concentrated roadside tailpipe soot.`
    : `Keep cabin windows sealed and AC on internal recirculation to block roadside particulates.`;

  const analysis = `Your primary route (${primary.distanceKm} km, ~${primary.durationMin} min) from ${originName} to ${destName} passes through zones averaging US AQI ${primary.avgAqi} (${primary.avgPm25} µg/m³ PM2.5), peaking at AQI ${primary.maxAqi}. ${exposureNote}`;

  let betterRouteSuggestion = `Your primary route is already the cleanest corridor (${best.distanceKm} km, Avg AQI ${best.avgAqi}). Normal precautions apply.`;
  if (bestIdx !== 0 && best.avgAqi < primary.avgAqi) {
    const diff = primary.avgAqi - best.avgAqi;
    betterRouteSuggestion = `Take Alternative Route ${bestIdx} instead (${best.distanceKm} km, ~${best.durationMin} min): it lowers your average AQI exposure by ${diff} points (Avg AQI ${best.avgAqi}, Peak ${best.maxAqi}).`;
  } else if (verdict === "AVOID") {
    betterRouteSuggestion = `All road corridors along this stretch currently exceed safe particulate thresholds. Switch to enclosed public transit (Metro/AC bus) or delay travel until the midday dispersion window (12 PM – 3 PM), and wear an airtight N95 mask.`;
  } else if (verdict === "CAUTION") {
    betterRouteSuggestion = `This is the cleanest road corridor available right now. Wear a fitted N95 mask${
      isExposed ? " or switch to an enclosed car/metro" : ""
    }, and avoid idling at major traffic intersections.`;
  }

  return {
    recommendedRouteIndex: bestIdx,
    verdict,
    verdictHeadline,
    analysis,
    betterRouteSuggestion,
  };
}

/**
 * Format the prompt sent to Gemini for evaluating candidate corridors along a journey.
 */
export function buildRouteSafetyPrompt(
  evaluatedRoutes: EvaluatedRoute[],
  originName: string,
  destName: string,
  familyProfile: FamilyProfile
): string {
  const routeSummaries = evaluatedRoutes
    .map(
      (r) =>
        `Route ${r.index} (${r.label}): ${r.distanceKm} km, ${r.durationMin} min, Avg US AQI ${r.avgAqi}, Peak US AQI ${r.maxAqi}, Avg PM2.5 ${r.avgPm25} µg/m³`
    )
    .join("\n");

  return `You are AQIfer's Route & Commute Air Quality Safety AI.
Evaluate this journey from "${originName}" to "${destName}":

Routes Found:
${routeSummaries}

Traveler Profile:
- Commute Mode: ${familyProfile.commute}
- Vulnerable Household Members: ${familyProfile.members.join(", ") || "General adults"}

Instructions:
1. Give an unambiguous verdict ('SAFE', 'CAUTION', or 'AVOID') based on the route AQI, peak hotspot, and commute mode.
2. In 'analysis', explain the exposure along the route citing exact AQI and PM2.5 numbers.
3. In 'betterRouteSuggestion', compare the routes if an alternative has lower AQI, or suggest a safer commute swap (e.g. Metro/enclosed AC car), N95 mask, or timing adjustment.
4. Set 'recommendedRouteIndex' to the 0-based index of the cleanest route.`;
}

/**
 * Parse and sanitize AI JSON output against evaluated route bounds and heuristic fallbacks.
 */
export function parseAiRouteVerdict(
  aiText: string | null,
  routeCount: number,
  heuristic: Omit<RouteSafetyResult, "origin" | "destination" | "routes">
): Omit<RouteSafetyResult, "origin" | "destination" | "routes"> {
  if (!aiText) {
    return heuristic;
  }

  try {
    const parsed = JSON.parse(aiText) as Partial<
      Omit<RouteSafetyResult, "origin" | "destination" | "routes">
    >;
    const safeIdx =
      typeof parsed.recommendedRouteIndex === "number" &&
      parsed.recommendedRouteIndex >= 0 &&
      parsed.recommendedRouteIndex < routeCount
        ? parsed.recommendedRouteIndex
        : heuristic.recommendedRouteIndex;

    const validVerdict =
      parsed.verdict === "SAFE" || parsed.verdict === "CAUTION" || parsed.verdict === "AVOID"
        ? parsed.verdict
        : heuristic.verdict;

    return {
      verdict: validVerdict,
      verdictHeadline: parsed.verdictHeadline || heuristic.verdictHeadline,
      analysis: parsed.analysis || heuristic.analysis,
      betterRouteSuggestion: parsed.betterRouteSuggestion || heuristic.betterRouteSuggestion,
      recommendedRouteIndex: safeIdx,
    };
  } catch {
    return heuristic;
  }
}
