import { NextRequest, NextResponse } from "next/server";
import {
  buildChatPrompt,
  DEFAULT_CHAT_METRICS,
  generateSmartHeuristicAnswer,
  resolveTargetCityAirQuality,
} from "@/lib/chat";
import { generateWithGeminiFallback, getGeminiClient } from "@/lib/gemini";
import { DEFAULT_FAMILY_PROFILE } from "@/lib/format";
import { getErrorMessage, normalizeFamilyProfile } from "@/lib/http";
import { CurrentAQI, FamilyProfile, HourlyAQIPoint } from "@/types";

export const runtime = "edge";

/** Answer user air-quality questions grounded in live city forecast data. */
export async function POST(req: NextRequest) {
  let targetCity: string = DEFAULT_CHAT_METRICS.city;
  let curAqi: number = DEFAULT_CHAT_METRICS.usAqi;
  let curPm25: number = DEFAULT_CHAT_METRICS.pm25;
  let curVis: number = DEFAULT_CHAT_METRICS.visibilityKm;
  let curCat: string = DEFAULT_CHAT_METRICS.category;
  let targetCurrent: CurrentAQI | undefined;
  let familyProfile: FamilyProfile = DEFAULT_FAMILY_PROFILE;
  let question = "";

  try {
    const body = (await req.json()) as {
      question?: unknown;
      city?: unknown;
      current?: CurrentAQI;
      forecast24h?: unknown;
      familyProfile?: unknown;
    };

    question = typeof body.question === "string" ? body.question.slice(0, 1000) : "";
    targetCity =
      typeof body.city === "string" && body.city.trim()
        ? body.city.trim().slice(0, 120)
        : targetCity;
    targetCurrent = body.current;
    let targetForecast: HourlyAQIPoint[] = Array.isArray(body.forecast24h)
      ? (body.forecast24h as HourlyAQIPoint[])
      : [];
    familyProfile = normalizeFamilyProfile(body.familyProfile);

    if (!question.trim()) {
      return NextResponse.json({
        answer: "Please ask a question about your city's air quality or outdoor safety.",
      });
    }

    const resolved = await resolveTargetCityAirQuality(
      question,
      targetCity,
      targetCurrent,
      targetForecast
    );
    targetCity = resolved.city;
    targetCurrent = resolved.current;
    targetForecast = resolved.forecast24h;

    curVis = targetCurrent?.visibilityKm ?? DEFAULT_CHAT_METRICS.visibilityKm;
    curAqi = targetCurrent?.us_aqi ?? DEFAULT_CHAT_METRICS.usAqi;
    curPm25 = targetCurrent?.pm2_5 ?? DEFAULT_CHAT_METRICS.pm25;
    curCat = targetCurrent?.category ?? DEFAULT_CHAT_METRICS.category;

    const gemini = getGeminiClient();
    if (gemini) {
      const prompt = buildChatPrompt({
        question,
        targetCity,
        curAqi,
        curCat,
        curPm25,
        curVis,
        visibilityCondition: targetCurrent?.visibilityCondition,
        forecast24h: targetForecast,
        familyProfile,
      });
      const text = await generateWithGeminiFallback(gemini, prompt, { temperature: 0.2 });
      if (text) {
        return NextResponse.json({ answer: text });
      }
    }

    const answer = generateSmartHeuristicAnswer(
      question,
      targetCity,
      curAqi,
      curPm25,
      curVis,
      curCat,
      targetCurrent,
      familyProfile
    );
    return NextResponse.json({ answer });
  } catch (error: unknown) {
    console.error("Chat API error:", getErrorMessage(error));
    const fallbackAnswer = generateSmartHeuristicAnswer(
      question || "general query",
      targetCity,
      curAqi,
      curPm25,
      curVis,
      curCat,
      targetCurrent,
      familyProfile
    );
    return NextResponse.json({ answer: fallbackAnswer });
  }
}
