# AQIfer • Urban Air Quality & Route Safety Assistant

> Fast, production-ready Urban Air Quality Assistant built for **PromptWars** to help families navigate severe winter smog in Indian cities and worldwide.

---

## Architecture & Highlights

### 1. Modular Client Architecture & Accessibility
- **Clean Declarative Composition**: [page.tsx](src/app/page.tsx) composes [useAirQualityDashboard](src/hooks/useAirQualityDashboard.ts) with focused UI panels (`CitySearchHeader`, `HeroSummaryGrid`, `ForecastChart`, `HouseholdProfilePanel`, `AirQualityMap`, and `AssistantPanel`).
- **Accessible Landmarks & Screen Reader Support**: Uses `<main>`, `<footer>`, `role="log"` with `aria-live="polite"` for chat updates, `role="alert"` for search/route errors, `aria-expanded` toggles, and explicit descriptive `aria-label` strings on inputs, map regions, and 24-hour bar controls.

### 2. Next.js Edge Runtime & Security Hardening
All backend API routes run on the Next.js Edge Runtime with `AbortController` timeouts, input validation (`parseCoordinates`, `normalizeFamilyProfile`), XSS HTML escaping in Leaflet popups (`escapeHtml`), and security HTTP headers in `next.config.mjs`:
- `/api/air-quality`: Proxies and normalizes Open-Meteo 48h telemetry into a 24-hour forecast of PM2.5, PM10, visibility, and US AQI with deterministic diurnal fallback.
- `/api/aqi-grid`: Computes a 3x3 color-coded spatial AQI zone grid around city coordinates for OpenStreetMap overlays.
- `/api/geocode`: Global city search autocomplete via Open-Meteo Geocoding API.
- `/api/ai-plan`: Structured Gemini Flash cascade (`2.5-flash` -> `2.0-flash` -> `1.5-flash`) with response schema enforcement and epidemiological fallback.
- `/api/chat`: Grounded follow-up Q&A assistant consulting the 24-hour hourly forecast and live city overrides.
- `/api/route-safety`: Geocodes journey endpoints via Nominatim/Open-Meteo, evaluates candidate OSRM corridors against waypoint AQI, and recommends the cleanest corridor.

---

## Core Features

1. **Any-City Search + Live AQI Data**: Quick-select Indian hotspot presets (**Delhi**, **Kolkata**, **Haldia**, **Mumbai**, **Bengaluru**) plus global search autocomplete and interactive 24-hour color-coded bars highlighting the two safest daytime windows.
2. **Household Profile & Re-evaluate Report**: Configure vulnerable household members, commute mode, and indoor filtration, with one-click AI report re-evaluation.
3. **Interactive OpenStreetMap AQI Map & Journey Planner**: Color-coded EPA AQI zones with route exposure verdicts (`SAFE`, `CAUTION`, `AVOID`) and cleaner corridor suggestions.
4. **Resilient Graceful Degradation**: Works end-to-end even when external APIs or Gemini keys are unavailable.

---

## Automated Verification & CI

The repository enforces linting, strict TypeScript checking, Vitest coverage thresholds (`95%+` lines/functions), and production builds locally and in GitHub Actions (`.github/workflows/ci.yml`):

```bash
pnpm dev            # Run local development server
pnpm lint           # Run ESLint across Next.js codebase
pnpm typecheck      # Run strict TypeScript compiler checks
pnpm test           # Run 54 Vitest unit, API, hook, and UI tests
pnpm test:coverage  # Run tests with V8 coverage thresholds
pnpm build          # Create production Next.js build
```
