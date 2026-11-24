import {
  AQICategory,
  CurrentAQI,
  HourlyAQIPoint,
  ParsedAQIData,
  CityLocation,
  OutdoorVerdict,
} from "@/types";

export const INDIAN_PRESET_CITIES: CityLocation[] = [
  { name: "Delhi", admin1: "Delhi", country: "India", latitude: 28.6139, longitude: 77.2090 },
  { name: "Kolkata", admin1: "West Bengal", country: "India", latitude: 22.5726, longitude: 88.3639 },
  { name: "Haldia", admin1: "West Bengal", country: "India", latitude: 22.0624, longitude: 88.0694 },
  { name: "Mumbai", admin1: "Maharashtra", country: "India", latitude: 19.0760, longitude: 72.8777 },
  { name: "Bengaluru", admin1: "Karnataka", country: "India", latitude: 12.9716, longitude: 77.5946 },
];

export const CATEGORIES_CONFIG = [
  { n: "Good", c: "#2f9e63", h: "Air is clean. Go outside." },
  { n: "Moderate", c: "#c99700", h: "Fine for most. Sensitive people take care." },
  { n: "Unhealthy for Sensitive Groups", c: "#e07b1f", h: "Limit long outdoor effort." },
  { n: "Unhealthy", c: "#d6403a", h: "Avoid the outdoors where you can." },
  { n: "Very Unhealthy", c: "#8a3fb0", h: "Stay indoors. Mask up if you must go." },
  { n: "Hazardous", c: "#7a1e3a", h: "Stay indoors with the windows shut." },
];

export function getAQICategory(usAqi: number): { category: AQICategory; color: string; headline: string } {
  if (usAqi <= 50) return { category: "Good", color: "#2f9e63", headline: "Air is clean. Go outside." };
  if (usAqi <= 100) return { category: "Moderate", color: "#c99700", headline: "Fine for most. Sensitive people take care." };
  if (usAqi <= 150) return { category: "Unhealthy for Sensitive Groups", color: "#e07b1f", headline: "Limit long outdoor effort." };
  if (usAqi <= 200) return { category: "Unhealthy", color: "#d6403a", headline: "Avoid the outdoors where you can." };
  if (usAqi <= 300) return { category: "Very Unhealthy", color: "#8a3fb0", headline: "Stay indoors. Mask up if you must go." };
  return { category: "Hazardous", color: "#7a1e3a", headline: "Stay indoors with the windows shut." };
}

export function estimateVisibilityFromPM25(pm25: number): { km: number; condition: string } {
  const vis = Math.max(1.5, Math.min(12, Math.round((18 - pm25 / 11) * 10) / 10));
  let condition = "Clear enough to drive";
  if (vis < 4) condition = "Poor, slow down";
  else if (vis < 8) condition = "Hazy, drive with lights on";
  return { km: vis, condition };
}

export function computeOutdoorVerdict(currentAQI: number, pm25: number, cityName: string): OutdoorVerdict {
  const cat = getAQICategory(currentAQI);
  if (currentAQI >= 201) {
    return {
      status: "STAY_INDOORS",
      headline: cat.headline,
      badgeLabel: cat.category,
      badgeColor: cat.color,
      summary: `${cityName}: fine soot (PM2.5) passes the upper airways and reaches deep into the lungs. Today is a day to plan around the air, not ignore it.`,
      safeWindowPrompt: "Midday sun lifts the haze layer and winds disperse ground-level soot. Postpone early morning and evening runs.",
      recommendation: "Keep infants, older adults, and anyone with asthma in one closed room with an air purifier or minimum drafts.",
    };
  }

  if (currentAQI >= 101) {
    return {
      status: "HAZARDOUS",
      headline: cat.headline,
      badgeLabel: cat.category,
      badgeColor: cat.color,
      summary: `${cityName}: fine soot levels are elevated. Children, older adults and anyone with asthma should take it easy.`,
      safeWindowPrompt: "Use the early afternoon window (12 PM – 3 PM) when solar warming breaks the thermal inversion.",
      recommendation: "Wear a well-fitted N95 or FFP2 mask when commuting outdoors.",
    };
  }

  return {
    status: "SAFE",
    headline: cat.headline,
    badgeLabel: cat.category,
    badgeColor: cat.color,
    summary: `${cityName}: air quality is in an acceptable range. Normal outdoor activities are fine for most people.`,
    safeWindowPrompt: "Outdoor air is clear and suitable for school runs, workouts, and fresh ventilation.",
    recommendation: "Open windows freely during midday hours.",
  };
}

