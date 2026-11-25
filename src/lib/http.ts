const DEFAULT_TIMEOUT_MS = 5000;

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
