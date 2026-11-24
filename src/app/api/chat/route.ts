import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/gemini";
import { FamilyProfile, HourlyAQIPoint, CurrentAQI, ParsedAQIData } from "@/types";
import { INDIAN_PRESET_CITIES, parseOpenMeteoAirQuality } from "@/lib/openmeteo";

export const runtime = "edge";

function extractCityCandidate(question: string): string | null {
  const cleanQ = question.replace(/[?.,!]/g, " ").trim();

  // Pattern 1: "... in/of/for/at <city>"
  const prepMatch = cleanQ.match(/\b(?:in|of|for|at)\s+([A-Za-z\s]+)$/i);
  if (prepMatch && prepMatch[1]) {
    let candidate = prepMatch[1]
      .replace(/\b(right now|today|currently|tomorrow|please|tonight|this morning|this afternoon|this evening)\b/gi, "")
      .trim();
    if (candidate.length > 2) return candidate;
  }

  // Pattern 2: "<city> aqi", "<city> air quality", "<city> smog", "is it safe in <city>"
  const prefixMatch = cleanQ.match(/^([A-Za-z\s]+?)\s+(?:aqi|air quality|smog|pollution|weather)/i);
  if (prefixMatch && prefixMatch[1]) {
    let candidate = prefixMatch[1]
      .replace(/\b(how is|what is|tell me|check|give me)\b/gi, "")
      .trim();
    if (candidate.length > 2) return candidate;
  }

  // Pattern 3: Check if any preset city or major city is mentioned anywhere in the question
  for (const preset of INDIAN_PRESET_CITIES) {
    if (new RegExp(`\\b${preset.name}\\b`, "i").test(cleanQ)) {
      return preset.name;
    }
  }

  return null;
}

async function findCityLocation(candidate: string) {
  const candLower = candidate.toLowerCase();

  // 1. Check Indian preset cities
  const matchedPreset = INDIAN_PRESET_CITIES.find(
    (p) => candLower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(candLower)
  );
  if (matchedPreset) {
    return {
      name: `${matchedPreset.name}, ${matchedPreset.admin1 || "India"}`,
      latitude: matchedPreset.latitude,
      longitude: matchedPreset.longitude,
    };
  }

  // 2. Query Open-Meteo Geocoding
  const tryQueries = [candidate];
  const words = candidate.split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 1) {
    tryQueries.push(words[words.length - 1]); // e.g. "Haldia" if candidate was "West Bengal Haldia"
    tryQueries.push(words[0]);
  }

  for (const q of tryQueries) {
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        q
      )}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results[0]) {
          const place = geoData.results[0];
          return {
            name: `${place.name}${place.admin1 ? ", " + place.admin1 : ""}${
              place.country ? " (" + place.country + ")" : ""
            }`,
            latitude: place.latitude,
            longitude: place.longitude,
          };
        }
      }
    } catch (e) {
      // Continue to next query attempt
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let {
      question,
      city = "Delhi",
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

    const lowerQ = question.toLowerCase();

    // Check if the user is asking about another city
    let targetCity = city;
    let targetCurrent = current;
    let targetForecast = forecast24h;

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

    const curVis = targetCurrent?.visibilityKm ?? 1.8;
    const curAqi = targetCurrent?.us_aqi ?? 150;
    const curPm25 = targetCurrent?.pm2_5 ?? 110;
    const curCat = targetCurrent?.category ?? "Unhealthy";

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
      // Smart grounded heuristic fallback
      let answer = "";
      if (lowerQ.includes("what is the aqi") || lowerQ.includes("air quality") || lowerQ.includes("how is the air")) {
        answer = `In ${targetCity}, the live US AQI is currently ${curAqi} (${curCat}) with PM2.5 at ${curPm25} µg/m³ and visibility around ${curVis} km. ${
          curAqi >= 200
            ? "Air quality is very unhealthy. Keep windows shut and stay indoors."
            : curAqi >= 100
            ? "Air quality is unhealthy for sensitive groups. Wear an N95 mask if stepping out."
            : "Air quality is within acceptable limits."
        }`;
      } else if (lowerQ.includes("visibility") || lowerQ.includes("see") || lowerQ.includes("fog") || lowerQ.includes("drive")) {
        answer = `Current visibility in ${targetCity} is approximately ${curVis} km (${targetCurrent?.visibilityCondition || "Hazy"}). Road visibility is impaired by particulate smog. Use low-beam fog lights, keep vehicle windows rolled up, and leave extra following distance.`;
      } else if (lowerQ.includes("go out") || lowerQ.includes("can i go") || lowerQ.includes("safe") || lowerQ.includes("walk") || lowerQ.includes("run") || lowerQ.includes("outside")) {
        const canGo = curAqi < 120 && curPm25 < 60;
        if (canGo) {
          answer = `Yes, right now air quality in ${targetCity} is acceptable (AQI ${curAqi}, PM2.5 ${curPm25} µg/m³). You can go out, but monitor evening inversion hours.`;
        } else {
          answer = `No, going out right now in ${targetCity} is NOT recommended (AQI is ${curAqi} - ${curCat}, PM2.5 is ${curPm25} µg/m³). Inhaling this soot strains lungs and heart. If ${
            familyProfile.members.length > 0 ? familyProfile.members.join(" or ") : "anyone"
          } must step out, strictly wear a well-fitted N95 mask. Safest window is early afternoon (12 PM - 3 PM).`;
        }
      } else if (lowerQ.includes("5 pm") || lowerQ.includes("evening")) {
        answer = `Around 5 PM in ${targetCity}, PM2.5 rises as evening traffic emissions collide with the sinking boundary layer. It is NOT safe for children or sensitive individuals to exercise outdoors at 5 PM.`;
      } else {
        answer = `In ${targetCity}, current AQI is ${curAqi} (${curCat}) with PM2.5 at ${curPm25} µg/m³ and visibility at ${curVis} km. Limit outdoor exertion and keep indoor spaces sealed during peak smog hours.`;
      }
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

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.2,
      },
    });

    const answer = response.text || `In ${targetCity}, the live AQI is currently ${curAqi} (${curCat}) with PM2.5 at ${curPm25} µg/m³.`;
    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json({
      answer: "Current air quality is degraded. We recommend remaining indoors and limiting outdoor exertion.",
    });
  }
}
