import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AISmogPlan, FamilyProfile, HourlyAQIPoint } from "@/types";
import { getErrorMessage } from "@/lib/http";
import { formatHourLabel } from "@/lib/format";

const DEFAULT_GENERATION_TEMPERATURE = 0.2;
const SAFE_WINDOW_SPAN_MS = 3 * 3600 * 1000;

/** Ordered Gemini Flash model fallback chain from highest quality to widest quota availability. */
export const GEMINI_MODEL_CASCADE = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

/**
 * Instantiate an authenticated Google GenAI SDK client, or return `null` when
 * `GEMINI_API_KEY` is missing or left at its placeholder value.
 */
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

/** Structured JSON schema constraining Gemini Smog Plan responses. */
export const smogPlanResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headlineSummary: {
      type: Type.STRING,
      description:
        "One crisp, urgent sentence summarizing today's smog risk and primary action for this family.",
    },
    safeWindows: {
      type: Type.ARRAY,
      description: "Safe outdoor windows in the next 24 hours when PM2.5 is lowest.",
      items: {
        type: Type.OBJECT,
        properties: {
          timeWindow: {
            type: Type.STRING,
            description: "E.g. '12:00 PM - 03:00 PM' or '01:00 PM - 04:00 PM'",
          },
          pm25Level: {
            type: Type.NUMBER,
            description: "Estimated average PM2.5 for this window in µg/m³",
          },
          riskLevel: {
            type: Type.STRING,
            description: "Risk level: 'Low', 'Moderate', 'High', or 'Severe'",
          },
          bestFor: {
            type: Type.STRING,
            description: "E.g. 'School runs, grocery pickup, gentle walking'",
          },
          why: {
            type: Type.STRING,
            description:
              "Concise direct health explanation why this window is safest compared to morning/evening inversions.",
          },
        },
        required: ["timeWindow", "pm25Level", "riskLevel", "bestFor", "why"],
      },
    },
    indoorHacks: {
      type: Type.ARRAY,
      description:
        "Exactly 3 practical indoor air hacks tailored to their home setup (Air Purifier vs Natural Ventilation) and vulnerable family members.",
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description:
              "Short catchy title, e.g. 'Ventilation Window Lockout', 'Damp-Mopping Barrier'",
          },
          action: {
            type: Type.STRING,
            description: "Concrete step-by-step action the family should take indoors today.",
          },
          why: {
            type: Type.STRING,
            description: "Direct health explanation of how this reduces indoor PM2.5 exposure.",
          },
        },
        required: ["title", "action", "why"],
      },
    },
    commuteSwap: {
      type: Type.OBJECT,
      description:
        "One sustainable low-emission or exposure-reducing alternative tailored to their current commute.",
      properties: {
        recommendation: {
          type: Type.STRING,
          description:
            "Specific alternative recommendation (e.g. switching two-wheeler to metro or sealed carpooling with N95).",
        },
        why: {
          type: Type.STRING,
          description:
            "Explanation of health protection from direct tailpipe inhalation and local emissions reduction.",
        },
      },
      required: ["recommendation", "why"],
    },
  },
  required: ["headlineSummary", "safeWindows", "indoorHacks", "commuteSwap"],
};

const COMMUTE_RECOMMENDATIONS: Record<FamilyProfile["commute"], string> = {
  "Two-wheeler": "Switch to Metro/Electric Bus or carpool with windows rolled up and N95 masks.",
  "Walk/Cycle":
    "Reroute along secondary tree-lined residential roads away from main arterial traffic or take rapid transit.",
  Car: "Switch AC to internal re-circulation mode and verify cabin pollen/air filter cleanliness.",
  "Public Transit":
    "Use rapid transit lines instead of open auto-rickshaws during peak morning 8 AM - 10 AM traffic.",
};

/**
 * Format the prompt passed to Gemini for generating a household-tailored 24-hour smog plan.
 */
