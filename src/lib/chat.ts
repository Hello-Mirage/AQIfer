import { CurrentAQI, FamilyProfile, HourlyAQIPoint, ParsedAQIData } from "@/types";
import { extractCityCandidate, findCityLocation } from "@/lib/location";
import {
  OpenMeteoAirQualityRawResponse,
  parseOpenMeteoAirQuality,
} from "@/lib/openmeteo";
import { fetchJsonWithTimeout, getErrorMessage } from "@/lib/http";
import { formatHourLabel } from "@/lib/format";

/** Default fallback telemetry values used when no live city reading is supplied. */
export const DEFAULT_CHAT_METRICS = {
  city: "Delhi",
  usAqi: 150,
  pm25: 110,
  visibilityKm: 1.8,
  category: "Unhealthy",
} as const;

const AQI_QUERY_KEYWORDS = ["aqi", "air quality", "how is the air", "pollution", "pm2.5"];
const VISIBILITY_KEYWORDS = ["visibility", "see", "fog", "drive"];
const OUTDOOR_KEYWORDS = ["go out", "can i go", "safe", "walk", "run", "outside"];
const EVENING_KEYWORDS = ["5 pm", "evening", "kids"];

function containsAny(haystack: string, keywords: readonly string[]): boolean {
  return keywords.some((kw) => haystack.includes(kw));
}

/**
 * Generate a data-grounded fallback answer when Gemini is unavailable or fails.
 */
export function generateSmartHeuristicAnswer(
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

  if (containsAny(lowerQ, AQI_QUERY_KEYWORDS)) {
    const severityNote =
      curAqi >= 200
        ? "Air quality is very unhealthy. Keep windows shut, run indoor filtration, and delay non-emergency travel."
        : curAqi >= 100
        ? "Air quality is unhealthy for sensitive groups. A well-fitted N95 mask is strongly advised if you need to step out."
        : "Air quality is currently in an acceptable range for outdoor activities.";

    return `In ${targetCity}, the live US AQI is currently ${curAqi} (${curCat}) with PM2.5 concentration at ${curPm25} µg/m³ and visibility around ${curVis} km. ${severityNote}`;
  }

  if (containsAny(lowerQ, VISIBILITY_KEYWORDS)) {
    const condition = targetCurrent?.visibilityCondition || "Particulate Haze";
    return `Current visibility in ${targetCity} is approximately ${curVis} km (${condition}). Road visibility is noticeably reduced by smog. If driving, use low-beam fog lights, leave extra following distance, and keep cabin AC on recirculation.`;
  }

  if (containsAny(lowerQ, OUTDOOR_KEYWORDS)) {
    if (curAqi < 120 && curPm25 < 60) {
      return `Yes, right now air quality in ${targetCity} is acceptable (AQI ${curAqi}, PM2.5 ${curPm25} µg/m³). You can go out, but monitor evening inversion hours when soot settles.`;
    }
    const memberGroup =
      familyProfile.members.length > 0 ? familyProfile.members.join(" or ") : "anyone";
    return `No, stepping out right now in ${targetCity} is NOT recommended (AQI is ${curAqi} - ${curCat}, PM2.5 is ${curPm25} µg/m³). Inhaling fine particulate soot strains lungs and heart. If ${memberGroup} must go out, strictly wear an airtight N95 mask. Safest window is early afternoon (12 PM - 3 PM).`;
  }

  if (containsAny(lowerQ, EVENING_KEYWORDS)) {
    return `Around 5 PM in ${targetCity}, PM2.5 rises rapidly as evening traffic emissions collide with the sinking winter boundary layer. It is NOT safe for children or sensitive individuals to exercise outdoors at 5 PM.`;
  }

  return `In ${targetCity}, current AQI is ${curAqi} (${curCat}) with PM2.5 at ${curPm25} µg/m³ and visibility around ${curVis} km. Limit outdoor exertion and keep indoor spaces sealed during peak smog hours.`;
}

/**
 * Format the prompt passed to Gemini for answering follow-up air quality questions.
 */
export function buildChatPrompt(params: {
  question: string;
  targetCity: string;
  curAqi: number;
  curCat: string;
  curPm25: number;
  curVis: number;
  visibilityCondition?: string;
  forecast24h: HourlyAQIPoint[];
  familyProfile: FamilyProfile;
}): string {
  const {
    question,
    targetCity,
    curAqi,
    curCat,
    curPm25,
    curVis,
    visibilityCondition,
    forecast24h,
    familyProfile,
  } = params;

  const forecastSummary = forecast24h
    .slice(0, 24)
    .map(
      (h) =>
        `${formatHourLabel(h.time)}: PM2.5 ${h.pm2_5} µg/m³ (AQI ${h.us_aqi}, Vis ~${
          h.visibilityKm ?? 2
        }km)`
    )
    .join("; ");

  return `You are AQIfer's Intelligent Air Quality & Outdoor Safety Assistant.
The user is asking: "${question}"

Target City Context (${targetCity}):
- US AQI: ${curAqi} (${curCat})
- PM2.5: ${curPm25} µg/m³
- Visibility: ${curVis} km (${visibilityCondition || "Smog Haze"})
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
}

/**
 * Resolve city-specific Open-Meteo telemetry when a chat prompt asks about a different city.
 */
export async function resolveTargetCityAirQuality(
  question: string,
  fallbackCity: string,
  fallbackCurrent: CurrentAQI | undefined,
  fallbackForecast: HourlyAQIPoint[]
): Promise<{
  city: string;
  current: CurrentAQI | undefined;
  forecast24h: HourlyAQIPoint[];
}> {
  const cityCandidate = extractCityCandidate(question);
  if (!cityCandidate) {
    return { city: fallbackCity, current: fallbackCurrent, forecast24h: fallbackForecast };
  }

  const location = await findCityLocation(cityCandidate);
  if (!location) {
    return { city: fallbackCity, current: fallbackCurrent, forecast24h: fallbackForecast };
  }

  try {
    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${location.latitude}&longitude=${location.longitude}&hourly=pm10,pm2_5,us_aqi&timezone=auto&forecast_days=2`;
    const raw = await fetchJsonWithTimeout<OpenMeteoAirQualityRawResponse>(aqUrl, {
      timeoutMs: 6000,
    });
    if (raw) {
      const parsed: ParsedAQIData = parseOpenMeteoAirQuality(raw, location.name);
      return {
        city: location.name,
        current: parsed.current,
        forecast24h: parsed.forecast24h,
      };
    }
  } catch (err: unknown) {
    console.warn("Could not fetch air quality for target city:", getErrorMessage(err));
  }

  return { city: fallbackCity, current: fallbackCurrent, forecast24h: fallbackForecast };
}
