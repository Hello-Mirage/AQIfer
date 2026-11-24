"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, Sparkles, Loader2, Bot, User, Eye, ShieldAlert } from "lucide-react";
import { ChatMessage, FamilyProfile, HourlyAQIPoint, CurrentAQI } from "@/types";

interface Props {
  city: string;
  current: CurrentAQI | null;
  forecast24h: HourlyAQIPoint[];
  familyProfile: FamilyProfile;
  externalPrompt?: string | null;
  onClearExternalPrompt?: () => void;
}

const SUGGESTED_QUERIES = [
  "Can I go outside right now?",
  "What is the visibility for driving right now?",
  "Is it safe for children to play outside at 5 PM?",
  "Should I open windows to ventilate this afternoon?",
];

export function ChatBar({
  city,
  current,
  forecast24h,
  familyProfile,
  externalPrompt,
  onClearExternalPrompt,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const handleSend = async (queryText?: string) => {
    const text = queryText || input;
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text.trim(),
          city,
          current,
          forecast24h,
          familyProfile,
        }),
      });

      const data = await res.json();
      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        role: "assistant",
        content: data.answer || "Unable to answer right now.",
        timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error("Chat error:", err);
      const errorMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        role: "assistant",
        content: "We encountered a temporary network issue. Please check the Outdoor Safety Verdict above.",
        timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // If an external prompt is passed from the Verdict Hero, trigger it immediately
  useEffect(() => {
    if (externalPrompt && externalPrompt.trim()) {
      handleSend(externalPrompt);
      if (onClearExternalPrompt) onClearExternalPrompt();
    }
  }, [externalPrompt]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 backdrop-blur-md">
      {/* Title */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-bold text-white tracking-tight">
            Ask AQIfer Assistant ({city})
          </h3>
        </div>
        <span className="text-xs text-slate-400 font-medium">Grounded in Live AQI & Visibility</span>
      </div>

      {/* Suggested Questions */}
      {messages.length === 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Suggested Family & Outdoor Safety Inquiries:
          </span>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q)}
                className="text-xs bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-slate-800 transition-colors flex items-center gap-2 text-left"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation History */}
      {messages.length > 0 && (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" && (
                <div className="w-7 h-7 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/20"
                    : "bg-slate-950/80 border border-slate-800 text-slate-200"
                }`}
              >
                <p>{m.content}</p>
                <span
                  className={`text-[9px] mt-1.5 block ${
                    m.role === "user" ? "text-indigo-200 text-right" : "text-slate-500"
                  }`}
                >
                  {m.timestamp}
                </span>
              </div>
              {m.role === "user" && (
                <div className="w-7 h-7 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-400 pl-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Checking live smog, visibility, and 24h curve for {city}...</span>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>
      )}

      {/* Input Field */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center gap-2 pt-1"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about outdoor safety or visibility in ${city} (e.g., "Can I drive in this smog?")...`}
          className="flex-1 px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-inner"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/30 shrink-0"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span>Ask</span>
        </button>
      </form>
    </div>
  );
}
