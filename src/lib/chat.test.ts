import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildChatPrompt,
  generateSmartHeuristicAnswer,
  resolveTargetCityAirQuality,
} from "./chat";
import { CurrentAQI, FamilyProfile } from "@/types";

const baseProfile: FamilyProfile = {
  members: ["School Kids", "Elderly"],
  commute: "Two-wheeler",
  homeSetup: "Natural Ventilation",
};

const sampleCurrent: CurrentAQI = {
  pm2_5: 140,
  pm10: 230,
  us_aqi: 215,
  time: "2026-11-25T10:00:00Z",
  category: "Very Unhealthy",
  color: "#8a3fb0",
  visibilityKm: 3.2,
  visibilityCondition: "Poor, slow down",
};

describe("Chat heuristics and city air-quality resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles AQI questions across very unhealthy, moderate/sensitive, and clean bands", () => {
    const high = generateSmartHeuristicAnswer(
      "What is the AQI?",
      "Delhi",
      220,
      150,
      2.5,
      "Very Unhealthy",
      sampleCurrent,
      baseProfile
    );
    expect(high).toContain("very unhealthy");

    const mid = generateSmartHeuristicAnswer(
      "air quality check",
      "Kolkata",
      140,
      55,
      7.2,
      "Unhealthy for Sensitive Groups",
      undefined,
      baseProfile
    );
    expect(mid).toContain("N95 mask");

    const low = generateSmartHeuristicAnswer(
      "How is pollution?",
      "Bengaluru",
      42,
      11,
      12,
      "Good",
      undefined,
      baseProfile
    );
    expect(low).toContain("acceptable range");
  });

  it("handles driving/visibility, walk/outdoor safety, 5 pm kids, and general queries", () => {
    const drive = generateSmartHeuristicAnswer(
      "How bad is visibility for driving?",
      "Delhi",
      215,
      140,
      3.2,
      "Very Unhealthy",
      sampleCurrent,
      baseProfile
    );
    expect(drive).toContain("3.2 km");
    expect(drive).toContain("Poor, slow down");

    const safeWalk = generateSmartHeuristicAnswer(
      "Can I go for a walk outside?",
      "Bengaluru",
      60,
      18,
      12,
      "Moderate",
      undefined,
      baseProfile
    );
    expect(safeWalk).toContain("Yes, right now air quality in Bengaluru is acceptable");

    const unsafeWalk = generateSmartHeuristicAnswer(
      "Is it safe to walk outside?",
      "Delhi",
      215,
      140,
      3.2,
      "Very Unhealthy",
      sampleCurrent,
      { ...baseProfile, members: [] }
    );
    expect(unsafeWalk).toContain("NOT recommended");
    expect(unsafeWalk).toContain("If anyone must go out");

    const evening = generateSmartHeuristicAnswer(
      "What about 5 pm for kids?",
      "Delhi",
      215,
      140,
      3.2,
      "Very Unhealthy",
      sampleCurrent,
      baseProfile
    );
    expect(evening).toContain("NOT safe for children");

    const generic = generateSmartHeuristicAnswer(
      "Should I buy houseplants?",
      "Delhi",
      215,
      140,
      3.2,
      "Very Unhealthy",
      sampleCurrent,
      baseProfile
    );
    expect(generic).toContain("Limit outdoor exertion");
  });

  it("builds structured chat prompt with forecast summary", () => {
    const prompt = buildChatPrompt({
      question: "Is it safe to jog?",
      targetCity: "Mumbai",
      curAqi: 90,
      curCat: "Moderate",
      curPm25: 30,
      curVis: 10,
      forecast24h: [
        { time: new Date(2026, 10, 25, 14, 0, 0).toISOString(), pm2_5: 30, pm10: 50, us_aqi: 90 },
      ],
      familyProfile: { members: [], commute: "Car", homeSetup: "Air Purifier" },
    });
    expect(prompt).toContain("Mumbai");
    expect(prompt).toContain("General adults");
    expect(prompt).toContain("Vis ~2km");
  });

  it("resolveTargetCityAirQuality retains fallback city on activity question and overrides on city question", async () => {
    const unchanged = await resolveTargetCityAirQuality(
      "How bad is driving right now?",
      "Delhi",
      sampleCurrent,
      []
    );
    expect(unchanged.city).toBe("Delhi");

    const baseTime = new Date("2026-11-25T10:00:00Z");
    const times = Array.from({ length: 24 }, (_, i) =>
      new Date(baseTime.getTime() + i * 3600 * 1000).toISOString()
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          latitude: 19.076,
          longitude: 72.8777,
          hourly: {
            time: times,
            pm2_5: Array(24).fill(28),
            pm10: Array(24).fill(45),
            us_aqi: Array(24).fill(84),
          },
        }),
        { status: 200 }
      )
    );

    const switched = await resolveTargetCityAirQuality(
      "What is the AQI in Mumbai?",
      "Delhi",
      sampleCurrent,
      []
    );
    expect(switched.city).toBe("Mumbai, Maharashtra");
    expect(switched.current?.us_aqi).toBe(84);
  });
});
