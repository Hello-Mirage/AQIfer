import { describe, it, expect } from "vitest";
import {
  buildFallbackCorridor,
  buildRouteSafetyPrompt,
  evaluateOsrmRoutes,
  generateHeuristicRouteVerdict,
  parseAiRouteVerdict,
  prepareRouteSamples,
  sampleWaypoints,
} from "./routeSafety";
import { EvaluatedRoute, FamilyProfile } from "@/types";

const baseProfile: FamilyProfile = {
  members: ["School Kids"],
  commute: "Two-wheeler",
  homeSetup: "Natural Ventilation",
};

function makeRoute(index: number, avgAqi: number, maxAqi: number): EvaluatedRoute {
  return {
    index,
    label: index === 0 ? "Primary Route" : `Alternative Route ${index}`,
    distanceKm: 6.4,
    durationMin: 18,
    avgAqi,
    maxAqi,
    avgPm25: Math.round(avgAqi * 0.45),
    coordinates: [
      [28.61, 77.2],
      [28.62, 77.22],
    ],
    waypoints: [],
    color: "#d6403a",
  };
}

describe("Route Safety helpers", () => {
  it("samples evenly spaced waypoints along a polyline", () => {
    const coords: [number, number][] = Array.from({ length: 11 }, (_, i) => [28.6 + i * 0.01, 77.2]);
    const sampled = sampleWaypoints(coords, 5);
    expect(sampled).toHaveLength(5);
    expect(sampled[0]).toEqual(coords[0]);
    expect(sampled[4]).toEqual(coords[10]);

    const shortCoords: [number, number][] = [
      [28.6, 77.2],
      [28.61, 77.21],
    ];
    expect(sampleWaypoints(shortCoords, 5)).toEqual(shortCoords);
  });

  it("constructs fallback corridor and evaluates OSRM routes with waypoint AQI averages", () => {
    const corridor = buildFallbackCorridor(
      { latitude: 28.6, longitude: 77.2 },
      { latitude: 28.64, longitude: 77.24 }
    );
    expect(corridor).toHaveLength(1);
    const samples = prepareRouteSamples(corridor);
    expect(samples[0].waypoints).toHaveLength(3);

    const evaluated = evaluateOsrmRoutes(samples, [
      { current: { pm2_5: 40, us_aqi: 110 } },
      { current: { pm2_5: 60, us_aqi: 150 } },
      {},
    ]);
    expect(evaluated[0].avgAqi).toBe(Math.round((110 + 150 + 135) / 3));
    expect(evaluated[0].maxAqi).toBe(150);
  });

  it("returns AVOID verdict for high AQI or max hotspot >= 200", () => {
    const exposedRes = generateHeuristicRouteVerdict(
      [makeRoute(0, 175, 220)],
      "Connaught Place",
      "India Gate",
      baseProfile
    );
    expect(exposedRes.verdict).toBe("AVOID");
    expect(exposedRes.verdictHeadline).toContain("Avoid two-wheeler");

    const singleSevereCar = generateHeuristicRouteVerdict(
      [makeRoute(0, 180, 205)],
      "Point A",
      "Point B",
      { members: [], commute: "Car", homeSetup: "Air Purifier" }
    );
    expect(singleSevereCar.verdict).toBe("AVOID");
    expect(singleSevereCar.betterRouteSuggestion).toContain("enclosed public transit");
  });

  it("recommends cleaner alternative route and handles tied averages by lowest peak AQI", () => {
    const routes = [makeRoute(0, 145, 160), makeRoute(1, 105, 115)];
    const res = generateHeuristicRouteVerdict(routes, "Howrah", "Salt Lake", {
      members: [],
      commute: "Car",
      homeSetup: "Air Purifier",
    });
    expect(res.verdict).toBe("CAUTION");
    expect(res.recommendedRouteIndex).toBe(1);
    expect(res.betterRouteSuggestion).toContain("Alternative Route 1");
    expect(res.betterRouteSuggestion).toContain("40 points");

    const tied = generateHeuristicRouteVerdict(
      [makeRoute(0, 80, 110), makeRoute(1, 80, 90)],
      "Park",
      "Station",
      baseProfile
    );
    expect(tied.verdict).toBe("CAUTION");
    expect(tied.recommendedRouteIndex).toBe(1);
  });

  it("returns SAFE verdict when AQI is low across all routes", () => {
    const routes = [makeRoute(0, 42, 48)];
    const res = generateHeuristicRouteVerdict(routes, "Park", "Library", {
      members: [],
      commute: "Car",
      homeSetup: "Natural Ventilation",
    });
    expect(res.verdict).toBe("SAFE");
    expect(res.betterRouteSuggestion).toContain("cleanest corridor");
  });

  it("builds route prompts and validates/clamps Gemini AI route verdicts", () => {
    const routes = [makeRoute(0, 150, 170), makeRoute(1, 110, 120)];
    const prompt = buildRouteSafetyPrompt(routes, "A", "B", baseProfile);
    expect(prompt).toContain("Primary Route");
    expect(prompt).toContain("Alternative Route 1");

    const heuristic = generateHeuristicRouteVerdict(routes, "A", "B", baseProfile);

    expect(parseAiRouteVerdict(null, 2, heuristic)).toEqual(heuristic);
    expect(parseAiRouteVerdict("{not-json", 2, heuristic)).toEqual(heuristic);

    const sanitized = parseAiRouteVerdict(
      JSON.stringify({
        verdict: "INVALID_STATUS",
        verdictHeadline: "Custom headline",
        recommendedRouteIndex: 99,
      }),
      2,
      heuristic
    );
    expect(sanitized.verdict).toBe(heuristic.verdict);
    expect(sanitized.verdictHeadline).toBe("Custom headline");
    expect(sanitized.recommendedRouteIndex).toBe(heuristic.recommendedRouteIndex);

    const validAi = parseAiRouteVerdict(
      JSON.stringify({
        verdict: "CAUTION",
        verdictHeadline: "AI Headline",
        analysis: "AI Analysis",
        betterRouteSuggestion: "Take Route 1",
        recommendedRouteIndex: 1,
      }),
      2,
      heuristic
    );
    expect(validAi.verdict).toBe("CAUTION");
    expect(validAi.recommendedRouteIndex).toBe(1);
  });
});
