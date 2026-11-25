import {
  AQICategory,
  AQIGridPoint,
  CityLocation,
  CurrentAQI,
  HourlyAQIPoint,
  OutdoorVerdict,
  ParsedAQIData,
  SafeWindowSummary,
} from "@/types";
import { formatHourRange } from "@/lib/format";

/** Number of hourly steps included in the dashboard forecast horizon. */
export const FORECAST_HOURS_COUNT = 24;

/** Visibility estimation calibration constants derived from surface PM2.5. */
const VISIBILITY_MIN_KM = 1.5;
const VISIBILITY_MAX_KM = 12;
const VISIBILITY_BASE_KM = 18;
const VISIBILITY_PM25_DIVISOR = 11;
const VISIBILITY_POOR_THRESHOLD_KM = 4;
const VISIBILITY_HAZY_THRESHOLD_KM = 8;

/** US EPA AQI classification thresholds used across charts, alerts, and map overlays. */
export interface AQIBandConfig {
  maxAqi: number;
  rangeLabel: string;
  shortName: string;
  category: AQICategory;
  color: string;
  headline: string;
}

/** Single source of truth for US EPA AQI breakpoints, UI colors, and plain-language advice. */
export const AQI_BANDS: ReadonlyArray<AQIBandConfig> = [
  {
    maxAqi: 50,
    rangeLabel: "0–50",
    shortName: "Good",
    category: "Good",
    color: "#2f9e63",
    headline: "Air is clean. Go outside.",
  },
  {
    maxAqi: 100,
    rangeLabel: "51–100",
    shortName: "Moderate",
    category: "Moderate",
    color: "#c99700",
    headline: "Fine for most. Sensitive people take care.",
  },
  {
    maxAqi: 150,
    rangeLabel: "101–150",
    shortName: "Sensitive",
    category: "Unhealthy for Sensitive Groups",
    color: "#e07b1f",
    headline: "Limit long outdoor effort.",
  },
  {
    maxAqi: 200,
    rangeLabel: "151–200",
    shortName: "Unhealthy",
    category: "Unhealthy",
    color: "#d6403a",
    headline: "Avoid the outdoors where you can.",
  },
  {
    maxAqi: 300,
    rangeLabel: "201–300",
    shortName: "Very Unhealthy",
    category: "Very Unhealthy",
    color: "#8a3fb0",
    headline: "Stay indoors. Mask up if you must go.",
  },
  {
    maxAqi: Infinity,
    rangeLabel: "301+",
    shortName: "Hazardous",
    category: "Hazardous",
    color: "#7a1e3a",
    headline: "Stay indoors with the windows shut.",
  },
];

/** Default Indian preset cities displayed as quick-select chips. */
export const INDIAN_PRESET_CITIES: CityLocation[] = [
  { name: "Delhi", admin1: "Delhi", country: "India", latitude: 28.6139, longitude: 77.209 },
  { name: "Kolkata", admin1: "West Bengal", country: "India", latitude: 22.5726, longitude: 88.3639 },
  { name: "Haldia", admin1: "West Bengal", country: "India", latitude: 22.0624, longitude: 88.0694 },
  { name: "Mumbai", admin1: "Maharashtra", country: "India", latitude: 19.076, longitude: 72.8777 },
  { name: "Bengaluru", admin1: "Karnataka", country: "India", latitude: 12.9716, longitude: 77.5946 },
];

/** Spatial 3x3 coordinate offsets (~6 km spacing) used around the selected city center. */
export const GRID_SPATIAL_OFFSETS: ReadonlyArray<{ dLat: number; dLon: number; label: string }> = [
  { dLat: 0, dLon: 0, label: "City Center" },
  { dLat: 0.055, dLon: 0, label: "North Zone" },
  { dLat: -0.055, dLon: 0, label: "South Zone" },
  { dLat: 0, dLon: 0.055, label: "East Zone" },
  { dLat: 0, dLon: -0.055, label: "West Zone" },
  { dLat: 0.045, dLon: 0.045, label: "North-East" },
  { dLat: 0.045, dLon: -0.045, label: "North-West" },
  { dLat: -0.045, dLon: 0.045, label: "South-East" },
  { dLat: -0.045, dLon: -0.045, label: "South-West" },
];

