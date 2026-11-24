import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient, smogPlanResponseSchema, generateHeuristicSmogPlan } from "@/lib/gemini";
import { FamilyProfile, HourlyAQIPoint, AISmogPlan } from "@/types";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      city = "Your City",
      forecast24h = [],
      familyProfile = {
        members: ["School Kids"],
        commute: "Two-wheeler",
        homeSetup: "Natural Ventilation",
      },
    }: {
      city: string;
      forecast24h: HourlyAQIPoint[];
      familyProfile: FamilyProfile;
    } = body;

    const gemini = getGeminiClient();

    if (!gemini) {
      // Graceful fallback plan if GEMINI_API_KEY is not configured
      const fallbackPlan = generateHeuristicSmogPlan(city, forecast24h, familyProfile);
      return NextResponse.json(fallbackPlan);
    }

    // Prepare concise prompt with 24 hours of forecast data & profile
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

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: smogPlanResponseSchema,
        temperature: 0.2,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini");
    }

    const plan: AISmogPlan = JSON.parse(text);
    return NextResponse.json(plan);
  } catch (error: any) {
    console.error("Gemini API error, using heuristic fallback:", error);
    try {
      const body = await req.json().catch(() => ({}));
      const fallback = generateHeuristicSmogPlan(
        body.city || "Selected City",
        body.forecast24h || [],
        body.familyProfile || {
          members: [],
          commute: "Public Transit",
          homeSetup: "Natural Ventilation",
        }
      );
      return NextResponse.json(fallback);
    } catch {
      return NextResponse.json(
        { error: "Failed to generate AI Smog Plan" },
        { status: 500 }
      );
    }
  }
}
