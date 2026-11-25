import { DEFAULT_FAMILY_PROFILE } from "@/lib/format";
import { FamilyProfile } from "@/types";

const DEFAULT_TIMEOUT_MS = 5000;
const VALID_COMMUTES = new Set<FamilyProfile["commute"]>([
  "Two-wheeler",
  "Public Transit",
  "Car",
  "Walk/Cycle",
]);
const VALID_HOME_SETUPS = new Set<FamilyProfile["homeSetup"]>([
  "Air Purifier",
  "Natural Ventilation",
]);

export interface FetchJsonOptions {
  timeoutMs?: number;
  headers?: HeadersInit;
}

/**
 * Fetch and parse JSON from an upstream endpoint with an explicit AbortController timeout.
 * Always clears the timer in `finally` to avoid leaking timers on Edge runtimes.
 */
export async function fetchJsonWithTimeout<T>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T | null> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...(headers ? { headers } : {}),
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract a readable message string from an unknown thrown value.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Escape HTML-sensitive characters before interpolating untrusted strings into map popups/tooltips.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Parse and validate `lat` and `lon` query parameters against geographic bounds.
 * Returns `null` when an explicit parameter is non-numeric or outside valid range.
 */
export function parseCoordinates(
  searchParams: URLSearchParams,
  defaultLat: number,
  defaultLon: number
): { latitude: number; longitude: number } | null {
  const latStr = searchParams.get("lat");
  const lonStr = searchParams.get("lon");

  const latitude = latStr !== null && latStr.trim() !== "" ? Number(latStr) : defaultLat;
  const longitude = lonStr !== null && lonStr.trim() !== "" ? Number(lonStr) : defaultLon;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

/**
 * Safely normalize an untrusted household profile payload into valid domain values.
 */
export function normalizeFamilyProfile(raw: unknown): FamilyProfile {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_FAMILY_PROFILE;
  }

  const candidate = raw as Partial<FamilyProfile>;
  const members = Array.isArray(candidate.members)
    ? candidate.members.filter((m): m is string => typeof m === "string").slice(0, 10)
    : DEFAULT_FAMILY_PROFILE.members;

  const commute =
    typeof candidate.commute === "string" &&
    VALID_COMMUTES.has(candidate.commute as FamilyProfile["commute"])
      ? (candidate.commute as FamilyProfile["commute"])
      : DEFAULT_FAMILY_PROFILE.commute;

  const homeSetup =
    typeof candidate.homeSetup === "string" &&
    VALID_HOME_SETUPS.has(candidate.homeSetup as FamilyProfile["homeSetup"])
      ? (candidate.homeSetup as FamilyProfile["homeSetup"])
      : DEFAULT_FAMILY_PROFILE.homeSetup;

  return { members, commute, homeSetup };
}
