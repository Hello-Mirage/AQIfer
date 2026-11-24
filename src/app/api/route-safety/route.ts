import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient, generateWithGeminiFallback } from "@/lib/gemini";
import { getAQICategory } from "@/lib/openmeteo";
import {
  generateHeuristicRouteVerdict,
  routeVerdictSchema,
  sampleWaypoints,
} from "@/lib/routeSafety";
import { EvaluatedRoute, FamilyProfile, RouteWaypointAQI } from "@/types";

export const runtime = "edge";

async function geocodePlace(
  query: string,
  biasCity?: string
): Promise<{ name: string; latitude: number; longitude: number } | null> {
  const fullQuery =
    biasCity && !query.toLowerCase().includes(biasCity.toLowerCase())
      ? `${query}, ${biasCity}`
      : query;

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
          const shortName = item.display_name
            ? item.display_name.split(",").slice(0, 2).join(",").trim()
            : q;
          return {
            name: shortName,
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
          };
        }
      }
    } catch {
      // Fallback to next query
    }
  }

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
      return NextResponse.json(
        { error: "Please provide both a starting point and destination." },
        { status: 400 }
      );
    }

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

    const routeSamples = rawRoutes.map((r) => {
      const latLngs: [number, number][] = (r.geometry?.coordinates || []).map(
        (c: [number, number]) => [c[1], c[0]]
      );
      return { raw: r, latLngs, waypoints: sampleWaypoints(latLngs, 5) };
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

      const avgAqi = Math.round(
        waypointAqis.reduce((s, w) => s + w.us_aqi, 0) / Math.max(1, waypointAqis.length)
      );
      const maxAqi = Math.max(...waypointAqis.map((w) => w.us_aqi));
      const avgPm25 =
        Math.round(
          (waypointAqis.reduce((s, w) => s + w.pm2_5, 0) / Math.max(1, waypointAqis.length)) * 10
        ) / 10;

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
        color: getAQICategory(avgAqi).color,
      };
    });

    const gemini = getGeminiClient();
    const heuristic = generateHeuristicRouteVerdict(
      evaluatedRoutes,
      originLoc.name,
      destLoc.name,
      familyProfile
    );

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

    const aiText = await generateWithGeminiFallback(gemini, prompt, {
      responseSchema: routeVerdictSchema,
      temperature: 0.2,
    });

    if (aiText) {
      try {
        const parsed = JSON.parse(aiText);
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
          verdict: ["SAFE", "CAUTION", "AVOID"].includes(parsed.verdict)
            ? parsed.verdict
            : heuristic.verdict,
          verdictHeadline: parsed.verdictHeadline || heuristic.verdictHeadline,
          analysis: parsed.analysis || heuristic.analysis,
          betterRouteSuggestion: parsed.betterRouteSuggestion || heuristic.betterRouteSuggestion,
          recommendedRouteIndex: safeIdx,
        });
      } catch {
        // Fallback to heuristic if JSON parse fails
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
