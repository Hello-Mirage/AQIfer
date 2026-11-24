import { describe, it, expect, vi, afterEach } from "vitest";
import { extractCityCandidate, findCityLocation } from "./location";

describe("Location extraction and geocoding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts valid city names and ignores activity/time words", () => {
    expect(extractCityCandidate("what is the air quality in kozhikode")).toBe("kozhikode");
    expect(extractCityCandidate("what is the currect aqi in kozhikode")).toBe("kozhikode");
    expect(extractCityCandidate("what is the aqi in west bengal haldia")).toBe("west bengal haldia");
    expect(extractCityCandidate("is it safe in Mumbai today?")).toBe("Mumbai");
    expect(extractCityCandidate("Kolkata aqi")).toBe("Kolkata");

    expect(extractCityCandidate("How bad is the visibility for driving right now?")).toBeNull();
    expect(extractCityCandidate("Can I go out for walking?")).toBeNull();
    expect(extractCityCandidate("Is it safe for kids right now?")).toBeNull();
    expect(extractCityCandidate("Is it safe in the morning?")).toBeNull();
  });

  it("resolves Indian preset cities immediately without network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const loc = await findCityLocation("west bengal haldia");
    expect(loc).not.toBeNull();
    expect(loc?.name).toContain("Haldia");
    expect(loc?.latitude).toBeCloseTo(22.0624, 2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("queries Open-Meteo geocoding for non-preset cities", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [{ name: "Kozhikode", admin1: "Kerala", country: "India", latitude: 11.248, longitude: 75.78 }],
        }),
        { status: 200 }
      )
    );

    const loc = await findCityLocation("kozhikode");
    expect(loc).toEqual({
      name: "Kozhikode, Kerala (India)",
      latitude: 11.248,
      longitude: 75.78,
    });
  });

  it("returns null gracefully when geocoding fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const loc = await findCityLocation("AtlantisUnknownCity");
    expect(loc).toBeNull();
  });
});
