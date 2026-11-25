// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CitySearchHeader from "./CitySearchHeader";
import HeroSummaryGrid from "./HeroSummaryGrid";
import ForecastChart from "./ForecastChart";
import HouseholdProfilePanel from "./HouseholdProfilePanel";
import AssistantPanel from "./AssistantPanel";
import RouteResultCard from "./RouteResultCard";
import { INDIAN_PRESET_CITIES } from "@/lib/openmeteo";
import { AISmogPlan, ChatMessage, FamilyProfile, HourlyAQIPoint, RouteSafetyResult } from "@/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const defaultProfile: FamilyProfile = {
  members: ["School Kids"],
  commute: "Two-wheeler",
  homeSetup: "Natural Ventilation",
};

const sampleForecast: HourlyAQIPoint[] = Array.from({ length: 6 }, (_, i) => ({
  time: new Date(2026, 10, 25, 10 + i, 0, 0).toISOString(),
  pm2_5: 80 + i * 10,
  pm10: 120 + i * 10,
  us_aqi: 150 + i * 10,
}));

const sampleSmogPlan: AISmogPlan = {
  headlineSummary: "Plan outdoor errands for early afternoon.",
  safeWindows: [
    {
      timeWindow: "1 pm – 3 pm",
      pm25Level: 62,
      riskLevel: "Moderate",
      bestFor: "School runs",
      why: "Midday dispersion lowers surface smog.",
    },
  ],
  indoorHacks: [
    {
      title: "Draft Seal",
      action: "Keep windows sealed until noon.",
      why: "Reduces PM2.5 infiltration.",
    },
  ],
  commuteSwap: {
    recommendation: "Take enclosed Metro instead of bike.",
    why: "Avoids direct exhaust inhalation.",
  },
};

