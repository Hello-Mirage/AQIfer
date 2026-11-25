import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import * as geminiLib from "@/lib/gemini";
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

  it("GET /api/air-quality returns cached normalized data on 200 and falls back on upstream failure", async () => {
    const baseTime = new Date();
    const times = Array.from({ length: 24 }, (_, i) =>
      new Date(baseTime.getTime() + i * 3600 * 1000).toISOString()
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          latitude: 28.6139,
          longitude: 77.209,
          hourly: {
            time: times,
            pm2_5: Array(24).fill(95),
            pm10: Array(24).fill(150),
            us_aqi: Array(24).fill(171),
          },
        }),
        { status: 200 }
      )
    );

    const liveReq = new NextRequest(
      "http://localhost:3000/api/air-quality?lat=28.6139&lon=77.2090&city=Delhi"
    );
    const liveRes = await getAirQuality(liveReq);
    expect(liveRes.status).toBe(200);
    expect(liveRes.headers.get("Cache-Control")).toContain("s-maxage=300");
    const liveData = await liveRes.json();
    expect(liveData.current.us_aqi).toBe(171);

    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Upstream down"));
    const fbReq = new NextRequest(
      "http://localhost:3000/api/air-quality?lat=28.6139&lon=77.2090&city=Delhi"
    );
    const fbRes = await getAirQuality(fbReq);
    expect(fbRes.status).toBe(200);
    expect(fbRes.headers.get("X-Fallback-Data")).toBe("true");
    const fbData = await fbRes.json();
    expect(fbData.city).toBe("Delhi");
    expect(fbData.forecast24h).toHaveLength(24);
  });

  it("GET /api/aqi-grid returns 9 spatial points and degrades gracefully when upstream fails", async () => {
    const mockGrid = Array.from({ length: 9 }, (_, i) => ({
      latitude: 28.6 + i * 0.01,
      longitude: 77.2,
      current: { pm2_5: 65, us_aqi: 155 },
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockGrid), { status: 200 })
    );

    const req = new NextRequest("http://localhost:3000/api/aqi-grid?lat=28.6139&lon=77.2090");
    const res = await getAqiGrid(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.points).toHaveLength(9);
    expect(data.points[0].us_aqi).toBe(155);
    expect(data.points[0].color).toBe("#d6403a");

    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Grid timeout"));
    const fbRes = await getAqiGrid(req);
    expect(fbRes.status).toBe(200);
    const fbData = await fbRes.json();
    expect(fbData.points).toHaveLength(9);
  });

  it("GET /api/geocode handles short queries, valid geocoding results, and upstream failures", async () => {
    const shortReq = new NextRequest("http://localhost:3000/api/geocode?q=a");
    const shortRes = await getGeocode(shortReq);
    expect((await shortRes.json()).results).toEqual([]);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [{ name: "Kozhikode", admin1: "Kerala", country: "India", latitude: 11.248, longitude: 75.78 }],
        }),
        { status: 200 }
      )
    );
    const hitReq = new NextRequest("http://localhost:3000/api/geocode?q=Kozhikode");
    const hitRes = await getGeocode(hitReq);
    expect((await hitRes.json()).results).toHaveLength(1);

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Geocoder offline"));
    const errRes = await getGeocode(hitReq);
    expect((await errRes.json()).results).toEqual([]);
  });

  it("POST /api/ai-plan returns heuristic fallback and honors Gemini structured JSON when available", async () => {
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
        familyProfile: {
          members: ["School Kids"],
          commute: "Two-wheeler",
          homeSetup: "Natural Ventilation",
        },
      }),
    });
    const res = await postAiPlan(req);
    expect(res.status).toBe(200);
    const plan = await res.json();
    expect(plan.safeWindows.length).toBeGreaterThan(0);
    expect(plan.indoorHacks).toHaveLength(3);
    expect(plan.commuteSwap.recommendation).toBeTruthy();

    vi.spyOn(geminiLib, "getGeminiClient").mockReturnValue({} as never);
    vi.spyOn(geminiLib, "generateWithGeminiFallback").mockResolvedValueOnce(
      JSON.stringify({
        headlineSummary: "AI Plan Summary",
        safeWindows: [{ timeWindow: "1-3 PM", pm25Level: 50, riskLevel: "Moderate", bestFor: "Run", why: "Clear" }],
        indoorHacks: [
          { title: "H1", action: "A1", why: "W1" },
          { title: "H2", action: "A2", why: "W2" },
          { title: "H3", action: "A3", why: "W3" },
        ],
        commuteSwap: { recommendation: "Metro", why: "Low soot" },
      })
    );
    const aiRes = await postAiPlan(
      new NextRequest("http://localhost:3000/api/ai-plan", {
        method: "POST",
        body: JSON.stringify({ city: "Delhi", forecast24h }),
      })
    );
    expect((await aiRes.json()).headlineSummary).toBe("AI Plan Summary");
  });

  it("POST /api/chat validates empty prompts, handles driving visibility, and supports Gemini replies", async () => {
    const emptyReq = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({ question: "   ", city: "Delhi" }),
    });
    const emptyRes = await postChat(emptyReq);
    expect((await emptyRes.json()).answer).toContain("Please ask a question");

    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({
        question: "How bad is the visibility for driving right now?",
        city: "Delhi",
        current: {
          pm2_5: 110,
          us_aqi: 179,
          category: "Unhealthy",
          visibilityKm: 8,
          visibilityCondition: "Hazy",
        },
        forecast24h: [],
      }),
    });
    const res = await postChat(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answer).toContain("Delhi");
    expect(data.answer).toContain("8 km");

    vi.spyOn(geminiLib, "getGeminiClient").mockReturnValue({} as never);
    vi.spyOn(geminiLib, "generateWithGeminiFallback").mockResolvedValueOnce("Gemini live reply.");
    const aiChatReq = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({ question: "Can I jog?", city: "Mumbai" }),
    });
    expect((await (await postChat(aiChatReq)).json()).answer).toBe("Gemini live reply.");
  });

  it("POST /api/route-safety validates input, handles unresolvable places (404), and evaluates corridors", async () => {
    const missingReq = new NextRequest("http://localhost:3000/api/route-safety", {
      method: "POST",
      body: JSON.stringify({ origin: "", destination: "India Gate" }),
    });
    expect((await postRouteSafety(missingReq)).status).toBe(400);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
    const notFoundReq = new NextRequest("http://localhost:3000/api/route-safety", {
      method: "POST",
      body: JSON.stringify({ origin: "NowherePlace", destination: "India Gate" }),
    });
    expect((await postRouteSafety(notFoundReq)).status).toBe(404);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("nominatim.openstreetmap.org")) {
        return new Response(
          JSON.stringify([{ display_name: "Place, Delhi", lat: "28.61", lon: "77.21" }]),
          { status: 200 }
        );
      }
      if (url.includes("router.project-osrm.org")) {
        return new Response(
          JSON.stringify({
            routes: [
              {
                distance: 4200,
                duration: 720,
                geometry: { coordinates: [[77.21, 28.61], [77.23, 28.62]] },
              },
              {
                distance: 4800,
                duration: 780,
                geometry: { coordinates: [[77.21, 28.61], [77.24, 28.63]] },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("air-quality-api.open-meteo.com")) {
        return new Response(
          JSON.stringify([
            { current: { pm2_5: 90, us_aqi: 170 } },
            { current: { pm2_5: 95, us_aqi: 175 } },
            { current: { pm2_5: 50, us_aqi: 120 } },
            { current: { pm2_5: 55, us_aqi: 125 } },
          ]),
          { status: 200 }
        );
      }
      return new Response("{}", { status: 404 });
    });

    const okReq = new NextRequest("http://localhost:3000/api/route-safety", {
      method: "POST",
      body: JSON.stringify({
        origin: "Connaught Place",
        destination: "India Gate",
        city: "Delhi",
        familyProfile: {
          members: ["School Kids"],
          commute: "Two-wheeler",
          homeSetup: "Natural Ventilation",
        },
      }),
    });
    const okRes = await postRouteSafety(okReq);
    expect(okRes.status).toBe(200);
    const data = await okRes.json();
    expect(data.routes).toHaveLength(2);
    expect(data.recommendedRouteIndex).toBe(1);
    expect(["SAFE", "CAUTION", "AVOID"]).toContain(data.verdict);
  });
});
