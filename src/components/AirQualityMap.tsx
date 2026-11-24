"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AQIGridPoint, CityLocation, FamilyProfile, RouteSafetyResult } from "@/types";
import { MapPin, Navigation, ShieldAlert, ShieldCheck, AlertTriangle, Sparkles } from "lucide-react";

interface AirQualityMapProps {
  location: CityLocation;
  familyProfile: FamilyProfile;
}

const AQI_LEGEND = [
  { label: "Good (0–50)", color: "#2f9e63" },
  { label: "Moderate (51–100)", color: "#c99700" },
  { label: "Sensitive (101–150)", color: "#e07b1f" },
  { label: "Unhealthy (151–200)", color: "#d6403a" },
  { label: "Very Unhealthy (201–300)", color: "#8a3fb0" },
  { label: "Hazardous (301+)", color: "#7a1e3a" },
];

function getQuickSampleJourney(cityName: string): { from: string; to: string } {
  const c = cityName.toLowerCase();
  if (c.includes("delhi")) return { from: "Connaught Place, Delhi", to: "India Gate, Delhi" };
  if (c.includes("kolkata")) return { from: "Howrah, Kolkata", to: "Salt Lake, Kolkata" };
  if (c.includes("mumbai")) return { from: "Bandra, Mumbai", to: "Dadar, Mumbai" };
  if (c.includes("bengaluru") || c.includes("bangalore")) return { from: "Indiranagar, Bengaluru", to: "MG Road, Bengaluru" };
  if (c.includes("kozhikode")) return { from: "Kozhikode Beach", to: "Kozhikode Railway Station" };
  if (c.includes("haldia")) return { from: "Durgachak, Haldia", to: "Haldia Township" };
  return { from: `${cityName} Center`, to: `${cityName} Railway Station` };
}

