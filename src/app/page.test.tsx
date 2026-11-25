// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    const MockMap = ({ location }: { location: { name: string } }) => (
      <div data-testid="mock-map">Map: {location.name}</div>
    );
    return MockMap;
  },
}));

import AQIferApp from "./page";
import { createFallbackAQIData } from "@/lib/openmeteo";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AQIferApp full-page integration", () => {
  it("loads live telemetry, switches cities, searches cities, updates profile, and chats", async () => {
    const delhiData = createFallbackAQIData("Delhi", 180);
    const kolkataData = createFallbackAQIData("Kolkata", 95);
    const kozhikodeData = createFallbackAQIData("Kozhikode", 42);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/air-quality")) {
        if (url.includes("city=Kolkata")) {
          return new Response(JSON.stringify(kolkataData), { status: 200 });
        }
        if (url.includes("city=Kozhikode")) {
          return new Response(JSON.stringify(kozhikodeData), { status: 200 });
        }
        return new Response(JSON.stringify(delhiData), { status: 200 });
      }

      if (url.includes("/api/ai-plan")) {
        return new Response(
          JSON.stringify({
            headlineSummary: "Custom Smog Plan Ready.",
            safeWindows: [
              {
                timeWindow: "1 pm – 3 pm",
                pm25Level: 65,
                riskLevel: "Moderate",
                bestFor: "Errands",
                why: "Daytime warming breaks inversion.",
              },
            ],
            indoorHacks: [
              { title: "Seal Gaps", action: "Close windows.", why: "Blocks soot." },
              { title: "Damp Mop", action: "Wet mop.", why: "Prevents resuspension." },
              { title: "Run Filter", action: "Use HEPA.", why: "Traps fine particles." },
            ],
            commuteSwap: { recommendation: "Metro", why: "Lower exposure." },
          }),
          { status: 200 }
        );
      }

      if (url.includes("/api/geocode")) {
        if (url.includes("q=Kozhikode")) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  name: "Kozhikode",
                  admin1: "Kerala",
                  country: "India",
                  latitude: 11.248,
                  longitude: 75.78,
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }

      if (url.includes("/api/chat")) {
        return new Response(
          JSON.stringify({ answer: "Midday hours between 1 pm and 3 pm are cleanest." }),
          { status: 200 }
        );
      }

      return new Response("{}", { status: 404 });
    });

    render(<AQIferApp />);

    // Initial Delhi mount
    expect(await screen.findByText(/AQIfer Outdoor Safety Assistant for Delhi/i)).toBeInTheDocument();
    expect(screen.getByTestId("mock-map")).toHaveTextContent("Map: Delhi");

    // Select an hour bar in ForecastChart
    const forecastButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.className.includes("bar"));
    expect(forecastButtons.length).toBe(24);
    fireEvent.click(forecastButtons[5]);
    expect(forecastButtons[5]).toHaveAttribute("aria-pressed", "true");

    // Switch city via preset chip
    fireEvent.click(screen.getByRole("button", { name: "Kolkata" }));
    expect(
      await screen.findByText(/AQIfer Outdoor Safety Assistant for Kolkata/i)
    ).toBeInTheDocument();

    // Toggle household profile and click Re-evaluate Report once plan settles
    fireEvent.click(screen.getByRole("button", { name: "Infants" }));
    fireEvent.click(screen.getByRole("button", { name: "Car" }));
    fireEvent.click(screen.getByRole("button", { name: "Air purifier" }));
    const reevalBtn = await screen.findByRole("button", { name: "Re-evaluate Report" });
    expect(reevalBtn).toBeEnabled();
    fireEvent.click(reevalBtn);

    expect(await screen.findByText("Seal Gaps")).toBeInTheDocument();

    // Send chat question via quick prompt (switches back from Detailed Plan to Chat)
    fireEvent.click(screen.getByRole("button", { name: "Return to Chat" }));
    const chatInput = screen.getByPlaceholderText(/Ask AQIfer anything about Kolkata/i);
    fireEvent.change(chatInput, { target: { value: "When should I walk?" } });
    fireEvent.submit(chatInput.closest("form")!);

    expect(
      await screen.findByText("Midday hours between 1 pm and 3 pm are cleanest.")
    ).toBeInTheDocument();

    // Search unknown city then valid city
    const searchInput = screen.getByLabelText("City search");
    fireEvent.change(searchInput, { target: { value: "AtlantisNowhere" } });
    fireEvent.submit(searchInput.closest("form")!);
    expect(await screen.findByText("City not found")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Kozhikode" } });
    fireEvent.submit(searchInput.closest("form")!);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Kozhikode" })).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalled();
  });
});
