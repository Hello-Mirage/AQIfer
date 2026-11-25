"use client";

import React from "react";
import { CityLocation } from "@/types";

const POPULAR_CITY_OPTIONS = [
  "Kozhikode",
  "Chennai",
  "Hyderabad",
  "Patna",
  "Lucknow",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "London",
  "Tokyo",
  "New York",
] as const;

interface CitySearchHeaderProps {
  cityList: CityLocation[];
  selectedCity: string;
  citySearchInput: string;
  isSearchingCity: boolean;
  searchError: string | null;
  onSearchInputChange: (value: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onSelectLocation: (location: CityLocation) => void;
}

/**
 * Top navigation header displaying the AQIfer brand mark, global city autocomplete search,
 * and quick-select Indian smog hotspot chips.
 */
export default function CitySearchHeader({
  cityList,
  selectedCity,
  citySearchInput,
  isSearchingCity,
  searchError,
  onSearchInputChange,
  onSearchSubmit,
  onSelectLocation,
}: CitySearchHeaderProps) {
  return (
    <>
      <header className="top">
        <div className="brand">
          AQIfer<small>Smog and outdoor safety</small>
        </div>
        <form className="custom" onSubmit={onSearchSubmit}>
          <span>Search or select city</span>
          <input
            id="cityInput"
            type="text"
            list="popular-cities"
            placeholder="e.g. Kozhikode, Haldia..."
            value={citySearchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            aria-label="City search"
          />
          <datalist id="popular-cities">
            {cityList.map((c) => (
              <option key={c.name} value={c.name}>
                {c.admin1 ? `${c.admin1}, ` : ""}
                {c.country || "India"}
              </option>
            ))}
            {POPULAR_CITY_OPTIONS.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
          <button className="chip" id="cuGo" type="submit" disabled={isSearchingCity}>
            {isSearchingCity ? "Searching..." : "Check"}
          </button>
          {searchError && <span className="search-error">{searchError}</span>}
        </form>
      </header>

      <div className="chips" role="group" aria-label="City">
        {cityList.map((c) => (
          <button
            key={c.name}
            className="chip"
            type="button"
            aria-pressed={selectedCity.toLowerCase() === c.name.toLowerCase()}
            onClick={() => onSelectLocation(c)}
          >
            {c.name}
          </button>
        ))}
      </div>
    </>
  );
}
