import { NextRequest, NextResponse } from "next/server";
import {
  buildSmogPlanPrompt,
  generateHeuristicSmogPlan,
  generateWithGeminiFallback,
  getGeminiClient,
  smogPlanResponseSchema,
} from "@/lib/gemini";
import { DEFAULT_FAMILY_PROFILE } from "@/lib/format";
import { getErrorMessage, normalizeFamilyProfile } from "@/lib/http";
import { AISmogPlan, FamilyProfile, HourlyAQIPoint } from "@/types";

export const runtime = "edge";

/** Generate a household-tailored 24-hour AI smog action plan (with epidemiological fallback). */
export async function POST(req: NextRequest) {
  let city = "Your City";
  let forecast24h: HourlyAQIPoint[] = [];
  let familyProfile: FamilyProfile = DEFAULT_FAMILY_PROFILE;

  try {
    const body = (await req.json()) as {
      city?: unknown;
      forecast24h?: unknown;
      familyProfile?: unknown;
    };
    city = typeof body.city === "string" && body.city.trim() ? body.city.trim().slice(0, 120) : city;
    forecast24h = Array.isArray(body.forecast24h) ? (body.forecast24h as HourlyAQIPoint[]) : [];
    familyProfile = normalizeFamilyProfile(body.familyProfile);

    const gemini = getGeminiClient();
    if (!gemini) {
      return NextResponse.json(generateHeuristicSmogPlan(city, forecast24h, familyProfile));
    }

    const prompt = buildSmogPlanPrompt(city, forecast24h, familyProfile);
    const text = await generateWithGeminiFallback(gemini, prompt, {
      responseSchema: smogPlanResponseSchema,
      temperature: 0.2,
    });

    if (text) {
      const plan = JSON.parse(text) as AISmogPlan;
      return NextResponse.json(plan);
    }

    return NextResponse.json(generateHeuristicSmogPlan(city, forecast24h, familyProfile));
  } catch (error: unknown) {
    console.warn("Using heuristic smog plan fallback:", getErrorMessage(error));
    return NextResponse.json(generateHeuristicSmogPlan(city, forecast24h, familyProfile));
  }
}
