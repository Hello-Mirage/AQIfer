import { NextRequest, NextResponse } from "next/server";
import { Type, Schema } from "@google/genai";
import { getGeminiClient } from "@/lib/gemini";
import { getAQICategory } from "@/lib/openmeteo";
import { EvaluatedRoute, FamilyProfile, RouteSafetyResult, RouteWaypointAQI } from "@/types";

export const runtime = "edge";

const routeVerdictSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    verdict: {
      type: Type.STRING,
      description: "Must be one of: 'SAFE', 'CAUTION', or 'AVOID'",
    },
    verdictHeadline: {
      type: Type.STRING,
      description: "Crisp one-sentence verdict on route safety (e.g. 'Avoid two-wheeler on this corridor — severe PM2.5 hotspot').",
    },
    analysis: {
      type: Type.STRING,
      description: "2-3 sentences explaining the air quality exposure along the route, citing exact AQI and PM2.5 levels.",
    },
    betterRouteSuggestion: {
      type: Type.STRING,
      description: "Specific suggestion comparing the cleaner alternative route (if any) or advising safer transit/timing/masking.",
    },
    recommendedRouteIndex: {
      type: Type.NUMBER,
      description: "0-based index of the safest route from the provided routes list.",
    },
  },
  required: ["verdict", "verdictHeadline", "analysis", "betterRouteSuggestion", "recommendedRouteIndex"],
};

