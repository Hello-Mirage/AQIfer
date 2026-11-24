import { INDIAN_PRESET_CITIES } from "./openmeteo";

export const NON_CITY_WORDS = new Set([
  "driving", "drive", "walking", "walk", "running", "run", "cycling", "cycle", "jogging", "jog",
  "playing", "play", "school", "office", "kids", "children", "elderly", "asthma", "patients",
  "morning", "afternoon", "evening", "night", "tonight", "general", "short", "detail", "details",
  "me", "us", "everyone", "today", "tomorrow", "now", "here", "there", "outdoor", "outdoors",
  "indoor", "indoors", "work", "commute", "travel", "home", "car", "bike", "two wheeler", "mask",
  "n95", "hepa", "air", "smog", "pollution", "safe", "safest", "window", "hour", "hours"
]);

export function extractCityCandidate(question: string): string | null {
  const cleanQ = question.replace(/[?.,!]/g, " ").trim();

  // Pattern 1: "... in/at/of <city>" (Notice 'for' is NOT included to avoid false matches like 'for driving')
  const prepMatch = cleanQ.match(/\b(?:in|at|of)\s+([A-Za-z\s]+?)(?:\s+(?:for|with|right now|today|currently|tomorrow|please|tonight|this morning|this afternoon|this evening|at|on)|\?|$)/i);
  if (prepMatch && prepMatch[1]) {
    let candidate = prepMatch[1]
      .replace(/\b(right now|today|currently|tomorrow|please|tonight|this morning|this afternoon|this evening|the city of|city)\b/gi, "")
      .trim();
    const candLower = candidate.toLowerCase();
    if (candidate.length > 2 && !NON_CITY_WORDS.has(candLower) && !candLower.startsWith("the ") && !candLower.startsWith("my ")) {
      return candidate;
    }
  }

  // Pattern 2: "<city> aqi", "<city> air quality", "<city> smog"
  const prefixMatch = cleanQ.match(/^([A-Za-z\s]+?)\s+(?:aqi|air quality|smog|pollution|weather)/i);
  if (prefixMatch && prefixMatch[1]) {
    let candidate = prefixMatch[1]
      .replace(/\b(how is|what is|tell me|check|give me|what is the current|what is the currect)\b/gi, "")
      .trim();
    const candLower = candidate.toLowerCase();
    if (candidate.length > 2 && !NON_CITY_WORDS.has(candLower)) {
      return candidate;
    }
  }

  // Pattern 3: Check if any preset city is mentioned anywhere in the question
  for (const preset of INDIAN_PRESET_CITIES) {
    if (new RegExp(`\\b${preset.name}\\b`, "i").test(cleanQ)) {
      return preset.name;
    }
  }

  return null;
}

export async function findCityLocation(candidate: string) {
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
  const stateOrRegionWords = new Set(["west", "east", "north", "south", "bengal", "pradesh", "state", "district", "city"]);
  const tryQueries = [candidate];
  const words = candidate.split(/\s+/).filter((w) => w.length > 2);
  
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i].toLowerCase();
    if (!stateOrRegionWords.has(w)) {
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
