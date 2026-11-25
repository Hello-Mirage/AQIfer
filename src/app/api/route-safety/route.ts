import { NextRequest, NextResponse } from "next/server";
import { generateWithGeminiFallback, getGeminiClient } from "@/lib/gemini";
import { fetchJsonWithTimeout, getErrorMessage, normalizeFamilyProfile } from "@/lib/http";
import { geocodePlace } from "@/lib/location";
import { OpenMeteoGridRawItem } from "@/lib/openmeteo";
import {
  buildFallbackCorridor,
  buildRouteSafetyPrompt,
  evaluateOsrmRoutes,
  generateHeuristicRouteVerdict,
  OsrmRawRoute,
  parseAiRouteVerdict,
  prepareRouteSamples,
  routeVerdictSchema,
} from "@/lib/routeSafety";

export const runtime = "edge";

const MAX_CANDIDATE_ROUTES = 3;

interface OsrmRouteResponse {
  routes?: OsrmRawRoute[];
}

/** Evaluate OSRM journey corridors against live Open-Meteo waypoint AQI and Gemini AI advice. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      origin?: unknown;
      destination?: unknown;
      city?: unknown;
      familyProfile?: unknown;
    };

    const originText = typeof body.origin === "string" ? body.origin.trim().slice(0, 180) : "";
    const destText =
      typeof body.destination === "string" ? body.destination.trim().slice(0, 180) : "";
    const cityContext = typeof body.city === "string" ? body.city.trim().slice(0, 120) : "";
    const familyProfile = normalizeFamilyProfile(body.familyProfile);

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

    let rawRoutes: OsrmRawRoute[] = [];
    try {
      const osrmData = await fetchJsonWithTimeout<OsrmRouteResponse>(osrmUrl, { timeoutMs: 7000 });
      if (osrmData?.routes && osrmData.routes.length > 0) {
        rawRoutes = osrmData.routes.slice(0, MAX_CANDIDATE_ROUTES);
      }
    } catch (e: unknown) {
      console.warn("OSRM fetch failed, falling back to direct corridor:", getErrorMessage(e));
    }

    if (rawRoutes.length === 0) {
      rawRoutes = buildFallbackCorridor(originLoc, destLoc);
    }

    const routeSamples = prepareRouteSamples(rawRoutes);
    const allPoints = routeSamples.flatMap((rs) => rs.waypoints);
    const lats = allPoints.map((p) => p[0].toFixed(4)).join(",");
    const lons = allPoints.map((p) => p[1].toFixed(4)).join(",");

    let aqResults: OpenMeteoGridRawItem[] = [];
    try {
      const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=pm2_5,us_aqi&timezone=auto`;
      const aqJson = await fetchJsonWithTimeout<OpenMeteoGridRawItem | OpenMeteoGridRawItem[]>(
        aqUrl,
        { timeoutMs: 6000 }
      );
      if (aqJson) {
        aqResults = Array.isArray(aqJson) ? aqJson : [aqJson];
      }
    } catch (e: unknown) {
      console.warn("Batch waypoint AQI failed:", getErrorMessage(e));
    }

    const evaluatedRoutes = evaluateOsrmRoutes(routeSamples, aqResults);
    const heuristic = generateHeuristicRouteVerdict(
      evaluatedRoutes,
      originLoc.name,
      destLoc.name,
      familyProfile
    );

    const gemini = getGeminiClient();
    const prompt = buildRouteSafetyPrompt(
      evaluatedRoutes,
      originLoc.name,
      destLoc.name,
      familyProfile
    );
    const aiText = await generateWithGeminiFallback(gemini, prompt, {
      responseSchema: routeVerdictSchema,
      temperature: 0.2,
    });
    const verdict = parseAiRouteVerdict(aiText, evaluatedRoutes.length, heuristic);

    return NextResponse.json({
      origin: originLoc,
      destination: destLoc,
      routes: evaluatedRoutes,
      ...verdict,
    });
  } catch (err: unknown) {
    console.error("Route safety error:", getErrorMessage(err));
    return NextResponse.json({ error: "Failed to evaluate route safety." }, { status: 500 });
  }
}
