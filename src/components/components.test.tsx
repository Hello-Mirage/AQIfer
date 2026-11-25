// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CitySearchHeader from "./CitySearchHeader";
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
  it("CitySearchHeader renders brand, handles preset selection, search input, and errors", () => {
    const onSearchInputChange = vi.fn();
    const onSearchSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onSelectLocation = vi.fn();

    render(
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

    const delhiBtn = screen.getByRole("button", { name: "Delhi" });
    expect(delhiBtn).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Kolkata" }));
    expect(onSelectLocation).toHaveBeenCalledWith(INDIAN_PRESET_CITIES[1]);

    fireEvent.submit(screen.getByRole("button", { name: "Check" }).closest("form")!);
    expect(onSearchSubmit).toHaveBeenCalledTimes(1);
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

    const reevalBtn = screen.getByRole("button", { name: "Re-evaluate Report" });
    fireEvent.click(reevalBtn);
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

  it("AssistantPanel supports quick prompts, message sending, and Detailed Plan view switching", () => {
    const onToggleDetailedPlan = vi.fn();
    const onChatInputChange = vi.fn();
    const onSendMessage = vi.fn();
    const messages: ChatMessage[] = [
      { id: "1", role: "assistant", content: "Hello from AQIfer!", timestamp: "10:00 AM" },
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
        isAskingChat={false}
        chatContainerRef={ref}
        onChatInputChange={onChatInputChange}
        onSendMessage={onSendMessage}
      />
    );

    expect(screen.getByText("Hello from AQIfer!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Visibility for driving/i }));
    expect(onSendMessage).toHaveBeenCalledWith("How bad is the visibility for driving right now?");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSendMessage).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Detailed Plan/i }));
    expect(onToggleDetailedPlan).toHaveBeenCalledWith(true);

    rerender(
      <AssistantPanel
        selectedCity="Delhi"
        isDetailedPlanOpen={true}
        onToggleDetailedPlan={onToggleDetailedPlan}
        safeWindows={[{ idx: 2, avgPm: 60, aqiVal: 140, label: "1 pm – 3 pm", day: "Today" }]}
        smogPlan={sampleSmogPlan}
        familyProfile={defaultProfile}
        currentPoint={{ ...sampleForecast[0], us_aqi: 175 }}
        messages={messages}
        chatInput=""
        isAskingChat={false}
        chatContainerRef={ref}
        onChatInputChange={onChatInputChange}
        onSendMessage={onSendMessage}
      />
    );

    expect(screen.getByText("Draft Seal")).toBeInTheDocument();
    expect(screen.getByText("Take enclosed Metro instead of bike.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return to Chat" }));
    expect(onToggleDetailedPlan).toHaveBeenCalledWith(false);
  });

  it("RouteResultCard renders SAFE/AVOID verdict details and marks recommended route", () => {
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

    render(<RouteResultCard result={result} />);

    expect(screen.getByText("AVOID")).toBeInTheDocument();
    expect(screen.getByText("Avoid open two-wheeler commute.")).toBeInTheDocument();
    expect(screen.getByText("Use Alternative Route 1 or Metro.")).toBeInTheDocument();
    expect(screen.getByText(/★ Recommended/)).toBeInTheDocument();
  });
});
