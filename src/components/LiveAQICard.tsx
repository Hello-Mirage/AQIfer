"use client";

import React from "react";
import { AlertTriangle, Clock, Eye, Wind } from "lucide-react";
import { ParsedAQIData } from "@/types";

interface Props {
  data: ParsedAQIData | null;
  loading: boolean;
}

export function LiveAQICard({ data, loading }: Props) {
  if (loading || !data) {
    return (
      <div className="w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl animate-pulse space-y-4">
        <div className="h-6 w-48 bg-slate-800 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="h-24 bg-slate-800/60 rounded-xl" />
          <div className="h-24 bg-slate-800/60 rounded-xl" />
          <div className="h-24 bg-slate-800/60 rounded-xl" />
          <div className="h-24 bg-slate-800/60 rounded-xl" />
        </div>
        <div className="h-20 bg-slate-800/60 rounded-xl" />
      </div>
    );
  }

  const { current, forecast24h, city } = data;

  const getBadgeStyle = (category: string) => {
    switch (category) {
      case "Good":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      case "Moderate":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "Unhealthy for Sensitive Groups":
        return "bg-orange-500/20 text-orange-300 border-orange-500/30";
      case "Unhealthy":
        return "bg-rose-500/20 text-rose-300 border-rose-500/30";
      case "Very Unhealthy":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      default:
        return "bg-red-950/80 text-red-200 border-red-800";
    }
  };

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-white tracking-tight">{city}</h3>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full font-semibold border border-slate-700">
              Live Sensor Feed
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Updated: {new Date(current.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
          </p>
        </div>

        <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 w-fit ${getBadgeStyle(current.category)}`}>
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{current.category}</span>
        </div>
      </div>

      {/* 4 Core Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* US AQI */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-center">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            US AQI Index
          </span>
          <div className="text-3xl font-black text-white mt-1">
            {current.us_aqi}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">EPA Standard</span>
        </div>

        {/* PM2.5 */}
        <div className="bg-rose-950/20 border border-rose-900/30 rounded-2xl p-4 text-center">
          <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block">
            PM2.5 (Fine Soot)
          </span>
          <div className="text-3xl font-black text-rose-200 mt-1">
            {current.pm2_5}
            <span className="text-xs font-normal text-rose-400 ml-1">µg/m³</span>
          </div>
          <span className="text-[10px] text-rose-400/80 font-medium">
            {current.pm2_5 > 60 ? "Deep Lung Hazard" : "Acceptable"}
          </span>
        </div>

        {/* PM10 */}
        <div className="bg-amber-950/20 border border-amber-900/30 rounded-2xl p-4 text-center">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
            PM10 (Dust/Ash)
          </span>
          <div className="text-3xl font-black text-amber-200 mt-1">
            {current.pm10}
            <span className="text-xs font-normal text-amber-400 ml-1">µg/m³</span>
          </div>
          <span className="text-[10px] text-amber-400/80 font-medium">Throat & Nasal</span>
        </div>

        {/* Visibility */}
        <div className="bg-cyan-950/20 border border-cyan-900/30 rounded-2xl p-4 text-center">
          <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider block">
            Visibility
          </span>
          <div className="text-3xl font-black text-cyan-200 mt-1">
            {current.visibilityKm}
            <span className="text-xs font-normal text-cyan-400 ml-1">km</span>
          </div>
          <span className="text-[10px] text-cyan-400/80 font-medium truncate block">
            {current.visibilityCondition.split(" ")[0]} Haze
          </span>
        </div>
      </div>

      {/* 24-Hour Hourly Timeline */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-400" /> Next 24-Hour Smog & Particulate Curve
          </span>
          <span className="text-[11px] text-slate-500 font-normal">Horizontal scroll →</span>
        </div>

        <div className="overflow-x-auto pb-2 scrollbar-thin">
          <div className="flex gap-2 min-w-max">
            {forecast24h.map((point, index) => {
              const hourDate = new Date(point.time);
              const hourLabel = hourDate.toLocaleTimeString([], { hour: "numeric", hour12: true });
              const isPeak = point.pm2_5 > 180;
              const isLow = point.pm2_5 < 90;

              return (
                <div
                  key={`${point.time}-${index}`}
                  className={`flex flex-col items-center justify-between p-2.5 rounded-xl text-center min-w-[72px] border transition-all ${
                    isLow
                      ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-200"
                      : isPeak
                      ? "bg-rose-950/30 border-rose-500/30 text-rose-200"
                      : "bg-slate-950/60 border-slate-800 text-slate-300"
                  }`}
                >
                  <span className="text-[10px] text-slate-400 font-medium">{hourLabel}</span>
                  <div className="my-1.5">
                    <span className={`text-xs font-black ${isLow ? "text-emerald-400" : isPeak ? "text-rose-400" : "text-white"}`}>
                      {point.pm2_5}
                    </span>
                    <span className="text-[9px] text-slate-500 block">µg/m³</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    AQI {point.us_aqi}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
