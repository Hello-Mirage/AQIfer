"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation } from "lucide-react";
import RouteResultCard from "@/components/RouteResultCard";
import { escapeHtml } from "@/lib/http";
import { AQI_BANDS } from "@/lib/openmeteo";
import { AQIGridPoint, CityLocation, FamilyProfile, RouteSafetyResult } from "@/types";

interface AirQualityMapProps {
  location: CityLocation;
  familyProfile: FamilyProfile;
}

const SAMPLE_JOURNEY_BY_CITY: ReadonlyArray<[string, { from: string; to: string }]> = [
  ["delhi", { from: "Connaught Place, Delhi", to: "India Gate, Delhi" }],
  ["kolkata", { from: "Howrah, Kolkata", to: "Salt Lake, Kolkata" }],
  ["mumbai", { from: "Bandra, Mumbai", to: "Dadar, Mumbai" }],
  ["bengaluru", { from: "Indiranagar, Bengaluru", to: "MG Road, Bengaluru" }],
  ["bangalore", { from: "Indiranagar, Bengaluru", to: "MG Road, Bengaluru" }],
  ["kozhikode", { from: "Kozhikode Beach", to: "Kozhikode Railway Station" }],
  ["haldia", { from: "Durgachak, Haldia", to: "Haldia Township" }],
];

function getQuickSampleJourney(cityName: string): { from: string; to: string } {
  const lower = cityName.toLowerCase();
  const matched = SAMPLE_JOURNEY_BY_CITY.find(([key]) => lower.includes(key));
  return matched ? matched[1] : { from: `${cityName} Center`, to: `${cityName} Railway Station` };
}

function createPinIcon(letter: string, bg: string): L.DivIcon {
  return L.divIcon({
    className: "route-pin",
    html: `<div style="background:${bg};color:#fff;font-weight:800;font-size:12px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);">${letter}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Interactive OpenStreetMap dashboard section visualizing a 3x3 color-coded AQI zone overlay
 * and evaluating candidate commute corridors for respiratory safety.
 */
export default function AirQualityMap({ location, familyProfile }: AirQualityMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const initialCenterRef = useRef<[number, number]>([location.latitude, location.longitude]);

  const [gridPoints, setGridPoints] = useState<AQIGridPoint[]>([]);
  const [originInput, setOriginInput] = useState<string>("");
  const [destInput, setDestInput] = useState<string>("");
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<RouteSafetyResult | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: initialCenterRef.current,
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

  useEffect(() => {
    mapInstanceRef.current?.setView([location.latitude, location.longitude], 12, { animate: true });
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

  useEffect(() => {
    const group = gridLayerRef.current;
    if (!group) return;
    group.clearLayers();

    const safeCity = escapeHtml(location.name);
    gridPoints.forEach((pt) => {
      const safeLabel = escapeHtml(pt.label || location.name);
      const safeCategory = escapeHtml(pt.category);

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
            <strong>${safeLabel || safeCity}</strong><br/>
            US AQI: <b style="color:${pt.color}">${pt.us_aqi}</b> (${safeCategory})<br/>
            PM2.5: <b>${pt.pm2_5} µg/m³</b>
          </div>`
        )
        .addTo(group);

      const badgeIcon = L.divIcon({
        className: "aqi-map-badge",
        html: `<div style="background:${pt.color};color:#fff;font-weight:700;font-size:11px;padding:2px 7px;border-radius:999px;border:1.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;text-align:center;">${pt.us_aqi}</div>`,
        iconSize: [38, 22],
        iconAnchor: [19, 11],
      });

      L.marker([pt.latitude, pt.longitude], { icon: badgeIcon })
        .bindTooltip(`${safeLabel}: AQI ${pt.us_aqi} (${pt.pm2_5} µg/m³)`, { direction: "top" })
        .addTo(group);
    });
  }, [gridPoints, location.name]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = routeLayerRef.current;
    if (!map || !group) return;
    group.clearLayers();

    if (!routeResult) return;

    const allBounds: L.LatLngExpression[] = [];
    const orderedRoutes = [...routeResult.routes].sort((a, b) =>
      a.index === routeResult.recommendedRouteIndex
        ? 1
        : b.index === routeResult.recommendedRouteIndex
        ? -1
        : 0
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
            <strong>${escapeHtml(route.label)}${isRecommended ? " (Recommended)" : ""}</strong><br/>
            Distance: ${route.distanceKm} km (~${route.durationMin} min)<br/>
            Avg AQI: <b>${route.avgAqi}</b> • Peak: <b>${route.maxAqi}</b>
          </div>`
        )
        .addTo(group);

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

    L.marker([routeResult.origin.latitude, routeResult.origin.longitude], {
      icon: createPinIcon("A", "#0f172a"),
    })
      .bindPopup(`<b>Start:</b> ${escapeHtml(routeResult.origin.name)}`)
      .addTo(group);

    L.marker([routeResult.destination.latitude, routeResult.destination.longitude], {
      icon: createPinIcon("B", "#2563eb"),
    })
      .bindPopup(`<b>Destination:</b> ${escapeHtml(routeResult.destination.name)}`)
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
    } catch {
      setRouteError("Network error checking route safety. Please try again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const sampleJourney = getQuickSampleJourney(location.name);

  return (
    <div className="panel" id="aqi-map-section">
      <div className="map-header">
        <div>
          <h2 className="map-heading">
            <MapPin size={18} /> Live Air Quality Map &amp; Journey Planner
          </h2>
          <p className="sub map-subtitle">
            Color-coded OpenStreetMap AQI zones around {location.name}. Enter your route for AI
            safety &amp; cleaner path advice.
          </p>
        </div>

        <button
          type="button"
          className="chip map-sample-btn"
          onClick={() => {
            setOriginInput(sampleJourney.from);
            setDestInput(sampleJourney.to);
            evaluateRoute(sampleJourney.from, sampleJourney.to);
          }}
          disabled={isEvaluating}
        >
          Try sample route
        </button>
      </div>

      <form
        className="map-route-form"
        onSubmit={(e) => {
          e.preventDefault();
          evaluateRoute(originInput, destInput);
        }}
      >
        <input
          type="text"
          className="map-route-input"
          placeholder={`From (e.g. ${sampleJourney.from})`}
          value={originInput}
          onChange={(e) => setOriginInput(e.target.value)}
          aria-label="Journey start location"
        />
        <input
          type="text"
          className="map-route-input"
          placeholder={`To (e.g. ${sampleJourney.to})`}
          value={destInput}
          onChange={(e) => setDestInput(e.target.value)}
          aria-label="Journey destination"
        />
        <button
          type="submit"
          className="chip map-submit-btn"
          disabled={isEvaluating || !originInput.trim() || !destInput.trim()}
        >
          <Navigation size={14} />
          {isEvaluating ? "Analyzing Route..." : "Check Route Safety"}
        </button>
      </form>

      {routeError && <div className="map-error-banner">{routeError}</div>}

      <div ref={mapContainerRef} className="map-canvas" />

      <div className="legend map-legend-row">
        {AQI_BANDS.map((band) => (
          <span key={band.category}>
            <i style={{ background: band.color }} /> {band.shortName} ({band.rangeLabel})
          </span>
        ))}
      </div>

      {routeResult && <RouteResultCard result={routeResult} />}
    </div>
  );
}
