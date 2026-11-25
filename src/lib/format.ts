import { FamilyProfile } from "@/types";

/** Shared default household profile applied when none is provided by the client. */
export const DEFAULT_FAMILY_PROFILE: FamilyProfile = {
  members: [],
  commute: "Two-wheeler",
  homeSetup: "Natural Ventilation",
};

/**
 * Format an ISO timestamp or Date instance into a compact 12-hour hour label (e.g. `"5 pm"`).
 */
export function formatHourLabel(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const hour24 = date.getHours();
  return `${hour24 % 12 || 12} ${hour24 < 12 ? "am" : "pm"}`;
}

/**
 * Format a numeric 24-hour start hour and span into a compact range label (e.g. `"1 pm – 3 pm"`).
 */
export function formatHourRange(startHour: number, spanHours = 2): string {
  const normalizedStart = ((startHour % 24) + 24) % 24;
  const normalizedEnd = (normalizedStart + spanHours) % 24;
  const startLabel = `${normalizedStart % 12 || 12} ${normalizedStart < 12 ? "am" : "pm"}`;
  const endLabel = `${normalizedEnd % 12 || 12} ${normalizedEnd < 12 ? "am" : "pm"}`;
  return `${startLabel} – ${endLabel}`;
}

/**
 * Format a Date instance into a short localized timestamp for chat bubbles.
 */
export function formatChatTimestamp(date: Date = new Date()): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
