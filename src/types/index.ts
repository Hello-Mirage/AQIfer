export interface CityLocation {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export interface HourlyAQIPoint {
  time: string; // ISO string
  pm2_5: number;
  pm10: number;
  us_aqi: number;
  visibilityKm?: number;
}

export interface CurrentAQI {
  pm2_5: number;
  pm10: number;
  us_aqi: number;
  time: string;
  category: AQICategory;
  color: string;
  visibilityKm: number;
  visibilityCondition: string; // e.g. "Severe Smog Haze (< 1.5 km)"
}

export type AQICategory = 
  | "Good"
  | "Moderate"
  | "Unhealthy for Sensitive Groups"
  | "Unhealthy"
  | "Very Unhealthy"
  | "Hazardous";

export interface OutdoorVerdict {
  status: "SAFE" | "CAUTION" | "HAZARDOUS" | "STAY_INDOORS";
  headline: string;
  badgeLabel: string;
  badgeColor: string;
  summary: string;
  safeWindowPrompt: string;
  recommendation: string;
}

export interface ParsedAQIData {
  city: string;
  coordinates: { latitude: number; longitude: number };
  current: CurrentAQI;
  forecast24h: HourlyAQIPoint[];
  outdoorVerdict: OutdoorVerdict;
}

export interface FamilyProfile {
  members: string[]; // e.g. "Infants", "School Kids", "Elderly", "Asthma/Respiratory"
  commute: "Two-wheeler" | "Public Transit" | "Car" | "Walk/Cycle";
  homeSetup: "Air Purifier" | "Natural Ventilation";
}

export interface SafeWindow {
  timeWindow: string; // e.g. "12:00 PM - 03:00 PM"
  pm25Level: number;
  riskLevel: "Low" | "Moderate" | "High" | "Severe";
  bestFor: string;
  why: string;
}

export interface IndoorHack {
  title: string;
  action: string;
  why: string;
}

export interface CommuteSwap {
  recommendation: string;
  why: string;
}

export interface AISmogPlan {
  headlineSummary: string;
  safeWindows: SafeWindow[];
  indoorHacks: IndoorHack[];
  commuteSwap: CommuteSwap;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}
