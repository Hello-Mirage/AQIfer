import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      query.trim()
    )}&count=5&language=en&format=json`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Geocoding failed with status ${res.status}`);
    }

    const data = await res.json();
    const results = (data.results || []).map((item: any) => ({
      name: item.name,
      admin1: item.admin1 || "",
      country: item.country || "",
      latitude: item.latitude,
      longitude: item.longitude,
    }));

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error("Geocoding error:", err.message);
    return NextResponse.json({ results: [] });
  }
}
