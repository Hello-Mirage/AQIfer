import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getAirQuality } from "./air-quality/route";
import { GET as getAqiGrid } from "./aqi-grid/route";
import { GET as getGeocode } from "./geocode/route";
import { POST as postAiPlan } from "./ai-plan/route";
import { POST as postChat } from "./chat/route";
import { POST as postRouteSafety } from "./route-safety/route";

describe("API Edge Route Handlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/air-quality falls back gracefully when upstream fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Upstream down"));
    const req = new NextRequest("http://localhost:3000/api/air-quality?lat=28.6139&lon=77.2090&city=Delhi");
    const res = await getAirQuality(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.city).toBe("Delhi");
    expect(data.forecast24h.length).toBe(24);
  });

  it("GET /api/aqi-grid returns 9 spatial color-coded points", async () => {
    const mockGrid = Array.from({ length: 9 }, (_, i) => ({
      latitude: 28.6 + i * 0.01,
      longitude: 77.2,
      current: { pm2_5: 65, us_aqi: 155 },
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(mockGrid), { status: 200 }));

    const req = new NextRequest("http://localhost:3000/api/aqi-grid?lat=28.6139&lon=77.2090");
    const res = await getAqiGrid(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.points).toHaveLength(9);
    expect(data.points[0].us_aqi).toBe(155);
    expect(data.points[0].color).toBe("#d6403a");
  });

  it("GET /api/geocode returns empty results for short query", async () => {
    const req = new NextRequest("http://localhost:3000/api/geocode?q=a");
    const res = await getGeocode(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toEqual([]);
  });

  it("POST /api/ai-plan returns a valid structured Smog Plan", async () => {
    const forecast24h = Array.from({ length: 24 }, (_, i) => ({
      time: new Date(Date.now() + i * 3600 * 1000).toISOString(),
      pm2_5: 80 + i,
      pm10: 120 + i,
      us_aqi: 165,
    }));
    const req = new NextRequest("http://localhost:3000/api/ai-plan", {
      method: "POST",
      body: JSON.stringify({
        city: "Delhi",
        forecast24h,
        familyProfile: { members: ["School Kids"], commute: "Two-wheeler", homeSetup: "Natural Ventilation" },
      }),
    });
    const res = await postAiPlan(req);
    expect(res.status).toBe(200);
    const plan = await res.json();
    expect(plan.safeWindows.length).toBeGreaterThan(0);
    expect(plan.indoorHacks).toHaveLength(3);
    expect(plan.commuteSwap.recommendation).toBeTruthy();
  });

  it("POST /api/chat answers driving visibility without falsely geocoding 'driving'", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({
        question: "How bad is the visibility for driving right now?",
        city: "Delhi",
        current: { pm2_5: 110, us_aqi: 179, category: "Unhealthy", visibilityKm: 8, visibilityCondition: "Hazy" },
        forecast24h: [],
      }),
    });
    const res = await postChat(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answer).toContain("Delhi");
    expect(data.answer).toContain("8 km");
  });

  it("POST /api/route-safety validates missing origin or destination", async () => {
    const req = new NextRequest("http://localhost:3000/api/route-safety", {
      method: "POST",
      body: JSON.stringify({ origin: "", destination: "India Gate" }),
    });
    const res = await postRouteSafety(req);
    expect(res.status).toBe(400);
  });

  it("POST /api/route-safety evaluates routes and returns cleaner recommendation", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("nominatim.openstreetmap.org")) {
        return new Response(JSON.stringify([{ display_name: "Place, Delhi", lat: "28.61", lon: "77.21" }]), { status: 200 });
      }
      if (url.includes("router.project-osrm.org")) {
        return new Response(
          JSON.stringify({
            routes: [
              { distance: 4200, duration: 720, geometry: { coordinates: [[77.21, 28.61], [77.23, 28.62]] } },
              { distance: 4800, duration: 780, geometry: { coordinates: [[77.21, 28.61], [77.24, 28.63]] } },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("air-quality-api.open-meteo.com")) {
        const batch = [
          { current: { pm2_5: 90, us_aqi: 170 } },
          { current: { pm2_5: 95, us_aqi: 175 } },
          { current: { pm2_5: 50, us_aqi: 120 } },
          { current: { pm2_5: 55, us_aqi: 125 } },
        ];
        return new Response(JSON.stringify(batch), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });

    const req = new NextRequest("http://localhost:3000/api/route-safety", {
      method: "POST",
      body: JSON.stringify({
        origin: "Connaught Place",
        destination: "India Gate",
        city: "Delhi",
        familyProfile: { members: ["School Kids"], commute: "Two-wheeler", homeSetup: "Natural Ventilation" },
      }),
    });
    const res = await postRouteSafety(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.routes).toHaveLength(2);
    expect(data.recommendedRouteIndex).toBe(1);
    expect(["SAFE", "CAUTION", "AVOID"]).toContain(data.verdict);
  });
});
