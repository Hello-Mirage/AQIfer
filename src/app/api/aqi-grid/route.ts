import { NextRequest, NextResponse } from "next/server";
import { fetchJsonWithTimeout, getErrorMessage } from "@/lib/http";
import {
  buildAqiGridPoints,
  createFallbackAqiGrid,
  GRID_SPATIAL_OFFSETS,
  OpenMeteoGridRawItem,
} from "@/lib/openmeteo";

export const runtime = "edge";

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=600";

/** Return a 3x3 color-coded AQI grid around the requested coordinate pair. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "28.6139");
  const lon = parseFloat(searchParams.get("lon") || "77.2090");

  const lats = GRID_SPATIAL_OFFSETS.map((o) => (lat + o.dLat).toFixed(4)).join(",");
  const lons = GRID_SPATIAL_OFFSETS.map((o) => (lon + o.dLon).toFixed(4)).join(",");

  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=pm2_5,us_aqi&timezone=auto`;
    const raw = await fetchJsonWithTimeout<OpenMeteoGridRawItem | OpenMeteoGridRawItem[]>(url, {
      timeoutMs: 6000,
    });
    if (!raw) {
      throw new Error("Open-Meteo grid request failed");
    }

    const items = Array.isArray(raw) ? raw : [raw];
    const points = buildAqiGridPoints(items, lat, lon);

    return NextResponse.json(
      { points },
      { headers: { "Cache-Control": CACHE_HEADER } }
    );
  } catch (err: unknown) {
    console.warn("AQI grid fallback:", getErrorMessage(err));
    return NextResponse.json({ points: createFallbackAqiGrid(lat, lon) });
  }
}
