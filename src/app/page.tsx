"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { CityLocation, ParsedAQIData, FamilyProfile, AISmogPlan, ChatMessage } from "@/types";
import {
  INDIAN_PRESET_CITIES,
  getAQICategory,
  estimateVisibilityFromPM25,
  createFallbackAQIData,
} from "@/lib/openmeteo";

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

  // Profile configuration
  const [familyProfile, setFamilyProfile] = useState<FamilyProfile>({
    members: ["School Kids"],
    commute: "Two-wheeler",
    homeSetup: "Natural Ventilation",
  });

  // AI Smog Plan
  const [smogPlan, setSmogPlan] = useState<AISmogPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<boolean>(false);

  // Detailed Info Dropdown Panel toggle (covers chat when open)
  const [isDetailedPlanOpen, setIsDetailedPlanOpen] = useState<boolean>(false);

  // Chatbot State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isAskingChat, setIsAskingChat] = useState<boolean>(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Fetch AQI Data (Open-Meteo or Fallback)
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

  // Generate AI Smog Plan with Gemini Edge Route
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

  // Select city from preset or search
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

  // City search form submit
  const handleCitySearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = citySearchInput.trim();
    if (!query) return;

    setIsSearchingCity(true);
    setSearchError(null);

    // 1. Check if already in cityList / preset
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

    // 2. Fetch from geocoding API
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const top = data.results[0];
          const newLoc: CityLocation = {
            name: top.name,
            admin1: top.admin1 || "",
            country: top.country || "",
            latitude: top.latitude,
            longitude: top.longitude,
          };
          handleSelectLocation(newLoc);
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

  // Current Hour Point & Tint
  const currentPoint = useMemo(() => {
    if (!aqiData || !aqiData.forecast24h || aqiData.forecast24h.length === 0) {
      return { pm2_5: 172, pm10: 275, us_aqi: 222, time: new Date().toISOString() };
    }
    return aqiData.forecast24h[selectedHourIdx] || aqiData.current;
  }, [aqiData, selectedHourIdx]);

  const cat = useMemo(() => {
    return getAQICategory(currentPoint.us_aqi);
  }, [currentPoint.us_aqi]);

  const currentVisibility = useMemo(() => {
    return estimateVisibilityFromPM25(currentPoint.pm2_5);
  }, [currentPoint.pm2_5]);

  // Dynamically set CSS --tint variable on document root
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--tint", cat.color);
    }
  }, [cat.color]);

  // Populate initial welcoming chat message
  useEffect(() => {
    const welcomeMsg: ChatMessage = {
      id: "welcome-msg",
      role: "assistant",
      content: `Hello! I'm your AQIfer Outdoor Safety Assistant for ${selectedCity}. Current AQI is ${currentPoint.us_aqi} (${cat.category}) with ${
        currentVisibility.km
      } km visibility. Ask me if it's safe to step out, drive, or send kids to school.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    };
    setMessages([welcomeMsg]);
  }, [selectedCity]);

  // 24-hour Safest Two-Hour Windows calculation
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
        const startAmpm = hour < 12 ? "am" : "pm";
        const endAmpm = (hour + 2) % 24 < 12 ? "am" : "pm";
        candidates.push({
          idx: i,
          avgPm: Math.round(avg * 10) / 10,
          aqiVal: Math.round(Math.max(p1.us_aqi, p2.us_aqi)),
          label: `${h1} ${startAmpm} – ${h2} ${endAmpm}`,
          day: nowHour + i >= 24 ? "Tomorrow" : "Today",
        });
      }
    }

    candidates.sort((a, b) => a.avgPm - b.avgPm);
    const chosen: typeof candidates = [];
    for (const c of candidates) {
      if (chosen.every((o) => Math.abs(o.idx - c.idx) >= 3)) {
        chosen.push(c);
      }
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

  // Send message in chat
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || chatInput;
    if (!text.trim() || isAskingChat) return;

    // If detailed plan was open, automatically close it so user sees the conversation
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
      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        role: "assistant",
        content: data.answer || "Unable to retrieve advice right now.",
        timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error("Chat error:", err);
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "Network issue. Please check the Safest Windows or try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsAskingChat(false);
    }
  };

  // Scroll chat messages container smoothly to bottom (without scrolling parent window)
  useEffect(() => {
    if (!isDetailedPlanOpen && chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isAskingChat, isDetailedPlanOpen]);

  // Profile toggle handlers
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

  const activeHourTimeLabel = useMemo(() => {
    const d = new Date(currentPoint.time);
    const h = d.getHours();
    return `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
  }, [currentPoint.time]);

  return (
    <div className="wrap">
      {/* 1. Header with Brand & City Searcher / Selector */}
      <header className="top">
        <div className="brand">
          AQIfer<small>Smog and outdoor safety</small>
        </div>
        <form
          className="custom"
          onSubmit={handleCitySearchSubmit}
        >
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
                {c.admin1 ? `${c.admin1}, ` : ""}{c.country || "India"}
              </option>
            ))}
            <option value="Kozhikode" />
            <option value="Chennai" />
            <option value="Hyderabad" />
            <option value="Patna" />
            <option value="Lucknow" />
            <option value="Pune" />
            <option value="Ahmedabad" />
            <option value="Jaipur" />
            <option value="London" />
            <option value="Tokyo" />
            <option value="New York" />
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

      {/* 2. City Preset Chips */}
      <div className="chips" role="group" aria-label="City">
        {cityList.map((c) => {
          const isPressed = selectedCity.toLowerCase() === c.name.toLowerCase();
          return (
            <button
              key={c.name}
              className="chip"
              type="button"
              aria-pressed={isPressed}
              onClick={() => handleSelectLocation(c)}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {/* 3. Widescreen 2-Column Layout */}
      <div className="main-screen-grid">
        {/* Left Dashboard Column */}
        <div className="left-dashboard">
          {/* Hero Dial Card */}
          <section className="hero" aria-live="polite">
            <div>
              <h1>{cat.headline}</h1>
              <p>
                {selectedCity}: fine soot (PM2.5) passes the upper
                airways and reaches deep into the lungs.{" "}
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

          {/* Stats 4-Grid */}
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
              <b>{safeWindows[0] ? safeWindows[0].label : "–"}</b>
              <br />
              <span>
                {safeWindows[0]
                  ? `${safeWindows[0].day}, AQI ~${safeWindows[0].aqiVal}`
                  : "None found"}
              </span>
            </div>
          </div>

          {/* 24-Hours Bar Chart */}
          <div>
            <h2>Next 24 hours</h2>
            <p className="sub">
              PM2.5 in µg/m³, coloured by US AQI. Outlined bars are your safest two-hour windows. Tap
              an hour for detail.
            </p>

            <div className="scroller">
              <div className="bars">
                {aqiData?.forecast24h?.map((point, idx) => {
                  const h = new Date(point.time).getHours();
                  const timeLabel = (h % 12 || 12) + (h < 12 ? " am" : " pm");
                  const pointCat = getAQICategory(point.us_aqi);
                  const isBest = bestWindowIndices.has(idx);
                  const isSelected = selectedHourIdx === idx;
                  const barHeight = Math.max(4, (point.pm2_5 / maxForecastPm) * 118);

                  return (
                    <button
                      key={`${point.time}-${idx}`}
                      className={`bar${isBest ? " best" : ""}`}
                      aria-pressed={isSelected}
                      style={{ "--c": pointCat.color } as React.CSSProperties}
                      title={`${timeLabel}: PM2.5 ${point.pm2_5}, AQI ${point.us_aqi}`}
                      type="button"
                      onClick={() => setSelectedHourIdx(idx)}
                    >
                      <b>{Math.round(point.pm2_5)}</b>
                      <i style={{ height: `${barHeight}px` }} />
                      <span>{timeLabel}</span>
                      <span>{point.us_aqi}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Household Context Profile Controls */}
          <div className="panel" id="profile">
            <h3>Who is in your household?</h3>
            <div className="tg">
              {[
                ["Infants", "Infants"],
                ["School Kids", "School kids"],
                ["Elderly", "Elderly"],
                ["Asthma", "Asthma or lung condition"],
              ].map(([id, label]) => {
                const pressed = familyProfile.members.some((m) =>
                  m.toLowerCase().includes(id.toLowerCase())
                );
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => toggleMember(id)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <h3>How do you get around?</h3>
            <div className="tg">
              {[
                ["Two-wheeler", "Two-wheeler"],
                ["Public Transit", "Public transit"],
                ["Car", "Car"],
                ["Walk/Cycle", "Walk or cycle"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={familyProfile.commute === id}
                  onClick={() => handleCommuteChange(id as FamilyProfile["commute"])}
                >
                  {label}
                </button>
              ))}
            </div>

            <h3>What does your home have?</h3>
            <div className="tg">
              {[
                ["Air Purifier", "Air purifier"],
                ["Natural Ventilation", "Natural ventilation"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={familyProfile.homeSetup === id}
                  onClick={() => handleHomeChange(id as FamilyProfile["homeSetup"])}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="sub" style={{ marginTop: "14px" }}>
              Your advice updates automatically on the right panel as you select household options.
            </p>
          </div>
        </div>

        {/* Right Sticky Column: Clean Chat Panel with Dropdown Detailed Info Overlay */}
        <aside className="sticky-right-panel">
          <div className="panel" style={{ padding: "20px", display: "flex", flexDirection: "column", height: "100%", minHeight: "560px", position: "relative" }}>
            
            {/* Top Bar with Dropdown Toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "12px", marginBottom: "12px" }}>
              <div>
                <strong style={{ fontSize: "16px", display: "block", color: "var(--ink)" }}>AQIfer Assistant</strong>
                <span style={{ fontSize: "12px", color: "var(--mute)" }}>
                  {selectedCity} • Grounded in live AQI
                </span>
              </div>

              {/* Dropdown Toggle Button */}
              <button
                type="button"
                onClick={() => setIsDetailedPlanOpen(!isDetailedPlanOpen)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: "1px solid var(--line)",
                  background: isDetailedPlanOpen ? "var(--ink)" : "var(--bg)",
                  color: isDetailedPlanOpen ? "var(--bg)" : "var(--ink)",
                  transition: "all 0.2s ease",
                }}
              >
                <span>{isDetailedPlanOpen ? "✕ Close Details" : "▾ Detailed Plan"}</span>
              </button>
            </div>

            {/* Dropdown Detailed Info Panel (Covers the chat panel when open) */}
            {isDetailedPlanOpen ? (
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px", paddingRight: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "color-mix(in srgb, var(--tint) 12%, var(--card))", border: "1px solid color-mix(in srgb, var(--tint) 25%, var(--line))", padding: "10px 14px", borderRadius: "12px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>Detailed Smog Plan & Actions</span>
                  <button
                    type="button"
                    onClick={() => setIsDetailedPlanOpen(false)}
                    style={{ fontSize: "12px", fontWeight: 600, background: "transparent", border: 0, color: "var(--tint)", textDecoration: "underline" }}
                  >
                    Return to Chat
                  </button>
                </div>

                {/* Safest times to go out */}
                <div>
                  <h2 style={{ fontSize: "18px", marginTop: 0 }}>Safest times to go out</h2>
                  {safeWindows.length > 0 ? (
                    safeWindows.map((w, idx) => {
                      const windowCat = getAQICategory(w.aqiVal);
                      return (
                        <div key={idx} className="item">
                          <span
                            className="tag"
                            style={{ "--c": windowCat.color } as React.CSSProperties}
                          >
                            {windowCat.category}
                          </span>
                          <strong>
                            {w.day}, {w.label}
                          </strong>
                          <p>
                            Average AQI about {w.aqiVal}.{" "}
                            {familyProfile.members.includes("School Kids")
                              ? "Best for school runs and play."
                              : "Best for errands and exercise."}{" "}
                            Midday sun lifts the haze layer and winds disperse ground-level soot, so the
                            lowest readings usually fall in the early afternoon.
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="item">
                      <strong>Any time works</strong>
                      <p>Readings stay in a comfortable range all day. Early afternoon is still the cleanest stretch.</p>
                    </div>
                  )}
                </div>

                {/* Inside your home */}
                <div>
                  <h2 style={{ fontSize: "18px" }}>Inside your home</h2>
                  {smogPlan && smogPlan.indoorHacks && smogPlan.indoorHacks.length > 0 ? (
                    smogPlan.indoorHacks.map((hack, idx) => (
                      <div key={idx} className="item">
                        <strong>{hack.title}</strong>
                        <p>
                          {hack.action}{" "}
                          <span style={{ fontStyle: "italic", opacity: 0.9 }}>{hack.why}</span>
                        </p>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="item">
                        <strong>
                          {familyProfile.homeSetup === "Air Purifier"
                            ? "Air Purifier High-CADR Lockdown"
                            : "Strict Midday-Only Natural Ventilation"}
                        </strong>
                        <p>
                          {familyProfile.homeSetup === "Air Purifier"
                            ? "Seal window seams with draft stoppers and run HEPA purifiers on medium-high in sleeping quarters before bedtime. Cold winter air traps toxic diesel soot at window sills. Controlling infiltration cuts indoor PM2.5 infiltration by 40-70%."
                            : "Keep all exterior windows shut during peak inversion hours (7 AM - 11 AM and 6 PM - 10 PM). Open cross-ventilation only between 1 PM and 3 PM. Cold winter air traps toxic diesel soot at window sills. Controlling infiltration cuts indoor PM2.5 infiltration by 40-70%."}
                        </p>
                      </div>
                      <div className="item">
                        <strong>Damp-Mopping Dust Suppression</strong>
                        <p>
                          Avoid dry sweeping or vacuuming without HEPA exhaust. Use warm damp microfiber
                          mopping twice daily. Dry brooms re-suspend settled PM2.5 and PM10 particles into
                          breathing zones, triggering immediate bronchial irritation.
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Your commute */}
                <div>
                  <h2 style={{ fontSize: "18px" }}>Your commute</h2>
                  <div className="item">
                    <strong>
                      {smogPlan?.commuteSwap?.recommendation ||
                        (familyProfile.commute === "Two-wheeler"
                          ? "Swap the bike or wear a sealed N95"
                          : "Keep vehicle windows up with AC recirculation")}
                    </strong>
                    <p>
                      {smogPlan?.commuteSwap?.why ||
                        "Two-wheeler and roadside commuters inhale 4x higher concentrations of fresh black carbon directly from exhaust pipes."}
                    </p>
                  </div>
                  {familyProfile.members.includes("School Kids") && currentPoint.us_aqi >= 150 && (
                    <div className="item">
                      <strong>School kids</strong>
                      <p>Move outdoor games and PE indoors today. Cut outdoor play short and watch for coughing.</p>
                    </div>
                  )}
                </div>

                <div style={{ paddingTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setIsDetailedPlanOpen(false)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "12px",
                      background: "var(--ink)",
                      color: "var(--bg)",
                      fontWeight: 700,
                      fontSize: "13px",
                      border: 0,
                    }}
                  >
                    Close & Return to Chat Assistant
                  </button>
                </div>
              </div>
            ) : (
              /* Dedicated Clean Chat View */
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                {/* Quick Inquiries Chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                  <button
                    type="button"
                    onClick={() => handleSendMessage("How bad is the visibility for driving right now?")}
                    style={{
                      fontSize: "12px",
                      padding: "5px 11px",
                      borderRadius: "999px",
                      border: "1px dashed var(--mute)",
                      background: "transparent",
                      color: "var(--ink)",
                    }}
                  >
                    👁️ Visibility for driving?
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendMessage("Can I go for a walk or exercise right now?")}
                    style={{
                      fontSize: "12px",
                      padding: "5px 11px",
                      borderRadius: "999px",
                      border: "1px dashed var(--mute)",
                      background: "transparent",
                      color: "var(--ink)",
                    }}
                  >
                    🏃 Can I walk right now?
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendMessage("Is 5 pm safe for kids to play outside?")}
                    style={{
                      fontSize: "12px",
                      padding: "5px 11px",
                      borderRadius: "999px",
                      border: "1px dashed var(--mute)",
                      background: "transparent",
                      color: "var(--ink)",
                    }}
                  >
                    🧒 Is 5 pm safe for kids?
                  </button>
                </div>

                {/* Conversation Messages */}
                <div
                  ref={chatContainerRef}
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    paddingRight: "4px",
                    marginBottom: "12px",
                    minHeight: "280px",
                    maxHeight: "420px",
                  }}
                >
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "88%",
                          borderRadius: "14px",
                          padding: "10px 14px",
                          fontSize: "13.5px",
                          lineHeight: "1.45",
                          background: m.role === "user" ? "var(--ink)" : "var(--bg)",
                          color: m.role === "user" ? "var(--bg)" : "var(--ink)",
                          border: m.role === "user" ? "none" : "1px solid var(--line)",
                          borderLeft: m.role === "assistant" ? "4px solid var(--tint)" : undefined,
                        }}
                      >
                        <p style={{ margin: 0 }}>{m.content}</p>
                        <span
                          style={{
                            display: "block",
                            fontSize: "10px",
                            opacity: 0.6,
                            marginTop: "4px",
                            textAlign: m.role === "user" ? "right" : "left",
                          }}
                        >
                          {m.timestamp}
                        </span>
                      </div>
                    </div>
                  ))}

                  {isAskingChat && (
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <div
                        style={{
                          borderRadius: "14px",
                          padding: "10px 14px",
                          fontSize: "12.5px",
                          background: "var(--bg)",
                          border: "1px solid var(--line)",
                          color: "var(--mute)",
                          borderLeft: "4px solid var(--tint)",
                        }}
                      >
                        Thinking with live forecast data...
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat Input Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  style={{ display: "flex", gap: "8px", marginTop: "auto" }}
                >
                  <input
                    type="text"
                    placeholder={`Ask AQIfer anything about ${selectedCity}...`}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={isAskingChat}
                    style={{
                      flex: 1,
                      font: "inherit",
                      fontSize: "13px",
                      padding: "10px 14px",
                      border: "1px solid var(--line)",
                      borderRadius: "12px",
                      background: "var(--card)",
                      color: "var(--ink)",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isAskingChat}
                    style={{
                      padding: "10px 18px",
                      borderRadius: "12px",
                      background: "var(--ink)",
                      color: "var(--bg)",
                      border: "1px solid var(--ink)",
                      fontWeight: 600,
                      fontSize: "13px",
                      cursor: "pointer",
                      opacity: !chatInput.trim() || isAskingChat ? 0.5 : 1,
                    }}
                  >
                    {isAskingChat ? "..." : "Send"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Footer Note */}
      <p className="note">
        Live readings powered by Open-Meteo Air Quality API and Google Gemini 2.5 Flash. Advice follows US EPA AQI
        bands computed from PM2.5, and is general guidance, not medical advice. If you or someone in your home has a
        heart or lung condition, follow your doctor’s plan.
      </p>
    </div>
  );
}
