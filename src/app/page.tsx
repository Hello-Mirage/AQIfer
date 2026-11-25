"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useAirQualityDashboard } from "@/hooks/useAirQualityDashboard";
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
  const {
    cityList,
    currentLocation,
    selectedCity,
    citySearchInput,
    isSearchingCity,
    searchError,
    aqiData,
    selectedHourIdx,
    familyProfile,
    smogPlan,
    loadingPlan,
    isDetailedPlanOpen,
    messages,
    chatInput,
    isAskingChat,
    chatContainerRef,
    currentPoint,
    cat,
    currentVisibility,
    safeWindows,
    bestWindowIndices,
    maxForecastPm,
    activeHourTimeLabel,
    setCitySearchInput,
    setSearchError,
    setSelectedHourIdx,
    setIsDetailedPlanOpen,
    setChatInput,
    handleSelectLocation,
    handleCitySearchSubmit,
    handleSendMessage,
    updateProfileAndPlan,
    toggleMember,
    handleReevaluateReport,
  } = useAirQualityDashboard();

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

      <main className="main-screen-grid">
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
      </main>

      <footer className="note">
        Live readings powered by Open-Meteo Air Quality API and Google Gemini 2.5 Flash. Advice
        follows US EPA AQI bands computed from PM2.5, and is general guidance, not medical advice.
        If you or someone in your home has a heart or lung condition, follow your doctor’s plan.
      </footer>
    </div>
  );
}
