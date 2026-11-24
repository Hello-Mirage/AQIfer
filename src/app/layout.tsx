import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AQIfer – Smog and outdoor safety",
  description: "Live air quality, PM2.5 forecasts, and outdoor safety guidance for families navigating winter smog.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
