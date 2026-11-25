import { NextRequest, NextResponse } from "next/server";
import { fetchJsonWithTimeout, getErrorMessage } from "@/lib/http";
import {
  createFallbackAQIData,
  OpenMeteoAirQualityRawResponse,
  parseOpenMeteoAirQuality,
} from "@/lib/openmeteo";

export const runtime = "edge";

const DEFAULT_LAT = 28.6139;
const DEFAULT_LON = 77.209;
const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=600";

/** Fetch live 48-hour Open-Meteo AQI forecast and normalize to a 24-hour payload with fallback. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get("lat");
  const lonStr = searchParams.get("lon");
  const city = searchParams.get("city") || "Current City";

  const lat = latStr ? parseFloat(latStr) : DEFAULT_LAT;
  const lon = lonStr ? parseFloat(lonStr) : DEFAULT_LON;

  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm10,pm2_5,us_aqi&timezone=auto&forecast_days=2`;
    const data = await fetchJsonWithTimeout<OpenMeteoAirQualityRawResponse>(url, {
      timeoutMs: 6000,
    });
    if (!data) {
      throw new Error("Open-Meteo returned empty or non-OK response");
    }

    const parsed = parseOpenMeteoAirQuality(data, city);
    return NextResponse.json(parsed, {
      headers: { "Cache-Control": CACHE_HEADER },
    });
  } catch (error: unknown) {
    console.warn("Falling back to simulated AQI data due to error/timeout:", getErrorMessage(error));
    return NextResponse.json(createFallbackAQIData(city), {
      status: 200,
      headers: { "X-Fallback-Data": "true" },
    });
  }
}