/** Diurnal winter smog curve multipliers indexed by local hour (0..23). */
const DIURNAL_SMOG_FACTORS = [
  1.15, 1.2, 1.22, 1.25, 1.25, 1.2, 1.15, 1.1, 1, 0.88, 0.78, 0.7,
  0.65, 0.62, 0.62, 0.66, 0.75, 0.9, 1.05, 1.15, 1.2, 1.2, 1.18, 1.16,
];

const CITY_FALLBACK_BASES: Record<string, { basePm: number; pm10Ratio: number }> = {
  Delhi: { basePm: 172, pm10Ratio: 1.8 },
  Kolkata: { basePm: 118, pm10Ratio: 1.6 },
  Haldia: { basePm: 86, pm10Ratio: 1.5 },
  Mumbai: { basePm: 58, pm10Ratio: 1.7 },
  Bengaluru: { basePm: 31, pm10Ratio: 1.5 },
};

const DEFAULT_FALLBACK_BASE = { basePm: 140, pm10Ratio: 1.6 };
const DEFAULT_AQI_COORDINATES = { latitude: 28.6139, longitude: 77.209 };

/** Raw Open-Meteo hourly air quality response shape. */
export interface OpenMeteoAirQualityRawResponse {
  latitude?: number;
  longitude?: number;
  hourly?: {
    time?: string[];
    pm2_5?: number[];
    pm10?: number[];
    us_aqi?: number[];
  };
}

/** Raw Open-Meteo single-location current reading item. */
export interface OpenMeteoGridRawItem {
  latitude?: number;
  longitude?: number;
  current?: {
    pm2_5?: number;
    us_aqi?: number;
  };
}

/**
 * Classify a numeric US AQI reading into its EPA category, color hex code, and guidance headline.
 */
export function getAQICategory(usAqi: number): {
  category: AQICategory;
  color: string;
  headline: string;
} {
  const band = AQI_BANDS.find((b) => usAqi <= b.maxAqi) ?? AQI_BANDS[AQI_BANDS.length - 1];
  return { category: band.category, color: band.color, headline: band.headline };
}

/**
 * Estimate surface road visibility in kilometers and driving advisory from PM2.5 concentration.
 */
export function estimateVisibilityFromPM25(pm25: number): { km: number; condition: string } {
  const rawVis = Math.round((VISIBILITY_BASE_KM - pm25 / VISIBILITY_PM25_DIVISOR) * 10) / 10;
  const km = Math.max(VISIBILITY_MIN_KM, Math.min(VISIBILITY_MAX_KM, rawVis));

  let condition = "Clear enough to drive";
  if (km < VISIBILITY_POOR_THRESHOLD_KM) {
    condition = "Poor, slow down";
  } else if (km < VISIBILITY_HAZY_THRESHOLD_KM) {
    condition = "Hazy, drive with lights on";
  }
  return { km, condition };
}

/**
 * Build the structured outdoor safety verdict for a city's current US AQI and PM2.5 levels.
 */
export function computeOutdoorVerdict(
  currentAQI: number,
  _pm25: number,
  cityName: string
): OutdoorVerdict {
  const cat = getAQICategory(currentAQI);

  if (currentAQI >= 201) {
    return {
      status: "STAY_INDOORS",
      headline: cat.headline,
      badgeLabel: cat.category,
      badgeColor: cat.color,
      summary: `${cityName}: fine soot (PM2.5) passes the upper airways and reaches deep into the lungs. Today is a day to plan around the air, not ignore it.`,
      safeWindowPrompt:
        "Midday sun lifts the haze layer and winds disperse ground-level soot. Postpone early morning and evening runs.",
      recommendation:
        "Keep infants, older adults, and anyone with asthma in one closed room with an air purifier or minimum drafts.",
    };
  }

  if (currentAQI >= 101) {
    return {
      status: "HAZARDOUS",
      headline: cat.headline,
      badgeLabel: cat.category,
      badgeColor: cat.color,
      summary: `${cityName}: fine soot levels are elevated. Children, older adults and anyone with asthma should take it easy.`,
      safeWindowPrompt:
        "Use the early afternoon window (12 PM – 3 PM) when solar warming breaks the thermal inversion.",
      recommendation: "Wear a well-fitted N95 or FFP2 mask when commuting outdoors.",
    };
  }

  return {
    status: "SAFE",
    headline: cat.headline,
    badgeLabel: cat.category,
    badgeColor: cat.color,
    summary: `${cityName}: air quality is in an acceptable range. Normal outdoor activities are fine for most people.`,
    safeWindowPrompt:
      "Outdoor air is clear and suitable for school runs, workouts, and fresh ventilation.",
    recommendation: "Open windows freely during midday hours.",
  };
}

