import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJsonWithTimeout, getErrorMessage, escapeHtml } from "./http";
import { formatChatTimestamp, formatHourLabel, formatHourRange } from "./format";

describe("HTTP & formatting utilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchJsonWithTimeout returns parsed JSON on 200 OK and null on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    const okResult = await fetchJsonWithTimeout<{ ok: boolean }>("https://example.com/a", {
      headers: { "User-Agent": "Test" },
    });
    const errResult = await fetchJsonWithTimeout<{ ok: boolean }>("https://example.com/b");

    expect(okResult).toEqual({ ok: true });
    expect(errResult).toBeNull();
  });

  it("fetchJsonWithTimeout aborts slow requests on timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
      });
    });

    await expect(
      fetchJsonWithTimeout("https://example.com/slow", { timeoutMs: 15 })
    ).rejects.toThrow("Aborted");
  });

  it("getErrorMessage extracts messages from Error instances and primitive values", () => {
    expect(getErrorMessage(new Error("Boom"))).toBe("Boom");
    expect(getErrorMessage("raw string")).toBe("raw string");
    expect(getErrorMessage(42)).toBe("42");
  });

  it("escapeHtml escapes dangerous markup characters", () => {
    expect(escapeHtml(`<script>alert("xss" & '1')</script>`)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;1&#39;)&lt;/script&gt;"
    );
  });

  it("formats local hours, hour ranges, and chat timestamps consistently", () => {
    expect(formatHourLabel(new Date(2026, 10, 25, 0, 0, 0))).toBe("12 am");
    expect(formatHourLabel(new Date(2026, 10, 25, 12, 0, 0))).toBe("12 pm");
    expect(formatHourLabel(new Date(2026, 10, 25, 17, 0, 0))).toBe("5 pm");

    expect(formatHourRange(13, 2)).toBe("1 pm – 3 pm");
    expect(formatHourRange(23, 2)).toBe("11 pm – 1 am");

    const ts = formatChatTimestamp(new Date(2026, 10, 25, 9, 5, 0));
    expect(ts.length).toBeGreaterThan(2);
  });
});
