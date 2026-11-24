"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { CityLocation } from "@/types";
import { INDIAN_PRESET_CITIES } from "@/lib/openmeteo";

interface Props {
  selectedCity: CityLocation;
  onSelectCity: (city: CityLocation) => void;
}

export function CitySelector({ selectedCity, onSelectCity }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setIsOpen(true);
        }
      } catch (err) {
        console.error("Geocoding failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="w-full space-y-3">
      {/* Preset Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1">
          Indian Hotspots:
        </span>
        {INDIAN_PRESET_CITIES.map((city) => {
          const isSelected = selectedCity.name.toLowerCase() === city.name.toLowerCase();
          return (
            <button
              key={city.name}
              type="button"
              onClick={() => onSelectCity(city)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                isSelected
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400 border border-transparent"
                  : "bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800"
              }`}
            >
              {city.name}
            </button>
          );
        })}
      </div>

      {/* Global Search Bar */}
      <div ref={wrapperRef} className="relative w-full">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
            placeholder="Search any global city or town (e.g. Gurugram, Lahore, Patna, London)..."
            className="w-full pl-10 pr-10 py-3 bg-slate-900/90 border border-slate-800 rounded-2xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-inner"
          />
          {isSearching && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {isOpen && results.length > 0 && (
          <div className="absolute z-30 left-0 right-0 mt-1.5 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden divide-y divide-slate-800/80 backdrop-blur-xl">
            {results.map((item, idx) => (
              <button
                key={`${item.name}-${item.latitude}-${idx}`}
                type="button"
                onClick={() => {
                  onSelectCity(item);
                  setQuery("");
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-slate-800/80 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="font-semibold text-slate-100">{item.name}</span>
                  {item.admin1 && (
                    <span className="text-xs text-slate-400">({item.admin1})</span>
                  )}
                </div>
                <span className="text-xs font-medium text-slate-500">{item.country}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