function findClosestHourIndex(times: string[], referenceTime: Date): number {
  const nowIsoHour = referenceTime.toISOString().slice(0, 13);
  const exactIndex = times.findIndex((t) => t.startsWith(nowIsoHour));
  if (exactIndex !== -1) {
    return exactIndex;
  }

  const nowMs = referenceTime.getTime();
  let minDiff = Infinity;
  let closestIdx = 0;

  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(new Date(times[i]).getTime() - nowMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx;
}

/**
 * Parse a raw Open-Meteo 48-hour air quality response into a normalized current snapshot
 * plus a padded 24-hour hourly forecast slice starting from `referenceTime`.
 */
export function parseOpenMeteoAirQuality(
  data: OpenMeteoAirQualityRawResponse | null | undefined,
  cityName = "Selected City",
  referenceTime: Date = new Date()
): ParsedAQIData {
  if (!data?.hourly || !Array.isArray(data.hourly.time)) {
    throw new Error("Invalid Open-Meteo response format");
  }

  const times = data.hourly.time;
  const pm25s = data.hourly.pm2_5 ?? [];
  const pm10s = data.hourly.pm10 ?? [];
  const usAqis = data.hourly.us_aqi ?? [];

  const startIndex = findClosestHourIndex(times, referenceTime);
  const curPm25 = Number((pm25s[startIndex] ?? 0).toFixed(1));
  const curPm10 = Number((pm10s[startIndex] ?? 0).toFixed(1));
  const curUsAqi = Math.round(usAqis[startIndex] ?? 0);
  const curCat = getAQICategory(curUsAqi);
  const vis = estimateVisibilityFromPM25(curPm25);

  const current: CurrentAQI = {
    pm2_5: curPm25,
    pm10: curPm10,
    us_aqi: curUsAqi,
    time: times[startIndex] || referenceTime.toISOString(),
    category: curCat.category,
    color: curCat.color,
    visibilityKm: vis.km,
    visibilityCondition: vis.condition,
  };

  const forecast24h: HourlyAQIPoint[] = [];
  const availableCount = Math.min(FORECAST_HOURS_COUNT, times.length - startIndex);

  for (let i = 0; i < availableCount; i++) {
    const idx = startIndex + i;
    const pm = Number((pm25s[idx] ?? 0).toFixed(1));
    forecast24h.push({
      time: times[idx],
      pm2_5: pm,
      pm10: Number((pm10s[idx] ?? 0).toFixed(1)),
      us_aqi: Math.round(usAqis[idx] ?? 0),
      visibilityKm: estimateVisibilityFromPM25(pm).km,
    });
  }

  while (forecast24h.length < FORECAST_HOURS_COUNT && forecast24h.length > 0) {
    forecast24h.push({ ...forecast24h[forecast24h.length - 1] });
  }

  return {
    city: cityName,
    coordinates: {
      latitude: data.latitude ?? 0,
      longitude: data.longitude ?? 0,
    },
    current,
    forecast24h,
    outdoorVerdict: computeOutdoorVerdict(curUsAqi, curPm25, cityName),
  };
}

/**
 * Generate a realistic diurnal winter-smog fallback dataset when Open-Meteo is unreachable.
 */
export function createFallbackAQIData(cityName = "Delhi", customPm?: number): ParsedAQIData {
  const now = new Date();
  const currentHour = now.getHours();
  const forecast24h: HourlyAQIPoint[] = [];

  const cfg = CITY_FALLBACK_BASES[cityName] ?? DEFAULT_FALLBACK_BASE;
  const basePm = customPm !== undefined ? customPm / DIURNAL_SMOG_FACTORS[currentHour] : cfg.basePm;

  for (let i = 0; i < FORECAST_HOURS_COUNT; i++) {
    const t = new Date(now.getTime() + i * 3600 * 1000);
    const h = (currentHour + i) % 24;
    const pm = Math.round(basePm * DIURNAL_SMOG_FACTORS[h] * (1 + 0.04 * Math.sin(i * 1.7)) * 10) / 10;
    const pm10 = Math.round(pm * cfg.pm10Ratio * 10) / 10;
    const aqi = Math.min(500, Math.round(pm * 1.5));

    forecast24h.push({
      time: t.toISOString(),
      pm2_5: pm,
      pm10,
      us_aqi: aqi,
      visibilityKm: estimateVisibilityFromPM25(pm).km,
    });
  }

  const currentPoint = forecast24h[0];
  const cat = getAQICategory(currentPoint.us_aqi);
  const vis = estimateVisibilityFromPM25(currentPoint.pm2_5);

  return {
    city: cityName,
    coordinates: DEFAULT_AQI_COORDINATES,
    current: {
      pm2_5: currentPoint.pm2_5,
      pm10: currentPoint.pm10,
      us_aqi: currentPoint.us_aqi,
      time: currentPoint.time,
      category: cat.category,
      color: cat.color,
      visibilityKm: vis.km,
      visibilityCondition: vis.condition,
    },
    forecast24h,
    outdoorVerdict: computeOutdoorVerdict(currentPoint.us_aqi, currentPoint.pm2_5, cityName),
  };
}

/**
 * Identify the two cleanest non-overlapping 2-hour daytime windows (6 am–8 pm) in a 24-hour forecast.
 */
export function computeSafestWindows(
  forecast24h: HourlyAQIPoint[],
  nowHour: number = new Date().getHours()
): SafeWindowSummary[] {
  if (forecast24h.length < 2) {
    return [];
  }

  const candidates: SafeWindowSummary[] = [];

  for (let i = 0; i < forecast24h.length - 1; i++) {
    const current = forecast24h[i];
    const next = forecast24h[i + 1];
    const hour = new Date(current.time).getHours();

    if (hour >= 6 && hour <= 20) {
      const avgPm = Math.round(((current.pm2_5 + next.pm2_5) / 2) * 10) / 10;
      candidates.push({
        idx: i,
        avgPm,
        aqiVal: Math.round(Math.max(current.us_aqi, next.us_aqi)),
        label: formatHourRange(hour, 2),
        day: nowHour + i >= 24 ? "Tomorrow" : "Today",
      });
    }
  }

  candidates.sort((a, b) => a.avgPm - b.avgPm);

  const selected: SafeWindowSummary[] = [];
  for (const candidate of candidates) {
    if (selected.every((existing) => Math.abs(existing.idx - candidate.idx) >= 3)) {
      selected.push(candidate);
    }
    if (selected.length === 2) {
      break;
    }
  }
  return selected;
}

/**
 * Transform raw batch Open-Meteo grid points into map-ready color-coded zones.
 */
export function buildAqiGridPoints(
  items: OpenMeteoGridRawItem[],
  centerLat: number,
  centerLon: number
): AQIGridPoint[] {
  return items.map((item, idx) => {
    const pm2_5 = Math.round((item.current?.pm2_5 ?? 50) * 10) / 10;
    const us_aqi = Math.round(item.current?.us_aqi ?? 110);
    const cat = getAQICategory(us_aqi);
    const offset = GRID_SPATIAL_OFFSETS[idx];

    return {
      latitude: item.latitude ?? centerLat + (offset?.dLat ?? 0),
      longitude: item.longitude ?? centerLon + (offset?.dLon ?? 0),
      us_aqi,
      pm2_5,
      category: cat.category,
      color: cat.color,
      label: offset?.label ?? `Zone ${idx + 1}`,
    };
  });
}

/**
 * Generate a 3x3 simulated spatial AQI grid fallback when Open-Meteo is unavailable.
 */
export function createFallbackAqiGrid(centerLat: number, centerLon: number): AQIGridPoint[] {
  return GRID_SPATIAL_OFFSETS.map((offset, idx) => {
    const simulatedAqi = 120 + (idx % 4) * 22;
    const cat = getAQICategory(simulatedAqi);
    return {
      latitude: centerLat + offset.dLat,
      longitude: centerLon + offset.dLon,
      us_aqi: simulatedAqi,
      pm2_5: Math.round(simulatedAqi * 0.45),
      category: cat.category,
      color: cat.color,
      label: offset.label,
    };
  });
}