export function parseOpenMeteoAirQuality(
  data: any,
  cityName: string = "Selected City",
  referenceTime: Date = new Date()
): ParsedAQIData {
  if (!data || !data.hourly || !Array.isArray(data.hourly.time)) {
    throw new Error("Invalid Open-Meteo response format");
  }

  const times: string[] = data.hourly.time;
  const pm25s: number[] = data.hourly.pm2_5 || [];
  const pm10s: number[] = data.hourly.pm10 || [];
  const usAqis: number[] = data.hourly.us_aqi || [];

  const nowIsoHour = referenceTime.toISOString().slice(0, 13);

  let startIndex = times.findIndex((t) => t.startsWith(nowIsoHour));
  if (startIndex === -1) {
    const nowMs = referenceTime.getTime();
    let minDiff = Infinity;
    startIndex = 0;
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(new Date(times[i]).getTime() - nowMs);
      if (diff < minDiff) {
        minDiff = diff;
        startIndex = i;
      }
    }
  }

  const curPm25 = Number((pm25s[startIndex] ?? 0).toFixed(1));
  const curPm10 = Number((pm10s[startIndex] ?? 0).toFixed(1));
  const curUsAqi = Math.round(usAqis[startIndex] ?? 0);
  const curCat = getAQICategory(curUsAqi);
  const vis = estimateVisibilityFromPM25(curPm25);

  const current: CurrentAQI = {
    pm2_5: curPm25,
    pm10: curPm10,
    us_aqi: curUsAqi,
    time: times[startIndex] || new Date().toISOString(),
    category: curCat.category,
    color: curCat.color,
    visibilityKm: vis.km,
    visibilityCondition: vis.condition,
  };

  const forecast24h: HourlyAQIPoint[] = [];
  const count = Math.min(24, times.length - startIndex);

  for (let i = 0; i < count; i++) {
    const idx = startIndex + i;
    const pm = Number((pm25s[idx] ?? 0).toFixed(1));
    const hVis = estimateVisibilityFromPM25(pm);
    forecast24h.push({
      time: times[idx],
      pm2_5: pm,
      pm10: Number((pm10s[idx] ?? 0).toFixed(1)),
      us_aqi: Math.round(usAqis[idx] ?? 0),
      visibilityKm: hVis.km,
    });
  }

  while (forecast24h.length < 24 && forecast24h.length > 0) {
    const last = forecast24h[forecast24h.length - 1];
    forecast24h.push({ ...last });
  }

  const outdoorVerdict = computeOutdoorVerdict(curUsAqi, curPm25, cityName);

  return {
    city: cityName,
    coordinates: {
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
    },
    current,
    forecast24h,
    outdoorVerdict,
  };
}

export function createFallbackAQIData(cityName: string = "Delhi", customPm?: number): ParsedAQIData {
  const now = new Date();
  const currentHour = now.getHours();
  const forecast24h: HourlyAQIPoint[] = [];

  // Diurnal winter smog factor array matching the design specification
  const F = [1.15,1.2,1.22,1.25,1.25,1.2,1.15,1.1,1,.88,.78,.7,.65,.62,.62,.66,.75,.9,1.05,1.15,1.2,1.2,1.18,1.16];
  const cityBases: Record<string, { b: number; r: number }> = {
    Delhi: { b: 172, r: 1.8 },
    Kolkata: { b: 118, r: 1.6 },
    Haldia: { b: 86, r: 1.5 },
    Mumbai: { b: 58, r: 1.7 },
    Bengaluru: { b: 31, r: 1.5 },
  };

  const cfg = cityBases[cityName] || { b: 140, r: 1.6 };
  const base = customPm ? customPm / F[currentHour] : cfg.b;
  const ratio = cfg.r;

  for (let i = 0; i < 24; i++) {
    const t = new Date(now.getTime() + i * 3600 * 1000);
    const h = (currentHour + i) % 24;
    const pm = Math.round(base * F[h] * (1 + 0.04 * Math.sin(i * 1.7)) * 10) / 10;
    const pm10 = Math.round(pm * ratio * 10) / 10;
    const aqi = Math.min(500, Math.round(pm * 1.5));
    const vis = estimateVisibilityFromPM25(pm);

    forecast24h.push({
      time: t.toISOString(),
      pm2_5: pm,
      pm10,
      us_aqi: aqi,
      visibilityKm: vis.km,
    });
  }

  const currentPoint = forecast24h[0];
  const cat = getAQICategory(currentPoint.us_aqi);
  const vis = estimateVisibilityFromPM25(currentPoint.pm2_5);
  const outdoorVerdict = computeOutdoorVerdict(currentPoint.us_aqi, currentPoint.pm2_5, cityName);

  return {
    city: cityName,
    coordinates: { latitude: 28.6139, longitude: 77.2090 },
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
    outdoorVerdict,
  };
}
