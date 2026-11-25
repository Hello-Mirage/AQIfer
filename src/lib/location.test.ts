import { describe, it, expect, vi, afterEach } from "vitest";
import {
  extractCityCandidate,
  findCityLocation,
  geocodePlace,
  searchGeocodeCities,
} from "./location";

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

  it("queries Open-Meteo geocoding with progressive fallback for multi-word places", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                name: "Kozhikode",
                admin1: "Kerala",
                country: "India",
                latitude: 11.248,
                longitude: 75.78,
              },
            ],
          }),
          { status: 200 }
        )
      );

    const loc = await findCityLocation("north kozhikode");
    expect(loc).toEqual({
      name: "Kozhikode, Kerala (India)",
      latitude: 11.248,
      longitude: 75.78,
    });
  });

  it("searchGeocodeCities maps Open-Meteo autocomplete results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [{ name: "Jaipur", admin1: "Rajasthan", country: "India", latitude: 26.9, longitude: 75.8 }],
        }),
        { status: 200 }
      )
    );

    const cities = await searchGeocodeCities("Jaipur", 5);
    expect(cities).toHaveLength(1);
    expect(cities[0].name).toBe("Jaipur");
  });

  it("geocodePlace prefers Nominatim and falls back to Open-Meteo or null on error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ display_name: "India Gate, New Delhi, India", lat: "28.6129", lon: "77.2295" }]),
          { status: 200 }
        )
      );

    const nominatimHit = await geocodePlace("India Gate", "Delhi");
    expect(nominatimHit).toEqual({
      name: "India Gate, New Delhi",
      latitude: 28.6129,
      longitude: 77.2295,
    });

    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Nominatim offline"))
      .mockRejectedValueOnce(new Error("Nominatim offline"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ results: [{ name: "Connaught Place", admin1: "Delhi", latitude: 28.63, longitude: 77.21 }] }),
          { status: 200 }
        )
      );

    const omFallback = await geocodePlace("Connaught Place", "Delhi");
    expect(omFallback).toEqual({
      name: "Connaught Place, Delhi",
      latitude: 28.63,
      longitude: 77.21,
    });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    expect(await findCityLocation("AtlantisUnknownCity")).toBeNull();
    expect(await geocodePlace("AtlantisUnknownCity")).toBeNull();
  });
});