export default function AirQualityMap({ location, familyProfile }: AirQualityMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  const [gridPoints, setGridPoints] = useState<AQIGridPoint[]>([]);
  const [originInput, setOriginInput] = useState<string>("");
  const [destInput, setDestInput] = useState<string>("");
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<RouteSafetyResult | null>(null);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [location.latitude, location.longitude],
      zoom: 12,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    gridLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      gridLayerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  // Re-center map & fetch color-coded AQI grid when city changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map) {
      map.setView([location.latitude, location.longitude], 12, { animate: true });
    }
    setRouteResult(null);
    setRouteError(null);
    routeLayerRef.current?.clearLayers();

    let active = true;
    fetch(`/api/aqi-grid?lat=${location.latitude}&lon=${location.longitude}`)
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data.points)) {
          setGridPoints(data.points);
        }
      })
      .catch((err) => console.warn("Failed to load AQI map grid:", err));

    return () => {
      active = false;
    };
  }, [location.latitude, location.longitude, location.name]);

  // Render color-coded AQI zones on map
  useEffect(() => {
    const group = gridLayerRef.current;
    if (!group) return;
    group.clearLayers();

    gridPoints.forEach((pt) => {
      // Translucent AQI zone circle
      L.circle([pt.latitude, pt.longitude], {
        radius: 2600,
        color: pt.color,
        weight: 1.5,
        opacity: 0.7,
        fillColor: pt.color,
        fillOpacity: 0.24,
      })
        .bindPopup(
          `<div style="font-family:sans-serif;color:#111;">
            <strong>${pt.label || location.name}</strong><br/>
            US AQI: <b style="color:${pt.color}">${pt.us_aqi}</b> (${pt.category})<br/>
            PM2.5: <b>${pt.pm2_5} µg/m³</b>
          </div>`
        )
        .addTo(group);

      // Compact AQI pill marker
      const icon = L.divIcon({
        className: "aqi-map-badge",
        html: `<div style="background:${pt.color};color:#fff;font-weight:700;font-size:11px;padding:2px 7px;border-radius:999px;border:1.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;text-align:center;">${pt.us_aqi}</div>`,
        iconSize: [38, 22],
        iconAnchor: [19, 11],
      });

      L.marker([pt.latitude, pt.longitude], { icon })
        .bindTooltip(`${pt.label || "Zone"}: AQI ${pt.us_aqi} (${pt.pm2_5} µg/m³)`, { direction: "top" })
        .addTo(group);
    });
  }, [gridPoints, location.name]);

  // Render evaluated routes on map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = routeLayerRef.current;
    if (!map || !group) return;
    group.clearLayers();

    if (!routeResult) return;

    const allBounds: L.LatLngExpression[] = [];

    // Draw non-recommended routes first (dashed), then recommended route on top (solid)
    const orderedRoutes = [...routeResult.routes].sort((a, b) =>
      a.index === routeResult.recommendedRouteIndex ? 1 : b.index === routeResult.recommendedRouteIndex ? -1 : 0
    );

    orderedRoutes.forEach((route) => {
      const isRecommended = route.index === routeResult.recommendedRouteIndex;
      const latLngs = route.coordinates as L.LatLngExpression[];
      latLngs.forEach((c) => allBounds.push(c));

      L.polyline(latLngs, {
        color: isRecommended ? route.color : "#94a3b8",
        weight: isRecommended ? 6 : 4,
        opacity: isRecommended ? 0.92 : 0.65,
        dashArray: isRecommended ? undefined : "8, 8",
      })
        .bindPopup(
          `<div style="font-family:sans-serif;color:#111;">
            <strong>${route.label}${isRecommended ? " (Recommended)" : ""}</strong><br/>
            Distance: ${route.distanceKm} km (~${route.durationMin} min)<br/>
            Avg AQI: <b>${route.avgAqi}</b> • Peak: <b>${route.maxAqi}</b>
          </div>`
        )
        .addTo(group);

      // Draw waypoint AQI dots for the recommended route
      if (isRecommended) {
        route.waypoints.forEach((wp, wIdx) => {
          L.circleMarker([wp.latitude, wp.longitude], {
            radius: 6,
            color: "#ffffff",
            weight: 2,
            fillColor: wp.color,
            fillOpacity: 1,
          })
            .bindTooltip(`Waypoint ${wIdx + 1}: AQI ${wp.us_aqi} (${wp.pm2_5} µg/m³)`)
            .addTo(group);
        });
      }
    });

    // Origin & Destination pin badges
    const makePin = (letter: string, bg: string) =>
      L.divIcon({
        className: "route-pin",
        html: `<div style="background:${bg};color:#fff;font-weight:800;font-size:12px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);">${letter}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

    L.marker([routeResult.origin.latitude, routeResult.origin.longitude], {
      icon: makePin("A", "#0f172a"),
    })
      .bindPopup(`<b>Start:</b> ${routeResult.origin.name}`)
      .addTo(group);

    L.marker([routeResult.destination.latitude, routeResult.destination.longitude], {
      icon: makePin("B", "#2563eb"),
    })
      .bindPopup(`<b>Destination:</b> ${routeResult.destination.name}`)
      .addTo(group);

    if (allBounds.length > 0) {
      map.fitBounds(L.latLngBounds(allBounds), { padding: [36, 36], maxZoom: 14 });
    }
  }, [routeResult]);

  const evaluateRoute = async (fromText: string, toText: string) => {
    if (!fromText.trim() || !toText.trim() || isEvaluating) return;
    setIsEvaluating(true);
    setRouteError(null);

    try {
      const res = await fetch("/api/route-safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: fromText.trim(),
          destination: toText.trim(),
          city: location.name,
          familyProfile,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setRouteError(data.error || "Could not evaluate this journey.");
      } else {
        setRouteResult(data);
      }
    } catch (err) {
      setRouteError("Network error checking route safety. Please try again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSampleClick = () => {
    const sample = getQuickSampleJourney(location.name);
    setOriginInput(sample.from);
    setDestInput(sample.to);
    evaluateRoute(sample.from, sample.to);
  };

  const verdictStyle =
    routeResult?.verdict === "SAFE"
      ? { color: "#2f9e63", bg: "rgba(47, 158, 99, 0.14)", Icon: ShieldCheck }
      : routeResult?.verdict === "CAUTION"
      ? { color: "#e07b1f", bg: "rgba(224, 123, 31, 0.14)", Icon: AlertTriangle }
      : { color: "#d6403a", bg: "rgba(214, 64, 58, 0.14)", Icon: ShieldAlert };

  return (
    <div className="panel" id="aqi-map-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
        <div>
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <MapPin size={18} /> Live Air Quality Map &amp; Journey Planner
          </h2>
          <p className="sub" style={{ margin: "4px 0 0" }}>
            Color-coded OpenStreetMap AQI zones around {location.name}. Enter your route for AI safety &amp; cleaner path advice.
          </p>
        </div>

        <button
          type="button"
          className="chip"
          onClick={handleSampleClick}
          disabled={isEvaluating}
          style={{ fontSize: "12px", padding: "6px 12px" }}
        >
          Try sample route
        </button>
      </div>

      {/* Journey Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          evaluateRoute(originInput, destInput);
        }}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "12px",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder={`From (e.g. ${getQuickSampleJourney(location.name).from})`}
          value={originInput}
          onChange={(e) => setOriginInput(e.target.value)}
          aria-label="Journey start location"
          style={{
            flex: "1 1 180px",
            font: "inherit",
            fontSize: "13px",
            padding: "9px 12px",
            borderRadius: "10px",
            border: "1px solid var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
          }}
        />
        <input
          type="text"
          placeholder={`To (e.g. ${getQuickSampleJourney(location.name).to})`}
          value={destInput}
          onChange={(e) => setDestInput(e.target.value)}
          aria-label="Journey destination"
          style={{
            flex: "1 1 180px",
            font: "inherit",
            fontSize: "13px",
            padding: "9px 12px",
            borderRadius: "10px",
            border: "1px solid var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
          }}
        />
        <button
          type="submit"
          className="chip"
          disabled={isEvaluating || !originInput.trim() || !destInput.trim()}
          style={{
            background: "var(--ink)",
            color: "var(--bg)",
            borderColor: "var(--ink)",
            padding: "9px 18px",
            fontSize: "13px",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            cursor: isEvaluating ? "not-allowed" : "pointer",
          }}
        >
          <Navigation size={14} />
          {isEvaluating ? "Analyzing Route..." : "Check Route Safety"}
        </button>
      </form>

      {routeError && (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 12px",
            borderRadius: "10px",
            background: "rgba(214, 64, 58, 0.12)",
            border: "1px solid #d6403a",
            color: "#fca5a5",
            fontSize: "13px",
          }}
        >
          {routeError}
        </div>
      )}

      {/* OpenStreetMap Container */}
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height: "360px",
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid var(--line)",
          zIndex: 1,
        }}
      />

      {/* Color-coded AQI Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginTop: "10px",
          fontSize: "11px",
          color: "var(--mute)",
        }}
      >
        {AQI_LEGEND.map((item) => (
          <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <i
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: item.color,
                display: "inline-block",
              }}
            />
            {item.label}
          </span>
        ))}
      </div>

      {/* AI Route Safety & Better Route Suggestion Card */}
      {routeResult && (
        <div
          style={{
            marginTop: "16px",
            padding: "16px",
            borderRadius: "14px",
            border: `1px solid ${verdictStyle.color}`,
            background: verdictStyle.bg,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "999px",
                background: verdictStyle.color,
                color: "#fff",
                fontWeight: 700,
                fontSize: "12px",
              }}
            >
              <verdictStyle.Icon size={14} />
              {routeResult.verdict}
            </span>
            <strong style={{ fontSize: "15px", color: "var(--ink)" }}>{routeResult.verdictHeadline}</strong>
          </div>

          <p style={{ margin: "0 0 10px", fontSize: "13px", lineHeight: 1.5, color: "var(--ink)" }}>
            {routeResult.analysis}
          </p>

          <div
            style={{
              padding: "10px 12px",
              borderRadius: "10px",
              background: "var(--card)",
              border: "1px solid var(--line)",
              fontSize: "13px",
              lineHeight: 1.5,
              marginBottom: "10px",
            }}
          >
            <strong style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--ink)" }}>
              <Sparkles size={14} /> AI Better Route &amp; Commute Advice:
            </strong>{" "}
            <span style={{ color: "var(--ink)" }}>{routeResult.betterRouteSuggestion}</span>
          </div>

          {/* Route Comparison Pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {routeResult.routes.map((r) => {
              const isRec = r.index === routeResult.recommendedRouteIndex;
              return (
                <div
                  key={r.index}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "10px",
                    border: `1px solid ${isRec ? r.color : "var(--line)"}`,
                    background: "var(--card)",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <i style={{ width: "9px", height: "9px", borderRadius: "50%", background: r.color, display: "inline-block" }} />
                  <span>
                    <strong>{r.label}</strong>
                    {isRec ? " ★ Recommended" : ""}: {r.distanceKm} km ({r.durationMin} min) • Avg AQI{" "}
                    <strong style={{ color: r.color }}>{r.avgAqi}</strong> (Peak {r.maxAqi})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
