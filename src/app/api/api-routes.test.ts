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

  it("GET /api/air-quality validates coordinates, serves cached 200 data, and falls back on upstream failure", async () => {
    const badReq = new NextRequest("http://localhost:3000/api/air-quality?lat=invalid&lon=77");
    expect((await getAirQuality(badReq)).status).toBe(400);

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
    expect((await liveRes.json()).current.us_aqi).toBe(171);

    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Err", { status: 500 }));
    const fbRes = await getAirQuality(liveReq);
    expect(fbRes.status).toBe(200);
    expect(fbRes.headers.get("X-Fallback-Data")).toBe("true");
    const fbData = await fbRes.json();
    expect(fbData.city).toBe("Delhi");
    expect(fbData.forecast24h).toHaveLength(24);
  });

  it("GET /api/aqi-grid validates coordinates, returns 9 spatial points, and degrades cleanly", async () => {
    const badReq = new NextRequest("http://localhost:3000/api/aqi-grid?lat=99&lon=77");
    expect((await getAqiGrid(badReq)).status).toBe(400);

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

    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Err", { status: 503 }));
    const fbRes = await getAqiGrid(req);
    expect(fbRes.status).toBe(200);
    expect((await fbRes.json()).points).toHaveLength(9);
  });

  it("GET /api/geocode handles short queries, valid geocoding results, and upstream failures", async () => {
    const shortReq = new NextRequest("http://localhost:3000/api/geocode?q=a");
    expect((await (await getGeocode(shortReq)).json()).results).toEqual([]);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [{ name: "Kozhikode", admin1: "Kerala", country: "India", latitude: 11.248, longitude: 75.78 }],
        }),
        { status: 200 }
      )
    );
    const hitReq = new NextRequest("http://localhost:3000/api/geocode?q=Kozhikode");
    expect((await (await getGeocode(hitReq)).json()).results).toHaveLength(1);

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Geocoder offline"));
    expect((await (await getGeocode(hitReq)).json()).results).toEqual([]);
  });

  it("POST /api/ai-plan handles heuristic fallback, Gemini AI output, null Gemini response, and malformed JSON", async () => {
    const forecast24h = Array.from({ length: 24 }, (_, i) => ({
      time: new Date(Date.now() + i * 3600 * 1000).toISOString(),
      pm2_5: 80 + i,
      pm10: 120 + i,
      us_aqi: 165,
    }));

    const res = await postAiPlan(
      new NextRequest("http://localhost:3000/api/ai-plan", {
        method: "POST",
        body: JSON.stringify({ city: "Delhi", forecast24h }),
      })
    );
    const plan = await res.json();
    expect(plan.safeWindows.length).toBeGreaterThan(0);
    expect(plan.indoorHacks).toHaveLength(3);

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

    vi.spyOn(geminiLib, "generateWithGeminiFallback").mockResolvedValueOnce(null);
    const nullFallback = await postAiPlan(
      new NextRequest("http://localhost:3000/api/ai-plan", {
        method: "POST",
        body: JSON.stringify({ city: "Delhi", forecast24h }),
      })
    );
    expect((await nullFallback.json()).indoorHacks).toHaveLength(3);

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const malformed = await postAiPlan(
      new NextRequest("http://localhost:3000/api/ai-plan", { method: "POST", body: "{bad-json" })
    );
    expect(malformed.status).toBe(200);
  });

  it("POST /api/chat validates non-string & empty prompts, handles driving, Gemini null/success, and malformed JSON", async () => {
    const numReq = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({ question: 12345, city: "Delhi" }),
    });
    expect((await (await postChat(numReq)).json()).answer).toContain("Please ask a question");

    const visReq = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({
        question: "How bad is the visibility for driving right now?",
        city: "Delhi",
        current: { pm2_5: 110, us_aqi: 179, category: "Unhealthy", visibilityKm: 8, visibilityCondition: "Hazy" },
        forecast24h: [],
      }),
    });
    const visData = await (await postChat(visReq)).json();
    expect(visData.answer).toContain("8 km");

    vi.spyOn(geminiLib, "getGeminiClient").mockReturnValue({} as never);
    vi.spyOn(geminiLib, "generateWithGeminiFallback").mockResolvedValueOnce("Gemini live reply.");
    expect(
      (
        await (
          await postChat(
            new NextRequest("http://localhost:3000/api/chat", {
              method: "POST",
              body: JSON.stringify({ question: "Can I jog?", city: "Mumbai" }),
            })
          )
        ).json()
      ).answer
    ).toBe("Gemini live reply.");

    vi.spyOn(geminiLib, "generateWithGeminiFallback").mockResolvedValueOnce(null);
    expect(
      (
        await (
          await postChat(
            new NextRequest("http://localhost:3000/api/chat", {
              method: "POST",
              body: JSON.stringify({ question: "Can I walk outside?", city: "Mumbai" }),
            })
          )
        ).json()
      ).answer
    ).toContain("Mumbai");

    vi.spyOn(console, "error").mockImplementation(() => {});
    const badJsonRes = await postChat(
      new NextRequest("http://localhost:3000/api/chat", { method: "POST", body: "{invalid" })
    );
    expect(badJsonRes.status).toBe(200);
    expect((await badJsonRes.json()).answer).toContain("Delhi");
  });

  it("POST /api/route-safety handles validation, 404, OSRM/AQI fallback, multi-route evaluation, and 500 JSON errors", async () => {
    expect(
      (
        await postRouteSafety(
          new NextRequest("http://localhost:3000/api/route-safety", {
            method: "POST",
            body: JSON.stringify({ origin: "", destination: "India Gate" }),
          })
        )
      ).status
    ).toBe(400);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
    expect(
      (
        await postRouteSafety(
          new NextRequest("http://localhost:3000/api/route-safety", {
            method: "POST",
            body: JSON.stringify({ origin: "Nowhere", destination: "India Gate" }),
          })
        )
      ).status
    ).toBe(404);

    // Origin succeeds, destination fails -> 404 destination error
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("Origin")) {
        return new Response(JSON.stringify([{ display_name: "Origin", lat: "28.6", lon: "77.2" }]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    const destNotFound = await postRouteSafety(
      new NextRequest("http://localhost:3000/api/route-safety", {
        method: "POST",
        body: JSON.stringify({ origin: "Origin", destination: "MissingDest" }),
      })
    );
    expect(destNotFound.status).toBe(404);
    expect((await destNotFound.json()).error).toContain("destination");

    // OSRM & Open-Meteo errors degrade to direct corridor fallback cleanly
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("nominatim.openstreetmap.org")) {
        return new Response(
          JSON.stringify([{ display_name: "Place, Delhi", lat: "28.61", lon: "77.21" }]),
          { status: 200 }
        );
      }
      throw new Error("Upstream unavailable");
    });
    const corridorRes = await postRouteSafety(
      new NextRequest("http://localhost:3000/api/route-safety", {
        method: "POST",
        body: JSON.stringify({ origin: "Connaught Place", destination: "India Gate" }),
      })
    );
    expect(corridorRes.status).toBe(200);
    expect((await corridorRes.json()).routes).toHaveLength(1);

    // Malformed body hits outer 500 handler
    vi.spyOn(console, "error").mockImplementation(() => {});
    const crashRes = await postRouteSafety(
      new NextRequest("http://localhost:3000/api/route-safety", { method: "POST", body: "{bad" })
    );
    expect(crashRes.status).toBe(500);
  });
});
