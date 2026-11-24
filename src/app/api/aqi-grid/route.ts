import { NextRequest, NextResponse } from "next/server";
import { getAQICategory } from "@/lib/openmeteo";
import { AQIGridPoint } from "@/types";

export const runtime = "edge";

// Generate a 3x3 spatial grid around the city center (~6 km spacing)
const GRID_OFFSETS: Array<{ dLat: number; dLon: number; label: string }> = [
  { dLat: 0, dLon: 0, label: "City Center" },
  { dLat: 0.055, dLon: 0, label: "North Zone" },
  { dLat: -0.055, dLon: 0, label: "South Zone" },
  { dLat: 0, dLon: 0.055, label: "East Zone" },
  { dLat: 0, dLon: -0.055, label: "West Zone" },
  { dLat: 0.045, dLon: 0.045, label: "North-East" },
  { dLat: 0.045, dLon: -0.045, label: "North-West" },
  { dLat: -0.045, dLon: 0.045, label: "South-East" },
  { dLat: -0.045, dLon: -0.045, label: "South-West" },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "28.6139");
  const lon = parseFloat(searchParams.get("lon") || "77.2090");

  const lats = GRID_OFFSETS.map((o) => (lat + o.dLat).toFixed(4)).join(",");
  const lons = GRID_OFFSETS.map((o) => (lon + o.dLon).toFixed(4)).join(",");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=pm2_5,us_aqi&timezone=auto`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Open-Meteo grid returned ${res.status}`);
    }

    const raw = await res.json();
    const items = Array.isArray(raw) ? raw : [raw];

    const points: AQIGridPoint[] = items.map((item: any, idx: number) => {
      const pm2_5 = Math.round((item?.current?.pm2_5 ?? 50) * 10) / 10;
      const us_aqi = Math.round(item?.current?.us_aqi ?? 110);
      const cat = getAQICategory(us_aqi);
      return {
        latitude: item?.latitude ?? lat + GRID_OFFSETS[idx]?.dLat,
        longitude: item?.longitude ?? lon + GRID_OFFSETS[idx]?.dLon,
        us_aqi,
        pm2_5,
        category: cat.category,
        color: cat.color,
        label: GRID_OFFSETS[idx]?.label || `Zone ${idx + 1}`,
      };
    });

    return NextResponse.json(
      { points },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err: any) {
    console.warn("AQI grid fallback:", err.message);
    const points: AQIGridPoint[] = GRID_OFFSETS.map((o, idx) => {
      const simulatedAqi = 120 + (idx % 4) * 22;
      const cat = getAQICategory(simulatedAqi);
      return {
        latitude: lat + o.dLat,
        longitude: lon + o.dLon,
        us_aqi: simulatedAqi,
        pm2_5: Math.round(simulatedAqi * 0.45),
        category: cat.category,
        color: cat.color,
        label: o.label,
      };
    });
    return NextResponse.json({ points });
  }
}