async function geocodePlace(query: string, biasCity?: string): Promise<{ name: string; latitude: number; longitude: number } | null> {
  const fullQuery = biasCity && !query.toLowerCase().includes(biasCity.toLowerCase())
    ? `${query}, ${biasCity}`
    : query;

  // 1. Try OpenStreetMap Nominatim for street/landmark-level precision
  for (const q of [fullQuery, query]) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
      const res = await fetch(nomUrl, {
        headers: { "User-Agent": "AQIfer-AirQualityAssistant/1.0" },
        signal: controller.signal,
      });
      clearTimeout(tid);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const item = data[0];
          const shortName = item.display_name ? item.display_name.split(",").slice(0, 2).join(",").trim() : q;
          return {
            name: shortName,
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
          };
        }
      }
    } catch {
      // Fallback to next
    }
  }

  // 2. Fallback to Open-Meteo Geocoding
  try {
    const omUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const res = await fetch(omUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results[0]) {
        const p = data.results[0];
        return {
          name: `${p.name}${p.admin1 ? ", " + p.admin1 : ""}`,
          latitude: p.latitude,
          longitude: p.longitude,
        };
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

function sampleWaypoints(coords: [number, number][], count = 5): [number, number][] {
  if (coords.length <= count) return coords;
  const sampled: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(coords.length - 1, Math.round((i / (count - 1)) * (coords.length - 1)));
    sampled.push(coords[idx]);
  }
  return sampled;
}

function generateHeuristicRouteVerdict(
  routes: EvaluatedRoute[],
  originName: string,
  destName: string,
  profile: FamilyProfile
): Omit<RouteSafetyResult, "origin" | "destination" | "routes"> {
  // Find cleanest route by lowest avgAqi, breaking ties with maxAqi
  let bestIdx = 0;
  for (let i = 1; i < routes.length; i++) {
    if (routes[i].avgAqi < routes[bestIdx].avgAqi || (routes[i].avgAqi === routes[bestIdx].avgAqi && routes[i].maxAqi < routes[bestIdx].maxAqi)) {
      bestIdx = i;
    }
  }

  const primary = routes[0];
  const best = routes[bestIdx];
  const isExposed = profile.commute === "Two-wheeler" || profile.commute === "Walk/Cycle";
  const hasVulnerable = profile.members.length > 0;

  let verdict: "SAFE" | "CAUTION" | "AVOID" = "SAFE";
  let verdictHeadline = `Route from ${originName} to ${destName} is currently clear (Avg AQI ${primary.avgAqi}).`;

  if (primary.maxAqi >= 200 || (primary.avgAqi >= 150 && isExposed)) {
    verdict = "AVOID";
    verdictHeadline = `Avoid ${profile.commute.toLowerCase()} travel on this route — peak AQI hits ${primary.maxAqi}.`;
  } else if (primary.avgAqi >= 100 || primary.maxAqi >= 120 || (hasVulnerable && primary.avgAqi >= 75)) {
    verdict = "CAUTION";
    verdictHeadline = `Proceed with N95 protection — route averages AQI ${primary.avgAqi} (PM2.5 ${primary.avgPm25} µg/m³).`;
  }

  const analysis = `Your primary route (${primary.distanceKm} km, ~${primary.durationMin} min) from ${originName} to ${destName} passes through zones averaging US AQI ${primary.avgAqi} (${primary.avgPm25} µg/m³ PM2.5), peaking at AQI ${primary.maxAqi}. ${
    isExposed
      ? `Using a ${profile.commute.toLowerCase()} leaves ${profile.members.join(", ") || "riders"} directly exposed to concentrated roadside tailpipe soot.`
      : `Keep cabin windows sealed and AC on internal recirculation to block roadside particulates.`
  }`;

  let betterRouteSuggestion = "";
  if (bestIdx !== 0 && best.avgAqi < primary.avgAqi) {
    const diff = primary.avgAqi - best.avgAqi;
    betterRouteSuggestion = `Take Alternative Route ${bestIdx} instead (${best.distanceKm} km, ~${best.durationMin} min): it lowers your average AQI exposure by ${diff} points (Avg AQI ${best.avgAqi}, Peak ${best.maxAqi}).`;
  } else if (verdict === "AVOID") {
    betterRouteSuggestion = `All road corridors along this stretch currently exceed safe particulate thresholds. Switch to enclosed public transit (Metro/AC bus) or delay travel until the midday dispersion window (12 PM – 3 PM), and wear an airtight N95 mask.`;
  } else if (verdict === "CAUTION") {
    betterRouteSuggestion = `This is the cleanest road corridor available right now. Wear a fitted N95 mask${isExposed ? " or switch to an enclosed car/metro" : ""}, and avoid idling at major traffic intersections.`;
  } else {
    betterRouteSuggestion = `Your primary route is already the cleanest corridor (${best.distanceKm} km, Avg AQI ${best.avgAqi}). Normal precautions apply.`;
  }

  return {
    recommendedRouteIndex: bestIdx,
    verdict,
    verdictHeadline,
    analysis,
    betterRouteSuggestion,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const originText: string = (body.origin || "").trim();
    const destText: string = (body.destination || "").trim();
    const cityContext: string = body.city || "";
    const familyProfile: FamilyProfile = body.familyProfile || {
      members: [],
      commute: "Two-wheeler",
      homeSetup: "Natural Ventilation",
    };

    if (!originText || !destText) {
      return NextResponse.json({ error: "Please provide both a starting point and destination." }, { status: 400 });
    }

    // 1. Geocode Origin and Destination in parallel
    const [originLoc, destLoc] = await Promise.all([
      geocodePlace(originText, cityContext),
      geocodePlace(destText, cityContext),
    ]);

    if (!originLoc || !destLoc) {
      return NextResponse.json(
        {
          error: !originLoc
            ? `Could not find location "${originText}". Try adding the city name.`
            : `Could not find destination "${destText}". Try adding the city name.`,
        },
        { status: 404 }
      );
    }

    // 2. Fetch routes from OSRM
    const osrmProfile = familyProfile.commute === "Walk/Cycle" ? "cycling" : "driving";
    const osrmUrl = `https://router.project-osrm.org/route/v1/${osrmProfile}/${originLoc.longitude},${originLoc.latitude};${destLoc.longitude},${destLoc.latitude}?alternatives=true&overview=full&geometries=geojson`;

    let rawRoutes: any[] = [];
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 7000);
      const osrmRes = await fetch(osrmUrl, { signal: controller.signal });
      clearTimeout(tid);
      if (osrmRes.ok) {
        const osrmData = await osrmRes.json();
        if (osrmData.routes && osrmData.routes.length > 0) {
          rawRoutes = osrmData.routes.slice(0, 3);
        }
      }
    } catch (e) {
      console.warn("OSRM fetch failed, falling back to direct corridor:", e);
    }

    // Fallback straight-line corridor if OSRM is unreachable
    if (rawRoutes.length === 0) {
      const midLat = (originLoc.latitude + destLoc.latitude) / 2;
      const midLon = (originLoc.longitude + destLoc.longitude) / 2;
      rawRoutes = [
        {
          distance: 5000,
          duration: 900,
          geometry: {
            coordinates: [
              [originLoc.longitude, originLoc.latitude],
              [midLon, midLat],
              [destLoc.longitude, destLoc.latitude],
            ],
          },
        },
      ];
    }

    // 3. Sample waypoints across all routes and batch-fetch AQI from Open-Meteo
    const routeSamples = rawRoutes.map((r) => {
      const latLngs: [number, number][] = (r.geometry?.coordinates || []).map((c: [number, number]) => [c[1], c[0]]);
      const waypoints = sampleWaypoints(latLngs, 5);
      return { raw: r, latLngs, waypoints };
    });

    const allPoints = routeSamples.flatMap((rs) => rs.waypoints);
    const lats = allPoints.map((p) => p[0].toFixed(4)).join(",");
    const lons = allPoints.map((p) => p[1].toFixed(4)).join(",");

    let aqResults: any[] = [];
    try {
      const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=pm2_5,us_aqi&timezone=auto`;
      const aqRes = await fetch(aqUrl);
      if (aqRes.ok) {
        const aqJson = await aqRes.json();
        aqResults = Array.isArray(aqJson) ? aqJson : [aqJson];
      }
    } catch (e) {
      console.warn("Batch waypoint AQI failed:", e);
    }

    // 4. Assemble EvaluatedRoute objects
    let pointOffset = 0;
    const evaluatedRoutes: EvaluatedRoute[] = routeSamples.map((rs, idx) => {
      const waypointAqis: RouteWaypointAQI[] = rs.waypoints.map(([lat, lon], wIdx) => {
        const aqItem = aqResults[pointOffset + wIdx];
        const pm2_5 = Math.round((aqItem?.current?.pm2_5 ?? 55) * 10) / 10;
        const us_aqi = Math.round(aqItem?.current?.us_aqi ?? 135);
        const cat = getAQICategory(us_aqi);
        return {
          latitude: lat,
          longitude: lon,
          us_aqi,
          pm2_5,
          category: cat.category,
          color: cat.color,
        };
      });
      pointOffset += rs.waypoints.length;

      const avgAqi = Math.round(waypointAqis.reduce((s, w) => s + w.us_aqi, 0) / Math.max(1, waypointAqis.length));
      const maxAqi = Math.max(...waypointAqis.map((w) => w.us_aqi));
      const avgPm25 = Math.round((waypointAqis.reduce((s, w) => s + w.pm2_5, 0) / Math.max(1, waypointAqis.length)) * 10) / 10;
      const routeCat = getAQICategory(avgAqi);

      return {
        index: idx,
        label: idx === 0 ? "Primary Route" : `Alternative Route ${idx}`,
        distanceKm: Math.round((rs.raw.distance / 1000) * 10) / 10,
        durationMin: Math.max(1, Math.round(rs.raw.duration / 60)),
        avgAqi,
        maxAqi,
        avgPm25,
        coordinates: rs.latLngs,
        waypoints: waypointAqis,
        color: routeCat.color,
      };
    });

    // 5. Evaluate with Gemini (with fallback to grounded heuristic)
    const gemini = getGeminiClient();
    const heuristic = generateHeuristicRouteVerdict(evaluatedRoutes, originLoc.name, destLoc.name, familyProfile);

    if (!gemini) {
      return NextResponse.json({
        origin: originLoc,
        destination: destLoc,
        routes: evaluatedRoutes,
        ...heuristic,
      });
    }

    const routeSummaries = evaluatedRoutes
      .map(
        (r) =>
          `Route ${r.index} (${r.label}): ${r.distanceKm} km, ${r.durationMin} min, Avg US AQI ${r.avgAqi}, Peak US AQI ${r.maxAqi}, Avg PM2.5 ${r.avgPm25} µg/m³`
      )
      .join("\n");

    const prompt = `You are AQIfer's Route & Commute Air Quality Safety AI.
Evaluate this journey from "${originLoc.name}" to "${destLoc.name}":

Routes Found:
${routeSummaries}

Traveler Profile:
- Commute Mode: ${familyProfile.commute}
- Vulnerable Household Members: ${familyProfile.members.join(", ") || "General adults"}

Instructions:
1. Give an unambiguous verdict ('SAFE', 'CAUTION', or 'AVOID') based on the route AQI, peak hotspot, and commute mode.
2. In 'analysis', explain the exposure along the route citing exact AQI and PM2.5 numbers.
3. In 'betterRouteSuggestion', compare the routes if an alternative has lower AQI, or suggest a safer commute swap (e.g. Metro/enclosed AC car), N95 mask, or timing adjustment.
4. Set 'recommendedRouteIndex' to the 0-based index of the cleanest route.`;

    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    for (const model of modelsToTry) {
      try {
        const response = await gemini.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: routeVerdictSchema,
            temperature: 0.2,
          },
        });
        if (response && response.text) {
          const parsed = JSON.parse(response.text);
          const safeIdx =
            typeof parsed.recommendedRouteIndex === "number" &&
            parsed.recommendedRouteIndex >= 0 &&
            parsed.recommendedRouteIndex < evaluatedRoutes.length
              ? parsed.recommendedRouteIndex
              : heuristic.recommendedRouteIndex;
          return NextResponse.json({
            origin: originLoc,
            destination: destLoc,
            routes: evaluatedRoutes,
            verdict: ["SAFE", "CAUTION", "AVOID"].includes(parsed.verdict) ? parsed.verdict : heuristic.verdict,
            verdictHeadline: parsed.verdictHeadline || heuristic.verdictHeadline,
            analysis: parsed.analysis || heuristic.analysis,
            betterRouteSuggestion: parsed.betterRouteSuggestion || heuristic.betterRouteSuggestion,
            recommendedRouteIndex: safeIdx,
          });
        }
      } catch (err: any) {
        console.warn(`Route safety Gemini ${model} failed:`, err.message);
      }
    }

    return NextResponse.json({
      origin: originLoc,
      destination: destLoc,
      routes: evaluatedRoutes,
      ...heuristic,
    });
  } catch (err: any) {
    console.error("Route safety error:", err);
    return NextResponse.json({ error: "Failed to evaluate route safety." }, { status: 500 });
  }
}
