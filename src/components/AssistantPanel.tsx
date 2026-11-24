"use client";

import React from "react";
import { getAQICategory } from "@/lib/openmeteo";
import { AISmogPlan, ChatMessage, FamilyProfile, HourlyAQIPoint } from "@/types";

interface SafeWindowItem {
  idx: number;
  avgPm: number;
  aqiVal: number;
  label: string;
  day: string;
}

interface AssistantPanelProps {
  selectedCity: string;
  isDetailedPlanOpen: boolean;
  onToggleDetailedPlan: (open: boolean) => void;
  safeWindows: SafeWindowItem[];
  smogPlan: AISmogPlan | null;
  familyProfile: FamilyProfile;
  currentPoint: HourlyAQIPoint;
  messages: ChatMessage[];
  chatInput: string;
  isAskingChat: boolean;
  chatContainerRef: React.RefObject<HTMLDivElement>;
  onChatInputChange: (val: string) => void;
  onSendMessage: (text?: string) => void;
}

const QUICK_PROMPTS: ReadonlyArray<{ label: string; prompt: string }> = [
  { label: "👁️ Visibility for driving?", prompt: "How bad is the visibility for driving right now?" },
  { label: "🏃 Can I walk right now?", prompt: "Can I go for a walk or exercise right now?" },
  { label: "🧒 Is 5 pm safe for kids?", prompt: "Is 5 pm safe for kids to play outside?" },
];

/**
 * Right-hand sticky assistant panel featuring the live AI chat interface
 * and a toggleable Detailed Smog Plan overlay.
 */