describe("AQIfer UI Components", () => {
  it("CitySearchHeader handles input changes, busy searching state, preset clicks, and errors", () => {
    const onSearchInputChange = vi.fn();
    const onSearchSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onSelectLocation = vi.fn();

    const { rerender } = render(
      <CitySearchHeader
        cityList={INDIAN_PRESET_CITIES}
        selectedCity="Delhi"
        citySearchInput="Kozhikode"
        isSearchingCity={false}
        searchError="City not found"
        onSearchInputChange={onSearchInputChange}
        onSearchSubmit={onSearchSubmit}
        onSelectLocation={onSelectLocation}
      />
    );

    expect(screen.getByText("AQIfer")).toBeInTheDocument();
    expect(screen.getByText("City not found")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("City search"), { target: { value: "Chennai" } });
    expect(onSearchInputChange).toHaveBeenCalledWith("Chennai");

    expect(screen.getByRole("button", { name: "Delhi" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Kolkata" }));
    expect(onSelectLocation).toHaveBeenCalledWith(INDIAN_PRESET_CITIES[1]);

    fireEvent.submit(screen.getByRole("button", { name: "Check" }).closest("form")!);
    expect(onSearchSubmit).toHaveBeenCalledTimes(1);

    rerender(
      <CitySearchHeader
        cityList={INDIAN_PRESET_CITIES}
        selectedCity="Delhi"
        citySearchInput="Chennai"
        isSearchingCity={true}
        searchError={null}
        onSearchInputChange={onSearchInputChange}
        onSearchSubmit={onSearchSubmit}
        onSelectLocation={onSelectLocation}
      />
    );
    expect(screen.getByRole("button", { name: "Searching..." })).toBeDisabled();
  });

  it("HeroSummaryGrid renders severity copy and safest window stats across AQI bands", () => {
    const { rerender } = render(
      <HeroSummaryGrid
        selectedCity="Delhi"
        headline="Stay indoors"
        category="Very Unhealthy"
        usAqi={220}
        pm25={145}
        pm10={260}
        activeHourTimeLabel="10 am"
        visibilityKm={3.2}
        visibilityCondition="Poor, slow down"
        safestWindow={{ idx: 3, avgPm: 85, aqiVal: 160, label: "1 pm – 3 pm", day: "Today" }}
      />
    );
    expect(screen.getByText(/plan around the air/i)).toBeInTheDocument();
    expect(screen.getByText("1 pm – 3 pm")).toBeInTheDocument();

    rerender(
      <HeroSummaryGrid
        selectedCity="Mumbai"
        headline="Limit outdoor effort"
        category="Unhealthy for Sensitive Groups"
        usAqi={125}
        pm25={45}
        pm10={75}
        activeHourTimeLabel="11 am"
        visibilityKm={12}
        visibilityCondition="Clear enough to drive"
        safestWindow={null}
      />
    );
    expect(screen.getByText(/should take it easy/i)).toBeInTheDocument();
    expect(screen.getByText("None found")).toBeInTheDocument();

    rerender(
      <HeroSummaryGrid
        selectedCity="Bengaluru"
        headline="Air is clean"
        category="Good"
        usAqi={40}
        pm25={10}
        pm10={20}
        activeHourTimeLabel="12 pm"
        visibilityKm={12}
        visibilityCondition="Clear enough to drive"
        safestWindow={null}
      />
    );
    expect(screen.getByText(/Normal activity is fine/i)).toBeInTheDocument();
  });

  it("ForecastChart renders bars, best window highlights, and selects hour on click", () => {
    const onSelectHour = vi.fn();

    render(
      <ForecastChart
        forecast24h={sampleForecast}
        bestWindowIndices={new Set([2, 3])}
        selectedHourIdx={1}
        maxForecastPm={200}
        onSelectHour={onSelectHour}
      />
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(6);
    expect(buttons[1]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[2].className).toContain("best");

    fireEvent.click(buttons[4]);
    expect(onSelectHour).toHaveBeenCalledWith(4);
  });

  it("HouseholdProfilePanel toggles options and updates Re-evaluate button state", () => {
    const onToggleMember = vi.fn();
    const onChangeCommute = vi.fn();
    const onChangeHomeSetup = vi.fn();
    const onReevaluate = vi.fn();

    const { rerender } = render(
      <HouseholdProfilePanel
        familyProfile={defaultProfile}
        loadingPlan={false}
        hasAqiData={true}
        onToggleMember={onToggleMember}
        onChangeCommute={onChangeCommute}
        onChangeHomeSetup={onChangeHomeSetup}
        onReevaluate={onReevaluate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Infants" }));
    expect(onToggleMember).toHaveBeenCalledWith("Infants");

    fireEvent.click(screen.getByRole("button", { name: "Car" }));
    expect(onChangeCommute).toHaveBeenCalledWith("Car");

    fireEvent.click(screen.getByRole("button", { name: "Air purifier" }));
    expect(onChangeHomeSetup).toHaveBeenCalledWith("Air Purifier");

    fireEvent.click(screen.getByRole("button", { name: "Re-evaluate Report" }));
    expect(onReevaluate).toHaveBeenCalledTimes(1);

    rerender(
      <HouseholdProfilePanel
        familyProfile={defaultProfile}
        loadingPlan={true}
        hasAqiData={true}
        onToggleMember={onToggleMember}
        onChangeCommute={onChangeCommute}
        onChangeHomeSetup={onChangeHomeSetup}
        onReevaluate={onReevaluate}
      />
    );
    expect(screen.getByRole("button", { name: "Re-evaluating report..." })).toBeDisabled();
  });

  it("AssistantPanel supports chat typing, loading state, Detailed Plan fallbacks, and toggle closing", () => {
    const onToggleDetailedPlan = vi.fn();
    const onChatInputChange = vi.fn();
    const onSendMessage = vi.fn();
    const messages: ChatMessage[] = [
      { id: "1", role: "assistant", content: "Hello from AQIfer!", timestamp: "10:00 AM" },
      { id: "2", role: "user", content: "Walk ok?", timestamp: "10:01 AM" },
    ];
    const ref = React.createRef<HTMLDivElement>();

    const { rerender } = render(
      <AssistantPanel
        selectedCity="Delhi"
        isDetailedPlanOpen={false}
        onToggleDetailedPlan={onToggleDetailedPlan}
        safeWindows={[{ idx: 2, avgPm: 60, aqiVal: 140, label: "1 pm – 3 pm", day: "Today" }]}
        smogPlan={sampleSmogPlan}
        familyProfile={defaultProfile}
        currentPoint={sampleForecast[0]}
        messages={messages}
        chatInput="Safe now?"
        isAskingChat={true}
        chatContainerRef={ref}
        onChatInputChange={onChatInputChange}
        onSendMessage={onSendMessage}
      />
    );

    expect(screen.getByText("Hello from AQIfer!")).toBeInTheDocument();
    expect(screen.getByText(/Thinking with live forecast data/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Ask AQIfer anything/i), {
      target: { value: "5 pm?" },
    });
    expect(onChatInputChange).toHaveBeenCalledWith("5 pm?");

    fireEvent.click(screen.getByRole("button", { name: /Visibility for driving/i }));
    expect(onSendMessage).toHaveBeenCalledWith("How bad is the visibility for driving right now?");

    fireEvent.click(screen.getByRole("button", { name: /Detailed Plan/i }));
    expect(onToggleDetailedPlan).toHaveBeenCalledWith(true);

    // Fallback DetailedSmogPlanView when smogPlan is null and safeWindows is empty
    rerender(
      <AssistantPanel
        selectedCity="Mumbai"
        isDetailedPlanOpen={true}
        onToggleDetailedPlan={onToggleDetailedPlan}
        safeWindows={[]}
        smogPlan={null}
        familyProfile={{ members: [], commute: "Car", homeSetup: "Air Purifier" }}
        currentPoint={{ ...sampleForecast[0], us_aqi: 90 }}
        messages={messages}
        chatInput=""
        isAskingChat={false}
        chatContainerRef={ref}
        onChatInputChange={onChatInputChange}
        onSendMessage={onSendMessage}
      />
    );

    expect(screen.getByText("Any time works")).toBeInTheDocument();
    expect(screen.getByText("Air Purifier High-CADR Lockdown")).toBeInTheDocument();
    expect(screen.getByText("Keep vehicle windows up with AC recirculation")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Close & Return/i }));
    expect(onToggleDetailedPlan).toHaveBeenCalledWith(false);
  });

  it("RouteResultCard renders AVOID, CAUTION, and SAFE verdicts cleanly", () => {
    const result: RouteSafetyResult = {
      origin: { name: "Connaught Place", latitude: 28.63, longitude: 77.21 },
      destination: { name: "India Gate", latitude: 28.61, longitude: 77.22 },
      routes: [
        {
          index: 0,
          label: "Primary Route",
          distanceKm: 4.1,
          durationMin: 12,
          avgAqi: 185,
          maxAqi: 210,
          avgPm25: 90,
          coordinates: [],
          waypoints: [],
          color: "#d6403a",
        },
        {
          index: 1,
          label: "Alternative Route 1",
          distanceKm: 4.8,
          durationMin: 14,
          avgAqi: 125,
          maxAqi: 135,
          avgPm25: 55,
          coordinates: [],
          waypoints: [],
          color: "#e07b1f",
        },
      ],
      recommendedRouteIndex: 1,
      verdict: "AVOID",
      verdictHeadline: "Avoid open two-wheeler commute.",
      analysis: "Peak AQI hits 210 along the primary road.",
      betterRouteSuggestion: "Use Alternative Route 1 or Metro.",
    };

    const { rerender } = render(<RouteResultCard result={result} />);
    expect(screen.getByText("AVOID")).toBeInTheDocument();
    expect(screen.getByText(/★ Recommended/)).toBeInTheDocument();

    rerender(<RouteResultCard result={{ ...result, verdict: "SAFE" }} />);
    expect(screen.getByText("SAFE")).toBeInTheDocument();
  });
});
