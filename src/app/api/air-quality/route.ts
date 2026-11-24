import { NextRequest, NextResponse } from "next/server";
import { parseOpenMeteoAirQuality, createFallbackAQIData } from "@/lib/openmeteo";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get("lat");
  const lonStr = searchParams.get("lon");
  const city = searchParams.get("city") || "Current City";

  const lat = latStr ? parseFloat(latStr) : 28.6139;
  const lon = lonStr ? parseFloat(lonStr) : 77.2090;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm10,pm2_5,us_aqi&timezone=auto&forecast_days=2`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Open-Meteo returned status ${res.status}`);
    }

    const data = await res.json();
    const parsed = parseOpenMeteoAirQuality(data, city);

    return NextResponse.json(parsed, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error: any) {
    console.warn("Falling back to simulated AQI data due to error/timeout:", error.message);
    const fallback = createFallbackAQIData(city);
    return NextResponse.json(fallback, {
      status: 200,
      headers: {
        "X-Fallback-Data": "true",
      },
    });
  }
}
