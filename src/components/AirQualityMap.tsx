"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation } from "lucide-react";
import RouteResultCard from "@/components/RouteResultCard";
import { renderAqiGridOverlay, renderEvaluatedRoutesOverlay } from "@/lib/mapLayers";
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
    if (gridLayerRef.current) {
      renderAqiGridOverlay(gridLayerRef.current, gridPoints, location.name);
    }
  }, [gridPoints, location.name]);

  useEffect(() => {
    if (mapInstanceRef.current && routeLayerRef.current) {
      renderEvaluatedRoutesOverlay(mapInstanceRef.current, routeLayerRef.current, routeResult);
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

      {routeError && (
        <div className="map-error-banner" role="alert">
          {routeError}
        </div>
      )}

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
