import { describe, it, expect } from "vitest";
import { generateHeuristicSmogPlan } from "./gemini";
import { createFallbackAQIData } from "./openmeteo";
import { FamilyProfile } from "@/types";

describe("Gemini Smog Plan Fallback Generator", () => {
  const profile: FamilyProfile = {
    members: ["Infants", "Elderly"],
    commute: "Two-wheeler",
    homeSetup: "Air Purifier",
  };

  it("generates a structured Smog Plan matching all schema requirements", () => {
    const fallbackAQI = createFallbackAQIData("Delhi");
    const plan = generateHeuristicSmogPlan("Delhi", fallbackAQI.forecast24h, profile);

    expect(plan.headlineSummary).toContain("Delhi");
    expect(plan.safeWindows.length).toBeGreaterThan(0);
    expect(plan.indoorHacks.length).toBe(3);
    expect(plan.commuteSwap.recommendation).toBeDefined();
    expect(plan.commuteSwap.why).toBeDefined();

    // Verify clear why explanations are provided
    plan.safeWindows.forEach((win) => {
      expect(win.why.length).toBeGreaterThan(10);
      expect(win.timeWindow).toBeDefined();
    });

    plan.indoorHacks.forEach((hack) => {
      expect(hack.why.length).toBeGreaterThan(10);
      expect(hack.action.length).toBeGreaterThan(10);
    });
  });

  it("customizes indoor hacks based on home setup", () => {
    const fallbackAQI = createFallbackAQIData("Kolkata");
    
    // Purifier setup
    const purifierPlan = generateHeuristicSmogPlan("Kolkata", fallbackAQI.forecast24h, {
      ...profile,
      homeSetup: "Air Purifier",
    });
    expect(purifierPlan.indoorHacks[0].title).toContain("Purifier");

    // Natural ventilation setup
    const ventilationPlan = generateHeuristicSmogPlan("Kolkata", fallbackAQI.forecast24h, {
      ...profile,
      homeSetup: "Natural Ventilation",
    });
    expect(ventilationPlan.indoorHacks[0].title).toContain("Ventilation");
  });

  it("customizes commute swap based on user's primary commute", () => {
    const fallbackAQI = createFallbackAQIData("Mumbai");
    const twoWheelerPlan = generateHeuristicSmogPlan("Mumbai", fallbackAQI.forecast24h, {
      ...profile,
      commute: "Two-wheeler",
    });
    expect(twoWheelerPlan.commuteSwap.recommendation.toLowerCase()).toContain("metro");

    const carPlan = generateHeuristicSmogPlan("Mumbai", fallbackAQI.forecast24h, {
      ...profile,
      commute: "Car",
    });
    expect(carPlan.commuteSwap.recommendation.toLowerCase()).toContain("re-circulation");
  });
});
