import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/http";
import { searchGeocodeCities } from "@/lib/location";

export const runtime = "edge";

/** Autocomplete city search backed by Open-Meteo Geocoding API. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchGeocodeCities(query, 5);
    return NextResponse.json({ results });
  } catch (err: unknown) {
    console.error("Geocoding error:", getErrorMessage(err));
    return NextResponse.json({ results: [] });
  }
}
