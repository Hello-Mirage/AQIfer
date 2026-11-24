import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/gemini";
import { FamilyProfile, HourlyAQIPoint, CurrentAQI } from "@/types";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      question,
      city = "Your City",
      current,
      forecast24h = [],
      familyProfile = {
        members: [],
        commute: "Two-wheeler",
        homeSetup: "Natural Ventilation",
      },
    }: {
      question: string;
      city: string;
      current?: CurrentAQI;
      forecast24h: HourlyAQIPoint[];
      familyProfile: FamilyProfile;
    } = body;

    if (!question || question.trim().length === 0) {
      return NextResponse.json({ answer: "Please ask a question about your city's air quality or outdoor safety." });
    }

    const gemini = getGeminiClient();

    // Prepare forecast context
    const forecastSummary = forecast24h
      .slice(0, 24)
      .map(
        (h) =>
          `${new Date(h.time).toLocaleTimeString([], { hour: "numeric", hour12: true })}: PM2.5 ${h.pm2_5} µg/m³ (AQI ${h.us_aqi}, Vis ~${h.visibilityKm ?? 2}km)`
      )
      .join("; ");

    const curVis = current?.visibilityKm ?? 1.5;
    const curAqi = current?.us_aqi ?? 200;
    const curPm25 = current?.pm2_5 ?? 150;
    const curCat = current?.category ?? "Unhealthy";

    if (!gemini) {
      // Smart grounded heuristic fallback
      const lowerQ = question.toLowerCase();
      let answer = "";

      if (lowerQ.includes("visibility") || lowerQ.includes("see") || lowerQ.includes("fog") || lowerQ.includes("drive")) {
        answer = `Current visibility in ${city} is approximately ${curVis} km (${current?.visibilityCondition || "Heavy Haze"}). Road visibility is severely impaired by dense particulate smog. If driving or riding, slow down, use low-beam fog lights, keep vehicle windows rolled up, and avoid two-wheeler commuting if possible.`;
      } else if (lowerQ.includes("go out") || lowerQ.includes("can i go") || lowerQ.includes("safe") || lowerQ.includes("walk") || lowerQ.includes("run") || lowerQ.includes("outside")) {
        const canGo = curAqi < 120 && curPm25 < 60;
        if (canGo) {
          answer = `Yes, right now air quality in ${city} is acceptable (AQI ${curAqi}, PM2.5 ${curPm25} µg/m³). You can go out for errands, but check the evening forecast as winter inversion traps pollution after sunset.`;
        } else {
          answer = `No, going out right now is NOT recommended (AQI is ${curAqi} - ${curCat}, PM2.5 is ${curPm25} µg/m³). Inhaling this particulate soot puts high strain on lungs and heart. If ${familyProfile.members.length > 0 ? familyProfile.members.join(" or ") : "anyone"} must step out, strictly wear a well-fitted N95 mask and limit outdoor time. The safest window today is around midday (12 PM - 3 PM).`;
        }
      } else if (lowerQ.includes("5 pm") || lowerQ.includes("evening")) {
        answer = `Around 5 PM in ${city}, PM2.5 rises rapidly as evening rush-hour emissions collide with the setting sun and falling boundary layer (inversion). It is NOT safe for children or sensitive groups to exercise outdoors at 5 PM.`;
      } else {
        answer = `In ${city}, current AQI is ${curAqi} (${curCat}) with visibility around ${curVis} km. Postpone non-essential outdoor exertion, seal indoor spaces, and utilize the midday 12 PM - 3 PM window when particulate levels are lowest.`;
      }
      return NextResponse.json({ answer });
    }

    const prompt = `You are Aqifier's Intelligent Air Quality & Outdoor Safety Assistant for ${city}.
Family Profile:
- Vulnerable Household Members: ${familyProfile.members.join(", ") || "General adults"}
- Daily Commute: ${familyProfile.commute}
- Home Setup: ${familyProfile.homeSetup}

Current Environmental State in ${city}:
- US AQI: ${curAqi} (${curCat})
- PM2.5: ${curPm25} µg/m³
- Visibility: ${curVis} km (${current?.visibilityCondition || "Smog Haze"})

Next 24-Hour Hourly Forecast:
${forecastSummary}

User's Question: "${question}"

Instructions:
1. Provide a direct, authoritative, and medically grounded answer in 2-4 sentences.
2. Directly answer "Can I go out?" with a clear verdict (e.g. "Do not go out right now", "Safe only with an N95", or "Yes, this window is clear").
3. If they ask about visibility, driving, or fog, cite the exact visibility (${curVis} km) and caution regarding road hazards and black carbon inhalation.
4. Ground any time inquiries (e.g. 5 PM, morning, evening) in the hourly PM2.5 numbers provided.
5. Provide 1 immediate practical action tailored to their family profile.`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.2,
      },
    });

    const answer = response.text || "Pollution levels are currently high. Please limit outdoor exposure and wear an N95 mask.";
    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json({
      answer: "Current air quality is degraded with reduced visibility. We recommend remaining indoors and limiting outdoor exertion.",
    });
  }
}
