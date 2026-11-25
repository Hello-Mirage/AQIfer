import { describe, it, expect, vi, afterEach } from "vitest";
import { GoogleGenAI } from "@google/genai";
import {
  buildSmogPlanPrompt,
  GEMINI_MODEL_CASCADE,
  generateHeuristicSmogPlan,
  generateWithGeminiFallback,
  getGeminiClient,
  smogPlanResponseSchema,
} from "./gemini";
import { createFallbackAQIData } from "./openmeteo";
import { FamilyProfile } from "@/types";

describe("Gemini Smog Plan generator & model cascade", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  const profile: FamilyProfile = {
    members: ["Infants", "Elderly"],
    commute: "Two-wheeler",
    homeSetup: "Air Purifier",
  };

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalKey;
    }
    vi.restoreAllMocks();
  });

  it("getGeminiClient returns null without real API key and instantiates client with valid key", () => {
    delete process.env.GEMINI_API_KEY;
    expect(getGeminiClient()).toBeNull();

    process.env.GEMINI_API_KEY = "your_gemini_api_key_here";
    expect(getGeminiClient()).toBeNull();

    process.env.GEMINI_API_KEY = "AIzaTestValidLookingKey123";
    expect(getGeminiClient()).toBeInstanceOf(GoogleGenAI);
  });

  it("generateHeuristicSmogPlan satisfies full schema requirements across home & commute variants", () => {
    const fallbackAQI = createFallbackAQIData("Delhi");
    const plan = generateHeuristicSmogPlan("Delhi", fallbackAQI.forecast24h, profile);

    expect(plan.headlineSummary).toContain("Delhi");
    expect(plan.safeWindows.length).toBeGreaterThan(0);
    expect(plan.indoorHacks).toHaveLength(3);
    expect(plan.commuteSwap.recommendation).toBeDefined();

    const ventWalkPlan = generateHeuristicSmogPlan("Kolkata", [], {
      members: [],
      commute: "Walk/Cycle",
      homeSetup: "Natural Ventilation",
    });
    expect(ventWalkPlan.indoorHacks[0].title).toContain("Ventilation");
    expect(ventWalkPlan.indoorHacks[2].title).toContain("Cooking Exhaust");
    expect(ventWalkPlan.commuteSwap.recommendation.toLowerCase()).toContain("secondary");

    const transitPlan = generateHeuristicSmogPlan("Mumbai", fallbackAQI.forecast24h, {
      members: ["Asthma"],
      commute: "Public Transit",
      homeSetup: "Air Purifier",
    });
    expect(transitPlan.commuteSwap.recommendation.toLowerCase()).toContain("rapid transit");

    const carPlan = generateHeuristicSmogPlan("Mumbai", fallbackAQI.forecast24h, {
      members: [],
      commute: "Car",
      homeSetup: "Air Purifier",
    });
    expect(carPlan.commuteSwap.recommendation.toLowerCase()).toContain("re-circulation");

    const severePlan = generateHeuristicSmogPlan(
      "Delhi",
      [{ time: new Date().toISOString(), pm2_5: 190, pm10: 280, us_aqi: 250 }],
      { members: ["Infants"], commute: "Car", homeSetup: "Natural Ventilation" }
    );
    expect(severePlan.safeWindows[0].riskLevel).toBe("Severe");
  });

  it("buildSmogPlanPrompt embeds city, profile, and forecast context", () => {
    const data = createFallbackAQIData("Haldia");
    const prompt = buildSmogPlanPrompt("Haldia", data.forecast24h, {
      members: [],
      commute: "Car",
      homeSetup: "Air Purifier",
    });
    expect(prompt).toContain("Haldia");
    expect(prompt).toContain("None specifically vulnerable");
    expect(prompt).toContain("Air Purifier");
  });

  it("generateWithGeminiFallback returns null when client is null or all models fail", async () => {
    expect(await generateWithGeminiFallback(null, "test prompt")).toBeNull();

    const failingClient = {
      models: {
        generateContent: vi.fn().mockRejectedValue(new Error("429 Quota exceeded")),
      },
    } as unknown as GoogleGenAI;

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await generateWithGeminiFallback(failingClient, "test prompt");
    expect(res).toBeNull();
    expect(failingClient.models.generateContent).toHaveBeenCalledTimes(GEMINI_MODEL_CASCADE.length);
  });

  it("generateWithGeminiFallback cascades to fallback model and passes JSON schema when requested", async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce({ text: "" })
      .mockRejectedValueOnce(new Error("Secondary overloaded"))
      .mockResolvedValueOnce({ text: '{"ok":true}' });

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockClient = { models: { generateContent } } as unknown as GoogleGenAI;

    const result = await generateWithGeminiFallback(mockClient, "test", {
      responseSchema: smogPlanResponseSchema,
      temperature: 0.1,
    });

    expect(result).toBe('{"ok":true}');
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(generateContent.mock.calls[0][0].model).toBe(GEMINI_MODEL_CASCADE[0]);
    expect(generateContent.mock.calls[2][0].model).toBe(GEMINI_MODEL_CASCADE[2]);
    expect(generateContent.mock.calls[2][0].config.responseMimeType).toBe("application/json");
  });
});
