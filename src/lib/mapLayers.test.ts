import { beforeEach, describe, expect, it, vi } from "vitest";

const recorded = {
  circles: [] as Array<{ popup: string }>,
  markers: [] as Array<{ popup: string; tooltip: string }>,
  polylines: [] as Array<{ options: Record<string, unknown>; popup: string }>,
  circleMarkers: [] as Array<{ tooltip: string }>,
};

vi.mock("leaflet", () => {
  return {
    default: {
      circle: vi.fn(() => {
        const entry = { popup: "" };
        recorded.circles.push(entry);
        return {
          bindPopup(html: string) {
            entry.popup = html;
            return this;
          },
          addTo() {
            return this;
          },
        };
      }),
      circleMarker: vi.fn(() => {
        const entry = { tooltip: "" };
        recorded.circleMarkers.push(entry);
        return {
          bindTooltip(text: string) {
            entry.tooltip = text;
            return this;
          },
          addTo() {
            return this;
          },
        };
      }),
      polyline: vi.fn((_coords: unknown, options: Record<string, unknown>) => {
        const entry = { options, popup: "" };
        recorded.polylines.push(entry);
        return {
          bindPopup(html: string) {
            entry.popup = html;
            return this;
          },
          addTo() {
            return this;
          },
        };
      }),
      marker: vi.fn(() => {
        const entry = { popup: "", tooltip: "" };
        recorded.markers.push(entry);
        return {
          bindPopup(html: string) {
            entry.popup = html;
            return this;
          },
          bindTooltip(text: string) {
            entry.tooltip = text;
            return this;
          },
          addTo() {
            return this;
          },
        };
      }),
      divIcon: vi.fn(() => ({})),
      latLngBounds: vi.fn((bounds: unknown) => bounds),
    },
  };
});

import type L from "leaflet";
import { renderAqiGridOverlay, renderEvaluatedRoutesOverlay } from "./mapLayers";

describe("Leaflet mapLayers rendering and XSS sanitization", () => {
  beforeEach(() => {
    recorded.circles.length = 0;
    recorded.markers.length = 0;
    recorded.polylines.length = 0;
    recorded.circleMarkers.length = 0;
  });

  it("renders grid overlays and escapes HTML-sensitive labels and city names", () => {
    const group = { clearLayers: vi.fn() } as unknown as L.LayerGroup;

    renderAqiGridOverlay(
      group,
      [
        {
          latitude: 28.61,
          longitude: 77.2,
          us_aqi: 190,
          pm2_5: 95,
          category: "Unhealthy",
          color: "#d6403a",
        },
      ],
      '<script>alert("xss")</script>'
    );

    expect(group.clearLayers).toHaveBeenCalledTimes(1);
    expect(recorded.circles).toHaveLength(1);
    expect(recorded.circles[0].popup).not.toContain("<script>");
    expect(recorded.circles[0].popup).toContain("&lt;script&gt;");
    expect(recorded.markers[0].tooltip).toContain("&lt;script&gt;");
  });

  it("renders routes with dashed alternatives, solid recommended route, and clears cleanly when null", () => {
    const map = { fitBounds: vi.fn() } as unknown as L.Map;
    const group = { clearLayers: vi.fn() } as unknown as L.LayerGroup;

    renderEvaluatedRoutesOverlay(map, group, null);
    expect(group.clearLayers).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).not.toHaveBeenCalled();

    renderEvaluatedRoutesOverlay(map, group, {
      origin: { name: "<b>Origin</b>", latitude: 28.61, longitude: 77.2 },
      destination: { name: "Dest & End", latitude: 28.65, longitude: 77.25 },
      recommendedRouteIndex: 1,
      verdict: "CAUTION",
      verdictHeadline: "Caution",
      analysis: "Analysis",
      betterRouteSuggestion: "Use Alternative",
      routes: [
        {
          index: 0,
          label: "Primary Route",
          distanceKm: 5,
          durationMin: 15,
          avgAqi: 180,
          maxAqi: 200,
          avgPm25: 80,
          coordinates: [
            [28.61, 77.2],
            [28.65, 77.25],
          ],
          waypoints: [],
          color: "#d6403a",
        },
        {
          index: 1,
          label: "Alternative Route 1",
          distanceKm: 5.5,
          durationMin: 17,
          avgAqi: 110,
          maxAqi: 120,
          avgPm25: 45,
          coordinates: [
            [28.61, 77.2],
            [28.63, 77.22],
            [28.65, 77.25],
          ],
          waypoints: [
            {
              latitude: 28.63,
              longitude: 77.22,
              us_aqi: 110,
              pm2_5: 45,
              category: "Unhealthy for Sensitive Groups",
              color: "#e07b1f",
            },
          ],
          color: "#e07b1f",
        },
      ],
    });

    // Non-recommended route rendered first (dashed), recommended second (solid)
    expect(recorded.polylines[0].options.dashArray).toBe("8, 8");
    expect(recorded.polylines[1].options.dashArray).toBeUndefined();
    expect(recorded.polylines[1].popup).toContain("(Recommended)");
    expect(recorded.circleMarkers).toHaveLength(1);
    expect(recorded.markers[0].popup).toContain("&lt;b&gt;Origin&lt;/b&gt;");
    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    // Empty coordinate arrays avoid fitBounds call
    const fitBoundsMock = vi.fn();
    renderEvaluatedRoutesOverlay({ fitBounds: fitBoundsMock } as unknown as L.Map, group, {
      origin: { name: "A", latitude: 0, longitude: 0 },
      destination: { name: "B", latitude: 0, longitude: 0 },
      recommendedRouteIndex: 0,
      verdict: "SAFE",
      verdictHeadline: "Safe",
      analysis: "Clean",
      betterRouteSuggestion: "Fine",
      routes: [
        {
          index: 0,
          label: "Primary Route",
          distanceKm: 1,
          durationMin: 3,
          avgAqi: 30,
          maxAqi: 30,
          avgPm25: 10,
          coordinates: [],
          waypoints: [],
          color: "#2f9e63",
        },
      ],
    });
    expect(fitBoundsMock).not.toHaveBeenCalled();
  });
});
