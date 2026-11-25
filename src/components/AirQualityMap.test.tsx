// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("leaflet/dist/leaflet.css", () => ({}));

vi.mock("leaflet", () => {
  const createLayer = () => ({
    bindPopup: vi.fn().mockReturnThis(),
    bindTooltip: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
  });
  const createLayerGroup = () => ({
    addTo: vi.fn().mockReturnThis(),
    clearLayers: vi.fn(),
  });
  const createMap = () => ({
    setView: vi.fn(),
    fitBounds: vi.fn(),
    remove: vi.fn(),
  });

  return {
    default: {
      map: vi.fn(() => createMap()),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      layerGroup: vi.fn(() => createLayerGroup()),
      circle: vi.fn(() => createLayer()),
      circleMarker: vi.fn(() => createLayer()),
      marker: vi.fn(() => createLayer()),
      polyline: vi.fn(() => createLayer()),
      divIcon: vi.fn(() => ({})),
      latLngBounds: vi.fn(() => ({})),
    },
  };
});

import AirQualityMap from "./AirQualityMap";
import { CityLocation, FamilyProfile } from "@/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const delhi: CityLocation = {
  name: "Delhi",
  admin1: "Delhi",
  country: "India",
  latitude: 28.6139,
  longitude: 77.209,
};

const kolkata: CityLocation = {
  name: "Kolkata",
  admin1: "West Bengal",
  country: "India",
  latitude: 22.5726,
  longitude: 88.3639,
};

const profile: FamilyProfile = {
  members: ["School Kids"],
  commute: "Two-wheeler",
  homeSetup: "Natural Ventilation",
};

describe("AirQualityMap component", () => {
  it("loads AQI grid, evaluates multi-route journeys, updates on city switch, and handles errors", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/aqi-grid")) {
        return new Response(
          JSON.stringify({
            points: [
              {
                latitude: 28.6139,
                longitude: 77.209,
                us_aqi: 180,
                pm2_5: 90,
                category: "Unhealthy",
                color: "#d6403a",
                label: "City Center",
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/api/route-safety")) {
        return new Response(
          JSON.stringify({
            origin: { name: "Connaught Place", latitude: 28.63, longitude: 77.21 },
            destination: { name: "India Gate", latitude: 28.61, longitude: 77.22 },
            routes: [
              {
                index: 0,
                label: "Primary Route",
                distanceKm: 3.8,
                durationMin: 11,
                avgAqi: 182,
                maxAqi: 195,
                avgPm25: 92,
                coordinates: [
                  [28.63, 77.21],
                  [28.61, 77.22],
                ],
                waypoints: [],
                color: "#d6403a",
              },
              {
                index: 1,
                label: "Alternative Route 1",
                distanceKm: 4.4,
                durationMin: 13,
                avgAqi: 130,
                maxAqi: 140,
                avgPm25: 62,
                coordinates: [
                  [28.63, 77.21],
                  [28.62, 77.225],
                  [28.61, 77.22],
                ],
                waypoints: [
                  {
                    latitude: 28.62,
                    longitude: 77.225,
                    us_aqi: 130,
                    pm2_5: 62,
                    category: "Unhealthy for Sensitive Groups",
                    color: "#e07b1f",
                  },
                ],
                color: "#e07b1f",
              },
            ],
            recommendedRouteIndex: 1,
            verdict: "AVOID",
            verdictHeadline: "Avoid open two-wheeler travel.",
            analysis: "High particulate matter detected.",
            betterRouteSuggestion: "Take Alternative Route 1.",
          }),
          { status: 200 }
        );
      }
      return new Response("{}", { status: 404 });
    });

    const { rerender } = render(<AirQualityMap location={delhi} familyProfile={profile} />);

    expect(screen.getByText(/Live Air Quality Map/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("lat=28.6139"));
    });

    fireEvent.click(screen.getByRole("button", { name: "Try sample route" }));
    expect(await screen.findByText("Avoid open two-wheeler travel.")).toBeInTheDocument();
    expect(screen.getByText("Take Alternative Route 1.")).toBeInTheDocument();

    // City switch triggers re-fetch for new location
    rerender(<AirQualityMap location={kolkata} familyProfile={profile} />);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("lat=22.5726"));
    });

    // API error shows alert banner
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Could not find destination" }), { status: 404 })
    );
    fireEvent.change(screen.getByLabelText("Journey start location"), {
      target: { value: "Howrah" },
    });
    fireEvent.change(screen.getByLabelText("Journey destination"), {
      target: { value: "UnknownDest" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Route Safety" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not find destination");

    // Network rejection shows fallback error message
    fetchSpy.mockRejectedValueOnce(new Error("Offline"));
    fireEvent.click(screen.getByRole("button", { name: "Check Route Safety" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Network error checking route safety/i);
  });
});
