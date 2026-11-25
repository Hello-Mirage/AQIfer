// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./globals.css", () => ({}));

import RootLayout, { metadata } from "./layout";

describe("RootLayout and page metadata", () => {
  it("exports AQIfer SEO metadata and renders accessible root html structure", () => {
    expect(metadata.title).toBe("AQIfer – Smog and outdoor safety");
    expect(String(metadata.description)).toContain("PM2.5");

    const html = renderToStaticMarkup(
      <RootLayout>
        <main>AQIfer Child</main>
      </RootLayout>
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain("AQIfer Child");
  });
});
