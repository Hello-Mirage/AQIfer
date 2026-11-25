import { CityLocation } from "@/types";
import { fetchJsonWithTimeout } from "@/lib/http";
import { INDIAN_PRESET_CITIES } from "@/lib/openmeteo";

/** Resolved place coordinates and human-readable label. */
export interface ResolvedCoordinates {
  name: string;
  latitude: number;
  longitude: number;
}

interface OpenMeteoGeocodeRawItem {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

interface OpenMeteoGeocodeResponse {
  results?: OpenMeteoGeocodeRawItem[];
}

interface NominatimSearchItem {
  display_name?: string;
  lat: string;
  lon: string;
}

/**
 * Common activity, demographic, and temporal words excluded when extracting
 * city names from natural-language chat questions.
 */
export const NON_CITY_WORDS = new Set([
  "driving", "drive", "walking", "walk", "running", "run", "cycling", "cycle", "jogging", "jog",
  "playing", "play", "school", "office", "kids", "children", "elderly", "asthma", "patients",
  "morning", "afternoon", "evening", "night", "tonight", "general", "short", "detail", "details",
  "me", "us", "everyone", "today", "tomorrow", "now", "here", "there", "outdoor", "outdoors",
  "indoor", "indoors", "work", "commute", "travel", "home", "car", "bike", "two wheeler", "mask",
  "n95", "hepa", "air", "smog", "pollution", "safe", "safest", "window", "hour", "hours",
]);

const REGION_WORDS = new Set([
  "west", "east", "north", "south", "bengal", "pradesh", "state", "district", "city",
]);

/**
 * Extract an explicit city or region candidate from a user's air-quality question,
 * ignoring common non-city words such as `"driving"`, `"walking"`, or `"morning"`.
 */
export function extractCityCandidate(question: string): string | null {
  const cleanQ = question.replace(/[?.,!]/g, " ").trim();

  // Pattern 1: "... in/at/of <city>" ('for' omitted intentionally to avoid 'for driving')
  const prepMatch = cleanQ.match(
    /\b(?:in|at|of)\s+([A-Za-z\s]+?)(?:\s+(?:for|with|right now|today|currently|tomorrow|please|tonight|this morning|this afternoon|this evening|at|on)|\?|$)/i
  );
  if (prepMatch?.[1]) {
    const candidate = prepMatch[1]
      .replace(
        /\b(right now|today|currently|tomorrow|please|tonight|this morning|this afternoon|this evening|the city of|city)\b/gi,
        ""
      )
      .trim();
    const candLower = candidate.toLowerCase();
    if (
      candidate.length > 2 &&
      !NON_CITY_WORDS.has(candLower) &&
      !candLower.startsWith("the ") &&
      !candLower.startsWith("my ")
    ) {
      return candidate;
    }
  }

  // Pattern 2: "<city> aqi/air quality/smog/pollution/weather"
  const prefixMatch = cleanQ.match(
    /^([A-Za-z\s]+?)\s+(?:aqi|air quality|smog|pollution|weather)/i
  );
  if (prefixMatch?.[1]) {
    const candidate = prefixMatch[1]
      .replace(/\b(how is|what is|tell me|check|give me|what is the current|what is the currect)\b/gi, "")
      .trim();
    if (candidate.length > 2 && !NON_CITY_WORDS.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // Pattern 3: Preset city mentioned anywhere in the question
  for (const preset of INDIAN_PRESET_CITIES) {
    if (new RegExp(`\\b${preset.name}\\b`, "i").test(cleanQ)) {
      return preset.name;
    }
  }

  return null;
}

/**
 * Query Open-Meteo Geocoding for multiple matching cities (used by `/api/geocode`).
 */
export async function searchGeocodeCities(query: string, count = 5): Promise<CityLocation[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query.trim()
  )}&count=${count}&language=en&format=json`;
  const data = await fetchJsonWithTimeout<OpenMeteoGeocodeResponse>(url, { timeoutMs: 5000 });
  return (data?.results ?? []).map((item) => ({
    name: item.name,
    admin1: item.admin1 || "",
    country: item.country || "",
    latitude: item.latitude,
    longitude: item.longitude,
  }));
}

/**
 * Resolve a city candidate string into coordinates using Indian presets first,
 * followed by progressive Open-Meteo geocoding queries.
 */
export async function findCityLocation(candidate: string): Promise<ResolvedCoordinates | null> {
  const candLower = candidate.toLowerCase();

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

  const tryQueries = [candidate];
  const words = candidate.split(/\s+/).filter((w) => w.length > 2);

  for (let i = words.length - 1; i >= 0; i--) {
    if (!REGION_WORDS.has(words[i].toLowerCase())) {
      tryQueries.push(words[i]);
    }
  }
  if (words.length > 1) {
    tryQueries.push(words[words.length - 1]);
  }

  for (const q of tryQueries) {
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        q
      )}&count=1&language=en&format=json`;
      const geoData = await fetchJsonWithTimeout<OpenMeteoGeocodeResponse>(geoUrl, {
        timeoutMs: 5000,
      });
      const place = geoData?.results?.[0];
      if (place) {
        return {
          name: `${place.name}${place.admin1 ? `, ${place.admin1}` : ""}${
            place.country ? ` (${place.country})` : ""
          }`,
          latitude: place.latitude,
          longitude: place.longitude,
        };
      }
    } catch {
      // Try next query variant
    }
  }

  return null;
}

/**
 * Geocode a street/landmark/place name via OpenStreetMap Nominatim (with city bias),
 * falling back to Open-Meteo Geocoding when Nominatim cannot resolve the query.
 */
export async function geocodePlace(
  query: string,
  biasCity?: string
): Promise<ResolvedCoordinates | null> {
  const fullQuery =
    biasCity && !query.toLowerCase().includes(biasCity.toLowerCase())
      ? `${query}, ${biasCity}`
      : query;

  for (const q of [fullQuery, query]) {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q
      )}&limit=1`;
      const items = await fetchJsonWithTimeout<NominatimSearchItem[]>(nomUrl, {
        timeoutMs: 5000,
        headers: { "User-Agent": "AQIfer-AirQualityAssistant/1.0" },
      });
      if (Array.isArray(items) && items.length > 0) {
        const item = items[0];
        const shortName = item.display_name
          ? item.display_name.split(",").slice(0, 2).join(",").trim()
          : q;
        return {
          name: shortName,
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        };
      }
    } catch {
      // Fallback to next query
    }
  }

  try {
    const omUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      query
    )}&count=1&language=en&format=json`;
    const data = await fetchJsonWithTimeout<OpenMeteoGeocodeResponse>(omUrl, { timeoutMs: 5000 });
    const place = data?.results?.[0];
    if (place) {
      return {
        name: `${place.name}${place.admin1 ? `, ${place.admin1}` : ""}`,
        latitude: place.latitude,
        longitude: place.longitude,
      };
    }
  } catch {
    // Ignore upstream geocoder failure
  }

  return null;
}
