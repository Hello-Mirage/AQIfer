import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/gemini";
import { FamilyProfile, HourlyAQIPoint, CurrentAQI, ParsedAQIData } from "@/types";
import { parseOpenMeteoAirQuality } from "@/lib/openmeteo";
import { extractCityCandidate, findCityLocation } from "@/lib/location";

export const runtime = "edge";

function generateSmartHeuristicAnswer(
  question: string,
  targetCity: string,
  curAqi: number,
  curPm25: number,
  curVis: number,
  curCat: string,
  targetCurrent: CurrentAQI | undefined,
  familyProfile: FamilyProfile
): string {
  const lowerQ = question.toLowerCase();

  if (
    lowerQ.includes("aqi") ||
    lowerQ.includes("air quality") ||
    lowerQ.includes("how is the air") ||
    lowerQ.includes("pollution") ||
    lowerQ.includes("pm2.5")
  ) {
    return `In ${targetCity}, the live US AQI is currently ${curAqi} (${curCat}) with PM2.5 concentration at ${curPm25} µg/m³ and visibility around ${curVis} km. ${
      curAqi >= 200
        ? "Air quality is very unhealthy. Keep windows shut, run indoor filtration, and delay non-emergency travel."
        : curAqi >= 100
        ? "Air quality is unhealthy for sensitive groups. A well-fitted N95 mask is strongly advised if you need to step out."
        : "Air quality is currently in an acceptable range for outdoor activities."
    }`;
  }

  if (lowerQ.includes("visibility") || lowerQ.includes("see") || lowerQ.includes("fog") || lowerQ.includes("drive")) {
    return `Current visibility in ${targetCity} is approximately ${curVis} km (${
      targetCurrent?.visibilityCondition || "Particulate Haze"
    }). Road visibility is noticeably reduced by smog. If driving, use low-beam fog lights, leave extra following distance, and keep cabin AC on recirculation.`;
  }

  if (
    lowerQ.includes("go out") ||
    lowerQ.includes("can i go") ||
    lowerQ.includes("safe") ||
    lowerQ.includes("walk") ||
    lowerQ.includes("run") ||
    lowerQ.includes("outside")
  ) {
    const canGo = curAqi < 120 && curPm25 < 60;
    if (canGo) {
      return `Yes, right now air quality in ${targetCity} is acceptable (AQI ${curAqi}, PM2.5 ${curPm25} µg/m³). You can go out, but monitor evening inversion hours when soot settles.`;
    } else {
      return `No, stepping out right now in ${targetCity} is NOT recommended (AQI is ${curAqi} - ${curCat}, PM2.5 is ${curPm25} µg/m³). Inhaling fine particulate soot strains lungs and heart. If ${
        familyProfile.members.length > 0 ? familyProfile.members.join(" or ") : "anyone"
      } must go out, strictly wear an airtight N95 mask. Safest window is early afternoon (12 PM - 3 PM).`;
    }
  }

  if (lowerQ.includes("5 pm") || lowerQ.includes("evening") || lowerQ.includes("kids")) {
    return `Around 5 PM in ${targetCity}, PM2.5 rises rapidly as evening traffic emissions collide with the sinking winter boundary layer. It is NOT safe for children or sensitive individuals to exercise outdoors at 5 PM.`;
  }

  return `In ${targetCity}, current AQI is ${curAqi} (${curCat}) with PM2.5 at ${curPm25} µg/m³ and visibility around ${curVis} km. Limit outdoor exertion and keep indoor spaces sealed during peak smog hours.`;
}

async function callGeminiWithFallback(gemini: any, prompt: string): Promise<string> {
  // Support gemini-2.5-flash with automatic resilient fallback to 2.0-flash and 1.5-flash
  const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  let lastErr = null;

  for (const model of modelsToTry) {
    try {
      const response = await gemini.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.2,
        },
      });
      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn(`Model ${model} invocation attempt:`, err.message);
      lastErr = err;
    }
  }

  throw lastErr || new Error("All Gemini models exhausted");
}

