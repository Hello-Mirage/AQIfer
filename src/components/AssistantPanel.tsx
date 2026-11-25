"use client";

import React from "react";
import DetailedSmogPlanView from "@/components/DetailedSmogPlanView";
import { AISmogPlan, ChatMessage, FamilyProfile, HourlyAQIPoint, SafeWindowSummary } from "@/types";

interface AssistantPanelProps {
  selectedCity: string;
  isDetailedPlanOpen: boolean;
  onToggleDetailedPlan: (open: boolean) => void;
  safeWindows: SafeWindowSummary[];
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
 * and a toggleable Detailed Smog Plan view.
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
      <div className="panel assistant-panel-card">
        <div className="assistant-header">
          <div>
            <strong className="assistant-title">AQIfer Assistant</strong>
            <span className="assistant-subtitle">{selectedCity} • Grounded in live AQI</span>
          </div>

          <button
            type="button"
            aria-expanded={isDetailedPlanOpen}
            className={`assistant-toggle-btn${isDetailedPlanOpen ? " active" : ""}`}
            onClick={() => onToggleDetailedPlan(!isDetailedPlanOpen)}
          >
            <span>{isDetailedPlanOpen ? "✕ Close Details" : "▾ Detailed Plan"}</span>
          </button>
        </div>

        {isDetailedPlanOpen ? (
          <DetailedSmogPlanView
            safeWindows={safeWindows}
            smogPlan={smogPlan}
            familyProfile={familyProfile}
            currentPoint={currentPoint}
            onClose={() => onToggleDetailedPlan(false)}
          />
        ) : (
          <div className="chat-view">
            <div className="quick-prompts-row" role="group" aria-label="Quick safety questions">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  type="button"
                  className="quick-prompt-btn"
                  onClick={() => onSendMessage(qp.prompt)}
                >
                  {qp.label}
                </button>
              ))}
            </div>

            <div
              ref={chatContainerRef}
              className="chat-messages-scroll"
              role="log"
              aria-live="polite"
              aria-label="Conversation messages"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`chat-bubble-row${m.role === "user" ? " user" : ""}`}
                >
                  <div className={`chat-bubble${m.role === "user" ? " user" : ""}`}>
                    <p>{m.content}</p>
                    <span className="chat-timestamp">{m.timestamp}</span>
                  </div>
                </div>
              ))}

              {isAskingChat && (
                <div className="chat-bubble-row">
                  <div className="chat-loading-bubble">Thinking with live forecast data...</div>
                </div>
              )}
            </div>

            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                onSendMessage();
              }}
            >
              <input
                type="text"
                aria-label={`Ask AQIfer about ${selectedCity}`}
                placeholder={`Ask AQIfer anything about ${selectedCity}...`}
                value={chatInput}
                onChange={(e) => onChatInputChange(e.target.value)}
                disabled={isAskingChat}
              />
              <button type="submit" disabled={!chatInput.trim() || isAskingChat}>
                {isAskingChat ? "..." : "Send"}
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}
