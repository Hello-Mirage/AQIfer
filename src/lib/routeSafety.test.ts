import { describe, it, expect } from "vitest";
import { sampleWaypoints, generateHeuristicRouteVerdict } from "./routeSafety";
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
    expect(sampled.length).toBe(5);
    expect(sampled[0]).toEqual(coords[0]);
    expect(sampled[4]).toEqual(coords[10]);

    const shortCoords: [number, number][] = [[28.6, 77.2], [28.61, 77.21]];
    expect(sampleWaypoints(shortCoords, 5)).toEqual(shortCoords);
  });

  it("returns AVOID verdict for high AQI on exposed two-wheeler commute", () => {
    const routes = [makeRoute(0, 175, 220)];
    const res = generateHeuristicRouteVerdict(routes, "Connaught Place", "India Gate", baseProfile);
    expect(res.verdict).toBe("AVOID");
    expect(res.verdictHeadline).toContain("Avoid two-wheeler");
    expect(res.recommendedRouteIndex).toBe(0);
  });

  it("recommends cleaner alternative route when available", () => {
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
  });

  it("returns SAFE verdict when AQI is low across all routes", () => {
    const routes = [makeRoute(0, 42, 48)];
    const res = generateHeuristicRouteVerdict(routes, "Park", "Library", {
      members: [],
      commute: "Car",
      homeSetup: "Natural Ventilation",
    });
    expect(res.verdict).toBe("SAFE");
    expect(res.recommendedRouteIndex).toBe(0);
  });
});
