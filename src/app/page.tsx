"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { CityLocation, ParsedAQIData, FamilyProfile, AISmogPlan, ChatMessage } from "@/types";
import {
  INDIAN_PRESET_CITIES,
  getAQICategory,
  estimateVisibilityFromPM25,
  createFallbackAQIData,
} from "@/lib/openmeteo";
import ForecastChart from "@/components/ForecastChart";
import HouseholdProfilePanel from "@/components/HouseholdProfilePanel";
import AssistantPanel from "@/components/AssistantPanel";

const AirQualityMap = dynamic(() => import("@/components/AirQualityMap"), {
  ssr: false,
  loading: () => (
    <div
      className="panel"
      style={{
        height: "420px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--mute)",
      }}
    >
      Loading OpenStreetMap air quality view...
    </div>
  ),
});

const POPULAR_CITY_OPTIONS = [
  "Kozhikode",
  "Chennai",
  "Hyderabad",
  "Patna",
  "Lucknow",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "London",
  "Tokyo",
  "New York",
];

/**
 * Main AQIfer application page combining live AQI telemetry, 24-hour forecast,
 * household profile controls, OpenStreetMap journey safety planner, and AI chat assistant.
 */
export default function AQIferApp() {
  const [cityList, setCityList] = useState<CityLocation[]>(INDIAN_PRESET_CITIES);
  const [currentLocation, setCurrentLocation] = useState<CityLocation>(INDIAN_PRESET_CITIES[0]);
  const [selectedCity, setSelectedCity] = useState<string>("Delhi");
  const [citySearchInput, setCitySearchInput] = useState<string>("");
  const [isSearchingCity, setIsSearchingCity] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [aqiData, setAqiData] = useState<ParsedAQIData | null>(null);
  const [loadingAQI, setLoadingAQI] = useState<boolean>(true);
  const [selectedHourIdx, setSelectedHourIdx] = useState<number>(0);

  const [familyProfile, setFamilyProfile] = useState<FamilyProfile>({
    members: ["School Kids"],
    commute: "Two-wheeler",
    homeSetup: "Natural Ventilation",
  });

  const [smogPlan, setSmogPlan] = useState<AISmogPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<boolean>(false);
  const [isDetailedPlanOpen, setIsDetailedPlanOpen] = useState<boolean>(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isAskingChat, setIsAskingChat] = useState<boolean>(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async (location: CityLocation) => {
    setLoadingAQI(true);
    try {
      const res = await fetch(
        `/api/air-quality?lat=${location.latitude}&lon=${location.longitude}&city=${encodeURIComponent(
          location.name
        )}`
      );
      if (!res.ok) throw new Error("AQI fetch failed");
      const data: ParsedAQIData = await res.json();
      setAqiData(data);
      setSelectedHourIdx(0);
      return data;
    } catch (err) {
      console.warn("Using fallback AQI data:", err);
      const fallback = createFallbackAQIData(location.name);
      setAqiData(fallback);
      setSelectedHourIdx(0);
      return fallback;
    } finally {
      setLoadingAQI(false);
    }
  }, []);

  const generatePlan = useCallback(
    async (currentData: ParsedAQIData, profile: FamilyProfile) => {
      setLoadingPlan(true);
      try {
        const res = await fetch("/api/ai-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city: currentData.city,
            forecast24h: currentData.forecast24h,
            familyProfile: profile,
          }),
        });
        if (!res.ok) throw new Error("AI Plan fetch failed");
        const plan: AISmogPlan = await res.json();
        setSmogPlan(plan);
      } catch (err) {
        console.error("AI Plan error:", err);
      } finally {
        setLoadingPlan(false);
      }
    },
    []
  );

  const handleSelectLocation = useCallback(
    (loc: CityLocation) => {
      setCurrentLocation(loc);
      setSelectedCity(loc.name);
      setCitySearchInput("");
      setSearchError(null);
      if (!cityList.some((c) => c.name.toLowerCase() === loc.name.toLowerCase())) {
        setCityList((prev) => [...prev, loc]);
      }
      loadData(loc).then((data) => {
        if (data) generatePlan(data, familyProfile);
      });
    },
    [cityList, loadData, generatePlan, familyProfile]
  );

  const handleCitySearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = citySearchInput.trim();
    if (!query) return;

    setIsSearchingCity(true);
    setSearchError(null);

    const existing = cityList.find(
      (c) =>
        c.name.toLowerCase() === query.toLowerCase() ||
        query.toLowerCase().includes(c.name.toLowerCase())
    );
    if (existing) {
      handleSelectLocation(existing);
      setIsSearchingCity(false);
      return;
    }

    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const top = data.results[0];
          handleSelectLocation({
            name: top.name,
            admin1: top.admin1 || "",
            country: top.country || "",
            latitude: top.latitude,
            longitude: top.longitude,
          });
          setIsSearchingCity(false);
          return;
        }
      }
      setSearchError("City not found");
    } catch (err) {
      console.error("Geocoding failed:", err);
      setSearchError("Search error");
    } finally {
      setIsSearchingCity(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    loadData(currentLocation).then((data) => {
      if (mounted && data) {
        generatePlan(data, familyProfile);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const currentPoint = useMemo(() => {
    if (!aqiData || !aqiData.forecast24h || aqiData.forecast24h.length === 0) {
      return { pm2_5: 172, pm10: 275, us_aqi: 222, time: new Date().toISOString() };
    }
    return aqiData.forecast24h[selectedHourIdx] || aqiData.current;
  }, [aqiData, selectedHourIdx]);

  const cat = useMemo(() => getAQICategory(currentPoint.us_aqi), [currentPoint.us_aqi]);
  const currentVisibility = useMemo(
    () => estimateVisibilityFromPM25(currentPoint.pm2_5),
    [currentPoint.pm2_5]
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--tint", cat.color);
    }
  }, [cat.color]);

  useEffect(() => {
    setMessages([
      {
        id: "welcome-msg",
        role: "assistant",
        content: `Hello! I'm your AQIfer Outdoor Safety Assistant for ${selectedCity}. Current AQI is ${currentPoint.us_aqi} (${cat.category}) with ${currentVisibility.km} km visibility. Ask me if it's safe to step out, drive, or send kids to school.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      },
    ]);
  }, [selectedCity]);

  const safeWindows = useMemo(() => {
    if (!aqiData || !aqiData.forecast24h || aqiData.forecast24h.length < 2) return [];
    const candidates: { idx: number; avgPm: number; aqiVal: number; label: string; day: string }[] = [];
    const nowHour = new Date().getHours();

    for (let i = 0; i < aqiData.forecast24h.length - 1; i++) {
      const p1 = aqiData.forecast24h[i];
      const p2 = aqiData.forecast24h[i + 1];
      const hour = new Date(p1.time).getHours();
      if (hour >= 6 && hour <= 20) {
        const avg = (p1.pm2_5 + p2.pm2_5) / 2;
        const h1 = hour % 12 || 12;
        const h2 = (hour + 2) % 12 || 12;
        candidates.push({
          idx: i,
          avgPm: Math.round(avg * 10) / 10,
          aqiVal: Math.round(Math.max(p1.us_aqi, p2.us_aqi)),
          label: `${h1} ${hour < 12 ? "am" : "pm"} – ${h2} ${(hour + 2) % 24 < 12 ? "am" : "pm"}`,
          day: nowHour + i >= 24 ? "Tomorrow" : "Today",
        });
      }
    }

    candidates.sort((a, b) => a.avgPm - b.avgPm);
    const chosen: typeof candidates = [];
    for (const c of candidates) {
      if (chosen.every((o) => Math.abs(o.idx - c.idx) >= 3)) chosen.push(c);
      if (chosen.length === 2) break;
    }
    return chosen;
  }, [aqiData]);

  const bestWindowIndices = useMemo(() => {
    const set = new Set<number>();
    safeWindows.forEach((w) => {
      set.add(w.idx);
      set.add(w.idx + 1);
    });
    return set;
  }, [safeWindows]);

  const maxForecastPm = useMemo(() => {
    if (!aqiData || !aqiData.forecast24h) return 300;
    return Math.max(...aqiData.forecast24h.map((p) => p.pm2_5), 100);
  }, [aqiData]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || chatInput;
    if (!text.trim() || isAskingChat) return;

    setIsDetailedPlanOpen(false);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsAskingChat(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text.trim(),
          city: selectedCity,
          current: aqiData?.current,
          forecast24h: aqiData?.forecast24h || [],
          familyProfile,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          role: "assistant",
          content: data.answer || "Unable to retrieve advice right now.",
          timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        },
      ]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Network issue. Please check the Safest Windows or try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsAskingChat(false);
    }
  };

  useEffect(() => {
    if (!isDetailedPlanOpen && chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isAskingChat, isDetailedPlanOpen]);

  const toggleMember = (m: string) => {
    const exists = familyProfile.members.includes(m);
    const updated = exists
      ? familyProfile.members.filter((x) => x !== m)
      : [...familyProfile.members, m];
    const newProfile = { ...familyProfile, members: updated };
    setFamilyProfile(newProfile);
    if (aqiData) generatePlan(aqiData, newProfile);
  };

  const handleCommuteChange = (com: FamilyProfile["commute"]) => {
    const newProfile = { ...familyProfile, commute: com };
    setFamilyProfile(newProfile);
    if (aqiData) generatePlan(aqiData, newProfile);
  };

  const handleHomeChange = (home: FamilyProfile["homeSetup"]) => {
    const newProfile = { ...familyProfile, homeSetup: home };
    setFamilyProfile(newProfile);
    if (aqiData) generatePlan(aqiData, newProfile);
  };

  const handleReevaluateReport = async () => {
    if (!aqiData || loadingPlan) return;
    await generatePlan(aqiData, familyProfile);
    setIsDetailedPlanOpen(true);
  };

  const activeHourTimeLabel = useMemo(() => {
    const d = new Date(currentPoint.time);
    const h = d.getHours();
    return `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
  }, [currentPoint.time]);

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          AQIfer<small>Smog and outdoor safety</small>
        </div>
        <form className="custom" onSubmit={handleCitySearchSubmit}>
          <span>Search or select city</span>
          <input
            id="cityInput"
            type="text"
            list="popular-cities"
            placeholder="e.g. Kozhikode, Haldia..."
            value={citySearchInput}
            onChange={(e) => {
              setCitySearchInput(e.target.value);
              setSearchError(null);
            }}
            aria-label="City search"
          />
          <datalist id="popular-cities">
            {cityList.map((c) => (
              <option key={c.name} value={c.name}>
                {c.admin1 ? `${c.admin1}, ` : ""}
                {c.country || "India"}
              </option>
            ))}
            {POPULAR_CITY_OPTIONS.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
          <button className="chip" id="cuGo" type="submit" disabled={isSearchingCity}>
            {isSearchingCity ? "Searching..." : "Check"}
          </button>
          {searchError && (
            <span style={{ color: "#d6403a", fontSize: "12px", fontWeight: 600 }}>
              {searchError}
            </span>
          )}
        </form>
      </header>

      <div className="chips" role="group" aria-label="City">
        {cityList.map((c) => (
          <button
            key={c.name}
            className="chip"
            type="button"
            aria-pressed={selectedCity.toLowerCase() === c.name.toLowerCase()}
            onClick={() => handleSelectLocation(c)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="main-screen-grid">
        <div className="left-dashboard">
          <section className="hero" aria-live="polite">
            <div>
              <h1>{cat.headline}</h1>
              <p>
                {selectedCity}: fine soot (PM2.5) passes the upper airways and reaches deep into the
                lungs.{" "}
                {currentPoint.us_aqi >= 201
                  ? "Today is a day to plan around the air, not ignore it."
                  : currentPoint.us_aqi >= 101
                  ? "Children, older adults and anyone with asthma should take it easy."
                  : "Normal activity is fine."}
              </p>
            </div>

            <div className="dial">
              <b>{currentPoint.us_aqi}</b>
              <span>{cat.category}</span>
              <i>US AQI, reading for {activeHourTimeLabel}</i>
            </div>
          </section>

          <div className="stats">
            <div>
              <small>PM2.5</small>
              <b>
                {currentPoint.pm2_5}
                <em>µg/m³</em>
              </b>
              <br />
              <span>Fine soot</span>
            </div>
            <div>
              <small>PM10</small>
              <b>
                {currentPoint.pm10}
                <em>µg/m³</em>
              </b>
              <br />
              <span>Dust and ash</span>
            </div>
            <div>
              <small>Visibility</small>
              <b>
                {currentVisibility.km}
                <em>km</em>
              </b>
              <br />
              <span>{currentVisibility.condition}</span>
            </div>
            <div>
              <small>Safest window</small>
              <b>{safeWindows.length > 0 ? safeWindows[0].label : "–"}</b>
              <br />
              <span>
                {safeWindows.length > 0
                  ? `${safeWindows[0].day}, about ${safeWindows[0].avgPm} µg/m³`
                  : "None found"}
              </span>
            </div>
          </div>

          <ForecastChart
            forecast24h={aqiData?.forecast24h || []}
            bestWindowIndices={bestWindowIndices}
            selectedHourIdx={selectedHourIdx}
            maxForecastPm={maxForecastPm}
            onSelectHour={setSelectedHourIdx}
          />

          <HouseholdProfilePanel
            familyProfile={familyProfile}
            loadingPlan={loadingPlan}
            hasAqiData={Boolean(aqiData)}
            onToggleMember={toggleMember}
            onChangeCommute={handleCommuteChange}
            onChangeHomeSetup={handleHomeChange}
            onReevaluate={handleReevaluateReport}
          />

          <AirQualityMap location={currentLocation} familyProfile={familyProfile} />
        </div>

        <AssistantPanel
          selectedCity={selectedCity}
          isDetailedPlanOpen={isDetailedPlanOpen}
          onToggleDetailedPlan={setIsDetailedPlanOpen}
          safeWindows={safeWindows}
          smogPlan={smogPlan}
          familyProfile={familyProfile}
          currentPoint={currentPoint}
          messages={messages}
          chatInput={chatInput}
          isAskingChat={isAskingChat}
          chatContainerRef={chatContainerRef}
          onChatInputChange={setChatInput}
          onSendMessage={handleSendMessage}
        />
      </div>

      <p className="note">
        Live readings powered by Open-Meteo Air Quality API and Google Gemini 2.5 Flash. Advice
        follows US EPA AQI bands computed from PM2.5, and is general guidance, not medical advice.
        If you or someone in your home has a heart or lung condition, follow your doctor’s plan.
      </p>
    </div>
  );
}