export default function AssistantPanel({
  selectedCity,
  isDetailedPlanOpen,
  onToggleDetailedPlan,
  safeWindows,
  smogPlan,
  familyProfile,
  currentPoint,
  messages,
  chatInput,
  isAskingChat,
  chatContainerRef,
  onChatInputChange,
  onSendMessage,
}: AssistantPanelProps) {
  return (
    <aside className="sticky-right-panel">
      <div
        className="panel"
        style={{
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: "560px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--line)",
            paddingBottom: "12px",
            marginBottom: "12px",
          }}
        >
          <div>
            <strong style={{ fontSize: "16px", display: "block", color: "var(--ink)" }}>
              AQIfer Assistant
            </strong>
            <span style={{ fontSize: "12px", color: "var(--mute)" }}>
              {selectedCity} • Grounded in live AQI
            </span>
          </div>

          <button
            type="button"
            onClick={() => onToggleDetailedPlan(!isDetailedPlanOpen)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: "999px",
              border: "1px solid var(--line)",
              background: isDetailedPlanOpen ? "var(--ink)" : "var(--bg)",
              color: isDetailedPlanOpen ? "var(--bg)" : "var(--ink)",
              transition: "all 0.2s ease",
            }}
          >
            <span>{isDetailedPlanOpen ? "✕ Close Details" : "▾ Detailed Plan"}</span>
          </button>
        </div>

        {isDetailedPlanOpen ? (
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              paddingRight: "4px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "color-mix(in srgb, var(--tint) 12%, var(--card))",
                border: "1px solid color-mix(in srgb, var(--tint) 25%, var(--line))",
                padding: "10px 14px",
                borderRadius: "12px",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
                Detailed Smog Plan &amp; Actions
              </span>
              <button
                type="button"
                onClick={() => onToggleDetailedPlan(false)}
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "transparent",
                  border: 0,
                  color: "var(--tint)",
                  textDecoration: "underline",
                }}
              >
                Return to Chat
              </button>
            </div>

            <div>
              <h2 style={{ fontSize: "18px", marginTop: 0 }}>Safest times to go out</h2>
              {safeWindows.length > 0 ? (
                safeWindows.map((w, idx) => {
                  const windowCat = getAQICategory(w.aqiVal);
                  return (
                    <div key={idx} className="item">
                      <span
                        className="tag"
                        style={{ "--c": windowCat.color } as React.CSSProperties}
                      >
                        {windowCat.category}
                      </span>
                      <strong>
                        {w.day}, {w.label}
                      </strong>
                      <p>
                        Average AQI about {w.aqiVal}.{" "}
                        {familyProfile.members.includes("School Kids")
                          ? "Best for school runs and play."
                          : "Best for errands and exercise."}{" "}
                        Midday sun lifts the haze layer and winds disperse ground-level soot, so the
                        lowest readings usually fall in the early afternoon.
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="item">
                  <strong>Any time works</strong>
                  <p>
                    Readings stay in a comfortable range all day. Early afternoon is still the
                    cleanest stretch.
                  </p>
                </div>
              )}
            </div>

            <div>
              <h2 style={{ fontSize: "18px" }}>Inside your home</h2>
              {smogPlan && smogPlan.indoorHacks && smogPlan.indoorHacks.length > 0 ? (
                smogPlan.indoorHacks.map((hack, idx) => (
                  <div key={idx} className="item">
                    <strong>{hack.title}</strong>
                    <p>
                      {hack.action}{" "}
                      <span style={{ fontStyle: "italic", opacity: 0.9 }}>{hack.why}</span>
                    </p>
                  </div>
                ))
              ) : (
                <div className="item">
                  <strong>
                    {familyProfile.homeSetup === "Air Purifier"
                      ? "Air Purifier High-CADR Lockdown"
                      : "Strict Midday-Only Natural Ventilation"}
                  </strong>
                  <p>
                    {familyProfile.homeSetup === "Air Purifier"
                      ? "Seal window seams with draft stoppers and run HEPA purifiers on medium-high in sleeping quarters before bedtime."
                      : "Keep exterior windows shut during peak inversion hours (7 AM - 11 AM and 6 PM - 10 PM). Open cross-ventilation only between 1 PM and 3 PM."}
                  </p>
                </div>
              )}
            </div>

            <div>
              <h2 style={{ fontSize: "18px" }}>Your commute</h2>
              <div className="item">
                <strong>
                  {smogPlan?.commuteSwap?.recommendation ||
                    (familyProfile.commute === "Two-wheeler"
                      ? "Swap the bike or wear a sealed N95"
                      : "Keep vehicle windows up with AC recirculation")}
                </strong>
                <p>
                  {smogPlan?.commuteSwap?.why ||
                    "Two-wheeler and roadside commuters inhale 4x higher concentrations of fresh black carbon directly from exhaust pipes."}
                </p>
              </div>
              {familyProfile.members.includes("School Kids") && currentPoint.us_aqi >= 150 && (
                <div className="item">
                  <strong>School kids</strong>
                  <p>
                    Move outdoor games and PE indoors today. Cut outdoor play short and watch for
                    coughing.
                  </p>
                </div>
              )}
            </div>

            <div style={{ paddingTop: "8px" }}>
              <button
                type="button"
                onClick={() => onToggleDetailedPlan(false)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "12px",
                  background: "var(--ink)",
                  color: "var(--bg)",
                  fontWeight: 700,
                  fontSize: "13px",
                  border: 0,
                }}
              >
                Close &amp; Return to Chat Assistant
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  type="button"
                  onClick={() => onSendMessage(qp.prompt)}
                  style={{
                    fontSize: "12px",
                    padding: "5px 11px",
                    borderRadius: "999px",
                    border: "1px dashed var(--mute)",
                    background: "transparent",
                    color: "var(--ink)",
                  }}
                >
                  {qp.label}
                </button>
              ))}
            </div>

            <div
              ref={chatContainerRef}
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingRight: "4px",
                marginBottom: "12px",
                minHeight: "280px",
                maxHeight: "420px",
              }}
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "88%",
                      borderRadius: "14px",
                      padding: "10px 14px",
                      fontSize: "13.5px",
                      lineHeight: "1.45",
                      background: m.role === "user" ? "var(--ink)" : "var(--bg)",
                      color: m.role === "user" ? "var(--bg)" : "var(--ink)",
                      border: m.role === "user" ? "none" : "1px solid var(--line)",
                      borderLeft: m.role === "assistant" ? "4px solid var(--tint)" : undefined,
                    }}
                  >
                    <p style={{ margin: 0 }}>{m.content}</p>
                    <span
                      style={{
                        display: "block",
                        fontSize: "10px",
                        opacity: 0.6,
                        marginTop: "4px",
                        textAlign: m.role === "user" ? "right" : "left",
                      }}
                    >
                      {m.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {isAskingChat && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      borderRadius: "14px",
                      padding: "10px 14px",
                      fontSize: "12.5px",
                      background: "var(--bg)",
                      border: "1px solid var(--line)",
                      color: "var(--mute)",
                      borderLeft: "4px solid var(--tint)",
                    }}
                  >
                    Thinking with live forecast data...
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSendMessage();
              }}
              style={{ display: "flex", gap: "8px", marginTop: "auto" }}
            >
              <input
                type="text"
                placeholder={`Ask AQIfer anything about ${selectedCity}...`}
                value={chatInput}
                onChange={(e) => onChatInputChange(e.target.value)}
                disabled={isAskingChat}
                style={{
                  flex: 1,
                  font: "inherit",
                  fontSize: "13px",
                  padding: "10px 14px",
                  border: "1px solid var(--line)",
                  borderRadius: "12px",
                  background: "var(--card)",
                  color: "var(--ink)",
                }}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isAskingChat}
                style={{
                  padding: "10px 18px",
                  borderRadius: "12px",
                  background: "var(--ink)",
                  color: "var(--bg)",
                  border: "1px solid var(--ink)",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                  opacity: !chatInput.trim() || isAskingChat ? 0.5 : 1,
                }}
              >
                {isAskingChat ? "..." : "Send"}
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}
