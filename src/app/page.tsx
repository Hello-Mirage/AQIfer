"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { CityLocation, ParsedAQIData, FamilyProfile, AISmogPlan, ChatMessage } from "@/types";
import {
  INDIAN_PRESET_CITIES,
  getAQICategory,
  estimateVisibilityFromPM25,
  createFallbackAQIData,
  computeSafestWindows,
} from "@/lib/openmeteo";
import { formatChatTimestamp, formatHourLabel } from "@/lib/format";
import CitySearchHeader from "@/components/CitySearchHeader";
import HeroSummaryGrid from "@/components/HeroSummaryGrid";
import ForecastChart from "@/components/ForecastChart";
import HouseholdProfilePanel from "@/components/HouseholdProfilePanel";
import AssistantPanel from "@/components/AssistantPanel";

const AirQualityMap = dynamic(() => import("@/components/AirQualityMap"), {
  ssr: false,
  loading: () => (
    <div className="panel map-loading-fallback">Loading OpenStreetMap air quality view...</div>
  ),
});

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

  const initialLocationRef = useRef(currentLocation);
  const initialProfileRef = useRef(familyProfile);

  useEffect(() => {
    let mounted = true;
    loadData(initialLocationRef.current).then((data) => {
      if (mounted && data) {
        generatePlan(data, initialProfileRef.current);
      }
    });
    return () => {
      mounted = false;
    };
  }, [loadData, generatePlan]);

  const currentPoint = useMemo(() => {
    if (!aqiData?.forecast24h?.length) {
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

  const latestMetricsRef = useRef({
    usAqi: currentPoint.us_aqi,
    category: cat.category,
    visibilityKm: currentVisibility.km,
  });
  latestMetricsRef.current = {
    usAqi: currentPoint.us_aqi,
    category: cat.category,
    visibilityKm: currentVisibility.km,
  };

  useEffect(() => {
    const { usAqi, category, visibilityKm } = latestMetricsRef.current;
    setMessages([
      {
        id: "welcome-msg",
        role: "assistant",
        content: `Hello! I'm your AQIfer Outdoor Safety Assistant for ${selectedCity}. Current AQI is ${usAqi} (${category}) with ${visibilityKm} km visibility. Ask me if it's safe to step out, drive, or send kids to school.`,
        timestamp: formatChatTimestamp(),
      },
    ]);
  }, [selectedCity]);

  const safeWindows = useMemo(
    () => computeSafestWindows(aqiData?.forecast24h || []),
    [aqiData]
  );

  const bestWindowIndices = useMemo(() => {
    const set = new Set<number>();
    safeWindows.forEach((w) => {
      set.add(w.idx);
      set.add(w.idx + 1);
    });
    return set;
  }, [safeWindows]);

  const maxForecastPm = useMemo(() => {
    if (!aqiData?.forecast24h) return 300;
    return Math.max(...aqiData.forecast24h.map((p) => p.pm2_5), 100);
  }, [aqiData]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || chatInput).trim();
    if (!text || isAskingChat) return;

    setIsDetailedPlanOpen(false);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: text, timestamp: formatChatTimestamp() },
    ]);
    setChatInput("");
    setIsAskingChat(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
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
          timestamp: formatChatTimestamp(),
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
          timestamp: formatChatTimestamp(),
        },
      ]);
    } finally {
      setIsAskingChat(false);
    }
  };

  useEffect(() => {
    if (!isDetailedPlanOpen && chatContainerRef.current?.scrollTo) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isAskingChat, isDetailedPlanOpen]);

  const updateProfileAndPlan = (updatedProfile: FamilyProfile) => {
    setFamilyProfile(updatedProfile);
    if (aqiData) generatePlan(aqiData, updatedProfile);
  };

  const toggleMember = (member: string) => {
    const exists = familyProfile.members.includes(member);
    const members = exists
      ? familyProfile.members.filter((x) => x !== member)
      : [...familyProfile.members, member];
    updateProfileAndPlan({ ...familyProfile, members });
  };

  const handleReevaluateReport = async () => {
    if (!aqiData || loadingPlan) return;
    await generatePlan(aqiData, familyProfile);
    setIsDetailedPlanOpen(true);
  };

  const activeHourTimeLabel = useMemo(
    () => formatHourLabel(currentPoint.time),
    [currentPoint.time]
  );

  return (
    <div className="wrap">
      <CitySearchHeader
        cityList={cityList}
        selectedCity={selectedCity}
        citySearchInput={citySearchInput}
        isSearchingCity={isSearchingCity}
        searchError={searchError}
        onSearchInputChange={(val) => {
          setCitySearchInput(val);
          setSearchError(null);
        }}
        onSearchSubmit={handleCitySearchSubmit}
        onSelectLocation={handleSelectLocation}
      />

      <div className="main-screen-grid">
        <div className="left-dashboard">
          <HeroSummaryGrid
            selectedCity={selectedCity}
            headline={cat.headline}
            category={cat.category}
            usAqi={currentPoint.us_aqi}
            pm25={currentPoint.pm2_5}
            pm10={currentPoint.pm10}
            activeHourTimeLabel={activeHourTimeLabel}
            visibilityKm={currentVisibility.km}
            visibilityCondition={currentVisibility.condition}
            safestWindow={safeWindows[0] || null}
          />

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
            onChangeCommute={(commute) => updateProfileAndPlan({ ...familyProfile, commute })}
            onChangeHomeSetup={(homeSetup) =>
              updateProfileAndPlan({ ...familyProfile, homeSetup })
            }
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
