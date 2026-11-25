import L from "leaflet";
import { escapeHtml } from "@/lib/http";
import { AQIGridPoint, RouteSafetyResult } from "@/types";

function createPinIcon(letter: string, bg: string): L.DivIcon {
  return L.divIcon({
    className: "route-pin",
    html: `<div style="background:${bg};color:#fff;font-weight:800;font-size:12px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);">${escapeHtml(letter)}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Render color-coded US AQI zone circles and numeric pill markers onto a Leaflet layer group.
 */
export function renderAqiGridOverlay(
  group: L.LayerGroup,
  gridPoints: AQIGridPoint[],
  cityName: string
): void {
  group.clearLayers();
  const safeCity = escapeHtml(cityName);

  gridPoints.forEach((pt) => {
    const safeLabel = escapeHtml(pt.label || cityName);
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
}

/**
 * Render evaluated OSRM polylines, waypoint dots, and A/B pins on the OpenStreetMap layer,
 * zooming the viewport to encompass all candidate corridors.
 */
export function renderEvaluatedRoutesOverlay(
  map: L.Map,
  group: L.LayerGroup,
  routeResult: RouteSafetyResult | null
): void {
  group.clearLayers();
  if (!routeResult) {
    return;
  }

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
    latLngs.forEach((coord) => allBounds.push(coord));

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
}