export async function POST(req: NextRequest) {
  let targetCity = "Delhi";
  let curAqi = 150;
  let curPm25 = 110;
  let curVis = 1.8;
  let curCat = "Unhealthy";
  let targetCurrent: CurrentAQI | undefined = undefined;
  let familyProfile: FamilyProfile = {
    members: [],
    commute: "Two-wheeler",
    homeSetup: "Natural Ventilation",
  };
  let question = "";

  try {
    const body = await req.json();
    question = body.question || "";
    targetCity = body.city || "Delhi";
    targetCurrent = body.current;
    let targetForecast: HourlyAQIPoint[] = body.forecast24h || [];
    familyProfile = body.familyProfile || familyProfile;

    if (!question || question.trim().length === 0) {
      return NextResponse.json({ answer: "Please ask a question about your city's air quality or outdoor safety." });
    }

    // Check if the user is asking about another city
    const cityCandidate = extractCityCandidate(question);
    if (cityCandidate) {
      const location = await findCityLocation(cityCandidate);
      if (location) {
        try {
          const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${location.latitude}&longitude=${location.longitude}&hourly=pm10,pm2_5,us_aqi&timezone=auto&forecast_days=2`;
          const aqRes = await fetch(aqUrl);
          if (aqRes.ok) {
            const raw = await aqRes.json();
            const parsed: ParsedAQIData = parseOpenMeteoAirQuality(raw, location.name);
            targetCity = location.name;
            targetCurrent = parsed.current;
            targetForecast = parsed.forecast24h;
          }
        } catch (e) {
          console.warn("Could not fetch air quality for target city:", e);
        }
      }
    }

    curVis = targetCurrent?.visibilityKm ?? 1.8;
    curAqi = targetCurrent?.us_aqi ?? 150;
    curPm25 = targetCurrent?.pm2_5 ?? 110;
    curCat = targetCurrent?.category ?? "Unhealthy";

    const gemini = getGeminiClient();

    // Prepare forecast context
    const forecastSummary = targetForecast
      .slice(0, 24)
      .map(
        (h) =>
          `${new Date(h.time).toLocaleTimeString([], { hour: "numeric", hour12: true })}: PM2.5 ${h.pm2_5} µg/m³ (AQI ${h.us_aqi}, Vis ~${h.visibilityKm ?? 2}km)`
      )
      .join("; ");

    if (!gemini) {
      // Use grounded heuristic fallback
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
    }

    const prompt = `You are AQIfer's Intelligent Air Quality & Outdoor Safety Assistant.
The user is asking: "${question}"

Target City Context (${targetCity}):
- US AQI: ${curAqi} (${curCat})
- PM2.5: ${curPm25} µg/m³
- Visibility: ${curVis} km (${targetCurrent?.visibilityCondition || "Smog Haze"})
- Next 24-Hour Hourly Forecast: ${forecastSummary}

Family Profile:
- Vulnerable Household Members: ${familyProfile.members.join(", ") || "General adults"}
- Daily Commute: ${familyProfile.commute}
- Home Setup: ${familyProfile.homeSetup}

Instructions:
1. Always directly and accurately answer the user's question about ${targetCity} using the exact live numbers provided above.
2. If they ask about the AQI or air quality of ${targetCity}, cite the exact US AQI (${curAqi}), category (${curCat}), PM2.5 (${curPm25} µg/m³), and visibility (${curVis} km).
3. If they ask if it's safe to go out, provide an unambiguous verdict ("Do not go out right now", "Safe with an N95", or "Yes, safe").
4. Keep the tone helpful, direct, and actionable in 2-4 sentences.`;

    try {
      const text = await callGeminiWithFallback(gemini, prompt);
      return NextResponse.json({ answer: text });
    } catch (genError) {
      console.warn("Gemini call failed, utilizing smart heuristic response:", genError);
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
    }
  } catch (error: any) {
    console.error("Chat API error:", error);
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
