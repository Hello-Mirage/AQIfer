import { describe, it, expect } from "vitest";
import { getAQICategory, parseOpenMeteoAirQuality, createFallbackAQIData } from "./openmeteo";
import { extractCityCandidate } from "./location";

describe("Open-Meteo Air Quality parser and fallbacks", () => {
  it("correctly classifies AQI categories according to EPA standards", () => {
    expect(getAQICategory(25).category).toBe("Good");
    expect(getAQICategory(75).category).toBe("Moderate");
    expect(getAQICategory(125).category).toBe("Unhealthy for Sensitive Groups");
    expect(getAQICategory(175).category).toBe("Unhealthy");
    expect(getAQICategory(250).category).toBe("Very Unhealthy");
    expect(getAQICategory(400).category).toBe("Hazardous");
  });

  it("parses simulated Open-Meteo hourly data into current and 24-hour forecast", () => {
    const times: string[] = [];
    const pm2_5: number[] = [];
    const pm10: number[] = [];
    const us_aqi: number[] = [];

    const baseTime = new Date("2026-11-24T10:00:00Z");
    for (let i = 0; i < 48; i++) {
      const d = new Date(baseTime.getTime() + i * 3600 * 1000);
      times.push(d.toISOString());
      pm2_5.push(100 + i);
      pm10.push(150 + i);
      us_aqi.push(170 + i);
    }

    const mockResponse = {
      latitude: 28.6139,
      longitude: 77.209,
      hourly: { time: times, pm2_5, pm10, us_aqi },
    };

    const parsed = parseOpenMeteoAirQuality(mockResponse, "Delhi", baseTime);

    expect(parsed.city).toBe("Delhi");
    expect(parsed.current.pm2_5).toBe(100);
    expect(parsed.current.us_aqi).toBe(170);
    expect(parsed.current.category).toBe("Unhealthy");
    expect(parsed.forecast24h.length).toBe(24);
    expect(parsed.forecast24h[0].time).toBe(baseTime.toISOString());
  });

  it("creates a valid 24-hour fallback plan if external API is unreachable", () => {
    const fallback = createFallbackAQIData("Kolkata");
    expect(fallback.city).toBe("Kolkata");
    expect(fallback.forecast24h.length).toBe(24);
    expect(fallback.current.pm2_5).toBeGreaterThan(0);
    expect(fallback.current.category).toBeDefined();
    expect(fallback.current.color).toBeDefined();
  });

  it("throws error when invalid data format is passed", () => {
    expect(() => parseOpenMeteoAirQuality(null as any)).toThrow("Invalid Open-Meteo response format");
    expect(() => parseOpenMeteoAirQuality({ hourly: {} })).toThrow("Invalid Open-Meteo response format");
  });

  it("extracts city candidate properly and ignores non-city activity words", () => {
    // Should NOT extract activity words as cities
    expect(extractCityCandidate("How bad is the visibility for driving right now?")).toBeNull();
    expect(extractCityCandidate("Can I go out for walking?")).toBeNull();
    expect(extractCityCandidate("Is it safe for kids right now?")).toBeNull();
    expect(extractCityCandidate("Is it safe in the morning?")).toBeNull();

    // Should accurately extract real city queries
    expect(extractCityCandidate("what is the air quality in kozhikode")).toBe("kozhikode");
    expect(extractCityCandidate("what is the currect aqi in kozhikode")).toBe("kozhikode");
    expect(extractCityCandidate("what is the aqi in west bengal haldia")).toBe("west bengal haldia");
    expect(extractCityCandidate("is it safe in Mumbai today?")).toBe("Mumbai");
    expect(extractCityCandidate("Kolkata aqi")).toBe("Kolkata");
  });
});