export function buildSmogPlanPrompt(
  city: string,
  forecast24h: HourlyAQIPoint[],
  familyProfile: FamilyProfile
): string {
  const forecastSummary = forecast24h
    .slice(0, 24)
    .map((h) => `${formatHourLabel(h.time)}: PM2.5=${h.pm2_5} µg/m³, AQI=${h.us_aqi}`)
    .join(" | ");

  const memberSummary =
    familyProfile.members.length > 0
      ? familyProfile.members.join(", ")
      : "None specifically vulnerable";

  return `You are an expert Urban Environmental Epidemiologist and Smog Protection Advisor for families.
Analyze the next 24-hour winter air quality forecast for ${city} and this family's specific household profile:

Family Profile:
- Vulnerable Household Members: ${memberSummary}
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
}

/**
 * Deterministic epidemiological fallback smog plan used when Gemini is offline or unconfigured.
 */
export function generateHeuristicSmogPlan(
  city: string,
  forecast24h: HourlyAQIPoint[],
  profile: FamilyProfile
): AISmogPlan {
  const sortedHours = [...forecast24h].sort((a, b) => a.pm2_5 - b.pm2_5);
  const bestHour = sortedHours[0] ?? {
    time: new Date().toISOString(),
    pm2_5: 65,
    pm10: 100,
    us_aqi: 150,
  };
  const worstHour = sortedHours[sortedHours.length - 1] ?? bestHour;

  const bestHourDate = new Date(bestHour.time);
  const bestHourStr = bestHourDate.toLocaleTimeString([], { hour: "numeric", hour12: true });
  const endHourStr = new Date(bestHourDate.getTime() + SAFE_WINDOW_SPAN_MS).toLocaleTimeString(
    [],
    { hour: "numeric", hour12: true }
  );
  const timeWindowStr = `${bestHourStr} - ${endHourStr}`;

  const isPurifier = profile.homeSetup === "Air Purifier";
  const hasVulnerable = profile.members.length > 0;
  const riskLevel = bestHour.pm2_5 < 60 ? "Moderate" : bestHour.pm2_5 < 150 ? "High" : "Severe";

  return {
    headlineSummary: `Air quality in ${city} peaks at PM2.5 ${worstHour.pm2_5} µg/m³. Midday hours (${timeWindowStr}) offer the safest air for ${
      profile.members.join(", ") || "household members"
    }.`,
    safeWindows: [
      {
        timeWindow: timeWindowStr,
        pm25Level: bestHour.pm2_5,
        riskLevel,
        bestFor: "Essential outdoor commutes, school runs, quick errands",
        why: "Thermal solar heating breaks the winter inversion layer midday, dispersing heavy ground-level particulate matter.",
      },
      {
        timeWindow: "01:00 PM - 04:00 PM",
        pm25Level: Math.round(bestHour.pm2_5 * 1.1),
        riskLevel: "Moderate",
        bestFor: "School pickup and window-sealed transit",
        why: "Surface winds are highest in early afternoon, lowering surface-level micro-pollutant concentration by up to 35%.",
      },
    ],
    indoorHacks: [
      {
        title: isPurifier
          ? "Air Purifier High-CADR Lockdown"
          : "Strict Midday-Only Natural Ventilation",
        action: isPurifier
          ? "Seal window seams with draft stoppers and run HEPA purifiers on medium-high in sleeping quarters before bedtime."
          : "Keep all exterior windows shut during peak inversion hours (7 AM - 11 AM and 6 PM - 10 PM). Open cross-ventilation only between 1 PM and 3 PM.",
        why: "Cold winter air traps toxic diesel soot at window sills. Controlling infiltration cuts indoor PM2.5 infiltration by 40-70%.",
      },
      {
        title: "Damp-Mopping Dust Suppression",
        action:
          "Avoid dry sweeping or vacuuming without HEPA exhaust. Use warm damp microfiber mopping twice daily.",
        why: "Dry brooms re-suspend settled PM2.5 and PM10 particles into breathing zones, triggering immediate bronchial irritation.",
      },
      {
        title: hasVulnerable
          ? "Vulnerable Member Respiratory Shield"
          : "Cooking Exhaust Isolation",
        action: hasVulnerable
          ? "Ensure infants, elderly, and respiratory patients remain in an inner closed room with minimal air exchange during peak smog."
          : "Run kitchen exhaust fans and close interior doors while cooking oils to prevent compounding ultra-fine indoor volatile emissions.",
        why: "Fine particulate matter crosses lung alveolar barriers directly into the bloodstream, posing elevated cardiovascular strain.",
      },
    ],
    commuteSwap: {
      recommendation:
        COMMUTE_RECOMMENDATIONS[profile.commute] ?? COMMUTE_RECOMMENDATIONS["Public Transit"],
      why: "Two-wheeler and roadside commuters inhale 4x higher concentrations of fresh black carbon and unburned hydrocarbons directly from exhaust pipes.",
    },
  };
}

/**
 * Invoke Gemini across a resilient model cascade (2.5-flash -> 2.0-flash -> 1.5-flash).
 * Returns `null` if no client is available or all models fail.
 */
export async function generateWithGeminiFallback(
  gemini: GoogleGenAI | null,
  prompt: string,
  options?: {
    responseSchema?: Schema;
    temperature?: number;
  }
): Promise<string | null> {
  if (!gemini) {
    return null;
  }

  for (const model of GEMINI_MODEL_CASCADE) {
    try {
      const config: Record<string, unknown> = {
        temperature: options?.temperature ?? DEFAULT_GENERATION_TEMPERATURE,
      };
      if (options?.responseSchema) {
        config.responseMimeType = "application/json";
        config.responseSchema = options.responseSchema;
      }

      const response = await gemini.models.generateContent({
        model,
        contents: prompt,
        config,
      });

      if (response?.text) {
        return response.text;
      }
    } catch (err: unknown) {
      console.warn(`Gemini model ${model} failed:`, getErrorMessage(err));
    }
  }

  return null;
}
