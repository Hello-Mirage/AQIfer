import { describe, it, expect } from "vitest";
import {
  buildAqiGridPoints,
  computeOutdoorVerdict,
  computeSafestWindows,
  createFallbackAQIData,
  createFallbackAqiGrid,
  estimateVisibilityFromPM25,
  getAQICategory,
  parseOpenMeteoAirQuality,
} from "./openmeteo";
import { HourlyAQIPoint } from "@/types";

describe("Open-Meteo Air Quality parser and domain computations", () => {
  it("correctly classifies EPA AQI categories at exact threshold boundaries", () => {
    expect(getAQICategory(0).category).toBe("Good");
    expect(getAQICategory(50).category).toBe("Good");
    expect(getAQICategory(51).category).toBe("Moderate");
    expect(getAQICategory(100).category).toBe("Moderate");
    expect(getAQICategory(101).category).toBe("Unhealthy for Sensitive Groups");
    expect(getAQICategory(150).category).toBe("Unhealthy for Sensitive Groups");
    expect(getAQICategory(151).category).toBe("Unhealthy");
    expect(getAQICategory(200).category).toBe("Unhealthy");
    expect(getAQICategory(201).category).toBe("Very Unhealthy");
    expect(getAQICategory(300).category).toBe("Very Unhealthy");
    expect(getAQICategory(301).category).toBe("Hazardous");
  });

  it("estimates visibility with min/max clamps and condition labels", () => {
    expect(estimateVisibilityFromPM25(5)).toEqual({
      km: 12,
      condition: "Clear enough to drive",
    });
    expect(estimateVisibilityFromPM25(120)).toEqual({
      km: 7.1,
      condition: "Hazy, drive with lights on",
    });
    expect(estimateVisibilityFromPM25(165)).toEqual({
      km: 3,
      condition: "Poor, slow down",
    });
    expect(estimateVisibilityFromPM25(500)).toEqual({
      km: 1.5,
      condition: "Poor, slow down",
    });
  });

  it("computes outdoor verdicts for SAFE, HAZARDOUS, and STAY_INDOORS bands", () => {
    expect(computeOutdoorVerdict(45, 8, "Bengaluru").status).toBe("SAFE");
    expect(computeOutdoorVerdict(145, 55, "Mumbai").status).toBe("HAZARDOUS");
    expect(computeOutdoorVerdict(240, 160, "Delhi").status).toBe("STAY_INDOORS");
  });

  it("parses Open-Meteo 48h payload into current reading and 24-hour forecast", () => {
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

    const parsed = parseOpenMeteoAirQuality(
      { latitude: 28.6139, longitude: 77.209, hourly: { time: times, pm2_5, pm10, us_aqi } },
      "Delhi",
      baseTime
    );

    expect(parsed.city).toBe("Delhi");
    expect(parsed.current.pm2_5).toBe(100);
    expect(parsed.current.us_aqi).toBe(170);
    expect(parsed.current.category).toBe("Unhealthy");
    expect(parsed.forecast24h).toHaveLength(24);
    expect(parsed.forecast24h[0].time).toBe(baseTime.toISOString());
  });

  it("falls back to closest timestamp and pads short forecast arrays to 24 hours", () => {
    const t0 = new Date("2026-11-24T08:00:00Z");
    const t1 = new Date("2026-11-24T09:00:00Z");
    const parsed = parseOpenMeteoAirQuality(
      {
        hourly: {
          time: [t0.toISOString(), t1.toISOString()],
          pm2_5: [30, 35],
        },
      },
      "Pune",
      new Date("2026-11-24T15:00:00Z")
    );

    expect(parsed.current.time).toBe(t1.toISOString());
    expect(parsed.current.pm10).toBe(0);
    expect(parsed.forecast24h).toHaveLength(24);
  });

  it("throws descriptive error when invalid data format is passed", () => {
    expect(() => parseOpenMeteoAirQuality(null)).toThrow("Invalid Open-Meteo response format");
    expect(() => parseOpenMeteoAirQuality({ hourly: {} })).toThrow(
      "Invalid Open-Meteo response format"
    );
  });

  it("creates 24-hour diurnal fallback data for preset, custom-PM, and unknown cities", () => {
    const kolkata = createFallbackAQIData("Kolkata");
    expect(kolkata.city).toBe("Kolkata");
    expect(kolkata.forecast24h).toHaveLength(24);

    const custom = createFallbackAQIData("CustomCity", 210);
    expect(custom.current.pm2_5).toBeCloseTo(210, 0);
  });

  it("identifies up to two separated safest daytime windows and detects Tomorrow spillover", () => {
    expect(computeSafestWindows([])).toEqual([]);

    const baseDay = new Date(2026, 10, 25, 0, 0, 0);
    const forecast: HourlyAQIPoint[] = Array.from({ length: 24 }, (_, idx) => {
      const hour = idx;
      // Lowest pollution around 7-8 am and 2-3 pm
      const pm = hour === 7 || hour === 8 ? 40 : hour === 14 || hour === 15 ? 32 : 180;
      return {
        time: new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate(), hour).toISOString(),
        pm2_5: pm,
        pm10: pm * 1.5,
        us_aqi: pm * 2,
      };
    });

    const windows = computeSafestWindows(forecast, 12);
    expect(windows).toHaveLength(2);
    expect(windows[0].avgPm).toBe(32);
    expect(windows[0].idx).toBe(14);
    expect(windows[0].day).toBe("Tomorrow");
    expect(Math.abs(windows[0].idx - windows[1].idx)).toBeGreaterThanOrEqual(3);
  });

  it("builds normalized AQI grid points and simulated 3x3 fallback points", () => {
    const points = buildAqiGridPoints(
      [{ current: { pm2_5: 22.34, us_aqi: 74 } }],
      22.5,
      88.3
    );
    expect(points).toHaveLength(1);
    expect(points[0].category).toBe("Moderate");
    expect(points[0].label).toBe("City Center");
    expect(points[0].latitude).toBeCloseTo(22.5, 4);

    const fallbackGrid = createFallbackAqiGrid(28.6, 77.2);
    expect(fallbackGrid).toHaveLength(9);
    expect(fallbackGrid[0].label).toBe("City Center");
  });
});
