import { NextRequest, NextResponse } from "next/server";
import {
  getGeminiClient,
  smogPlanResponseSchema,
  generateHeuristicSmogPlan,
  generateWithGeminiFallback,
} from "@/lib/gemini";
import { FamilyProfile, HourlyAQIPoint, AISmogPlan } from "@/types";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  let city = "Your City";
  let forecast24h: HourlyAQIPoint[] = [];
  let familyProfile: FamilyProfile = {
    members: ["School Kids"],
    commute: "Two-wheeler",
    homeSetup: "Natural Ventilation",
  };

  try {
    const body = await req.json();
    city = body.city || "Your City";
    forecast24h = body.forecast24h || [];
    familyProfile = body.familyProfile || familyProfile;

    const gemini = getGeminiClient();

    if (!gemini) {
      const fallbackPlan = generateHeuristicSmogPlan(city, forecast24h, familyProfile);
      return NextResponse.json(fallbackPlan);
    }

    // Prepare concise prompt
    const forecastSummary = forecast24h
      .slice(0, 24)
      .map(
        (h) =>
          `${new Date(h.time).toLocaleTimeString([], { hour: "numeric", hour12: true })}: PM2.5=${h.pm2_5} µg/m³, AQI=${h.us_aqi}`
      )
      .join(" | ");

    const prompt = `You are an expert Urban Environmental Epidemiologist and Smog Protection Advisor for families.
Analyze the next 24-hour winter air quality forecast for ${city} and this family's specific household profile:

Family Profile:
- Vulnerable Household Members: ${familyProfile.members.length > 0 ? familyProfile.members.join(", ") : "None specifically vulnerable"}
- Primary Daily Commute: ${familyProfile.commute}
- Home Setup: ${familyProfile.homeSetup}

Next 24-Hour Hourly AQI Data:
${forecastSummary}

Generate an actionable, high-impact Smog Plan strictly following the schema.
Requirements:
1. Safe Outdoor Windows: Identify the exact hours when PM2.5 dips to lowest levels (typically midday 12-4 PM when solar warming breaks thermal inversion). Note suitability for school runs or groceries, risk level, and the physical/health reason why.
2. Indoor Air Hacks: 3 concrete, realistic indoor hacks customized for their home setup (${familyProfile.homeSetup}) and vulnerable members. Include damp-mopping, ventilation timing, and room zoning. Every hack must include a clear explanation of its direct health impact.
3. Sustainable Commute Swap: 1 realistic low-emission or exposure-reducing alternative for their commute (${familyProfile.commute}) with clear direct health and tailpipe pollution reduction reasoning.
4. Explanations: Every single recommendation must clearly explain the direct health or environmental impact.`;

    const text = await generateWithGeminiFallback(gemini, prompt, {
      responseSchema: smogPlanResponseSchema,
      temperature: 0.2,
    });
    if (text) {
      const plan: AISmogPlan = JSON.parse(text);
      return NextResponse.json(plan);
    }

    const fallbackPlan = generateHeuristicSmogPlan(city, forecast24h, familyProfile);
    return NextResponse.json(fallbackPlan);
  } catch (error: any) {
    console.warn("Using heuristic smog plan fallback:", error.message);
    const fallback = generateHeuristicSmogPlan(city, forecast24h, familyProfile);
    return NextResponse.json(fallback);
  }
}
