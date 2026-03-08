"use client";

import Image from "next/image";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useTextToSpeech } from "@/lib/useTextToSpeech";
import { useSpeechToText } from "@/lib/useSpeechToText";
import { useGeminiAgent, GeminiIntent } from "@/lib/useGeminiAgent";

// ─── Types ───────────────────────────────────────────────────────────────────

type KioskState =
  | "greeting"
  | "ask_party_size"
  | "ask_reservation"
  | "collect_reservation_email"
  | "collect_email"
  | "confirm_email"
  | "routing";

type UIState = "idle" | "speaking" | "listening" | "thinking" | "error";

interface ChatMessage {
  role: "ai" | "guest";
  text: string;
  displayedText: string;
  isComplete: boolean;
  isInterim?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

const DEFAULT_PARTY_SIZE = 2;
const VISION_SERVER = process.env.NEXT_PUBLIC_VISION_SERVER ?? "http://localhost:8000";
const DETECTION_WINDOW = 5; // readings before we consider the count stable
const DETECTION_INTERVAL_MS = 300;
const DETECTION_TIMEOUT_MS = 4000; // fall back after this if no stable reading

export default function WelcomePage() {
  // Core state
  const [kioskState, setKioskState] = useState<KioskState>("greeting");
  const [uiState, setUIState] = useState<UIState>("idle");
  const [partySize, setPartySize] = useState<number>(DEFAULT_PARTY_SIZE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showFallbackChips, setShowFallbackChips] = useState(false);
  const [collectedEmail, setCollectedEmail] = useState<string>("");

  // Refs for breaking circular callback dependencies
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);
  const processingRef = useRef(false);
  const startListeningRef = useRef<() => void>(() => {});
  const handleGeminiResponseRef = useRef<
    (intent: GeminiIntent, reply: string, partySize: number | null, email: string | null) => void
  >(() => {});

  // Party-size detection refs
  const detectionVideoRef = useRef<HTMLVideoElement>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectionStreamRef = useRef<MediaStream | null>(null);
  const detectionReadingsRef = useRef<number[]>([]);
  const detectionReadyRef = useRef(false);

  // Pre-computed bar heights to avoid Math.random in render
  const barHeights = useMemo(() => [18, 24, 14, 20, 16], []);

  // Hooks
  const { speak, stop: stopSpeech, isSpeaking } = useTextToSpeech({
    rate: 0.8,
    pitch: 0.9,
    volume: 1,
  });

  const { sendMessage, resetHistory } = useGeminiAgent();

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const addAIMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { role: "ai", text, displayedText: "", isComplete: false },
    ]);
  }, []);

  // ─── Speech-to-text setup ────────────────────────────────────────────────

  const handleSpeechResult = useCallback(
    async (finalTranscript: string) => {
      if (processingRef.current) return;
      processingRef.current = true;

      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.isInterim);
        return [
          ...filtered,
          {
            role: "guest" as const,
            text: finalTranscript,
            displayedText: finalTranscript,
            isComplete: true,
          },
        ];
      });

      setUIState("thinking");

      try {
        const response = await sendMessage(finalTranscript, {
          detectedPartySize: partySize,
          currentState: kioskState as "greeting" | "ask_party_size" | "ask_reservation" | "collect_reservation_email" | "collect_email" | "confirm_email",
          collectedEmail: collectedEmail || undefined,
        });
        handleGeminiResponseRef.current(response.intent, response.reply, response.partySize, response.email);
      } catch {
        setUIState("error");
        setTimeout(() => {
          processingRef.current = false;
          startListeningRef.current();
        }, 2000);
      }
    },
    [partySize, kioskState, collectedEmail, sendMessage]
  );

  const {
    start: startSTT,
    transcript: liveTranscript,
    isListening,
    isSupported: sttSupported,
  } = useSpeechToText({
    onResult: handleSpeechResult,
  });

  const startListening = useCallback(() => {
    setUIState("listening");
    setShowFallbackChips(false);
    startSTT();
  }, [startSTT]);

  // Keep ref in sync
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const speakAndListen = useCallback(
    (text: string) => {
      setUIState("speaking");
      speak(text, () => {
        setTimeout(() => {
          startListeningRef.current();
        }, 400);
      });
    },
    [speak]
  );

  // Show live interim transcript as a guest bubble
  useEffect(() => {
    if (liveTranscript && isListening) {
      setUIState("listening");
      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.isInterim);
        return [
          ...filtered,
          {
            role: "guest",
            text: liveTranscript,
            displayedText: liveTranscript,
            isComplete: false,
            isInterim: true,
          },
        ];
      });
    }
  }, [liveTranscript, isListening]);

  // ─── Reset and restart for next guest ────────────────────────────────────

  const resetAndGreet = useCallback(() => {
    resetHistory();
    processingRef.current = false;
    setPartySize(DEFAULT_PARTY_SIZE);
    setCollectedEmail("");
    setKioskState("greeting");
    setShowFallbackChips(false);
    const greeting = `Welcome! We detected a party of ${DEFAULT_PARTY_SIZE}. Is that correct?`;
    setMessages([{ role: "ai", text: greeting, displayedText: "", isComplete: false }]);
    speakAndListen(greeting);
  }, [resetHistory, speakAndListen]);

  // ─── Gemini response handler ─────────────────────────────────────────────

  const handleGeminiResponse = useCallback(
    (intent: GeminiIntent, reply: string, newPartySize: number | null, newEmail: string | null) => {
      processingRef.current = false;

      if (intent === "unclear") {
        setUnclearCount((prev) => {
          const next = prev + 1;
          if (next >= 2) {
            setShowFallbackChips(true);
          }
          return next;
        });
        addAIMessage(reply);
        speakAndListen(reply);
        return;
      }

      setUnclearCount(0);
      setShowFallbackChips(false);

      switch (kioskState) {
        case "greeting":
          if (intent === "confirm_party_size") {
            setKioskState("ask_reservation");
            addAIMessage(reply);
            speakAndListen(reply);
          } else if (intent === "deny_party_size") {
            setKioskState("ask_party_size");
            addAIMessage(reply);
            speakAndListen(reply);
          }
          break;

        case "ask_party_size":
          if (intent === "provide_party_size" && newPartySize) {
            setPartySize(newPartySize);
            setKioskState("ask_reservation");
            addAIMessage(reply);
            speakAndListen(reply);
          }
          break;

        case "ask_reservation":
          if (intent === "has_reservation") {
            // Ask for email to look up reservation
            setKioskState("collect_reservation_email");
            addAIMessage(reply);
            speakAndListen(reply);
          } else if (intent === "no_reservation") {
            // Look up live table availability from the floor camera zones
            void (async () => {
              try {
                const res = await fetch("/api/cameras/CAM-FLOOR/table-zones", { cache: "no-store" });
                const data = res.ok ? (await res.json() as { zones?: { name: string; capacity: number; status: string }[] }) : {};
                const zones = data.zones ?? [];
                const freeTable = zones.find((z) => z.status === "free" && z.capacity >= partySize);

                if (freeTable) {
                  setKioskState("routing");
                  const tableMsg = `Great news! ${freeTable.name} is ready for your party of ${partySize}. Please proceed to your table — a team member will be with you shortly.`;
                  addAIMessage(tableMsg);
                  setUIState("speaking");
                  speak(tableMsg, () => {
                    setTimeout(() => resetAndGreet(), 10000);
                  });
                } else {
                  setKioskState("collect_email");
                  const fullMsg = "It looks like all tables are currently full. Please say your email address and we'll notify you when a table is ready.";
                  addAIMessage(fullMsg);
                  speakAndListen(fullMsg);
                }
              } catch {
                // API unreachable — assume full, collect email
                setKioskState("collect_email");
                const fullMsg = "It looks like all tables are currently full. Please say your email address and we'll notify you when a table is ready.";
                addAIMessage(fullMsg);
                speakAndListen(fullMsg);
              }
            })();
          }
          break;

        case "collect_reservation_email":
          if (intent === "provide_email" && newEmail) {
            // TBD: real reservation lookup — for now always confirm
            setKioskState("routing");
            const confirmedMsg = `Got it — ${newEmail}. Your reservation has been confirmed! Please proceed to your table — a team member will be with you shortly.`;
            addAIMessage(confirmedMsg);
            setUIState("speaking");
            speak(confirmedMsg, () => {
              setTimeout(() => resetAndGreet(), 10000);
            });
          }
          break;

        case "collect_email":
          if (intent === "provide_email" && newEmail) {
            setCollectedEmail(newEmail);
            setKioskState("confirm_email");
            addAIMessage(reply);
            speakAndListen(reply);
          }
          break;

        case "confirm_email":
          if (intent === "email_confirmed") {
            // Submit to waitlist API, then speak personalised confirmation
            void (async () => {
              let waitMsg = reply;
              try {
                const res = await fetch("/api/waitlist", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: collectedEmail, partySize }),
                });
                if (res.ok) {
                  const data = await res.json() as { estimatedWait?: number; position?: number };
                  if (data.estimatedWait) {
                    waitMsg = `You're on the list! We've sent a confirmation to ${collectedEmail}. Your estimated wait is around ${data.estimatedWait} minutes. We'll email you the moment a table is ready.`;
                  }
                }
              } catch {
                // non-critical — proceed with Gemini's default reply
              }
              addAIMessage(waitMsg);
              setUIState("speaking");
              speak(waitMsg, () => {
                setTimeout(() => resetAndGreet(), 10000);
              });
            })();
          } else if (intent === "email_denied") {
            setKioskState("collect_email");
            setCollectedEmail("");
            addAIMessage(reply);
            speakAndListen(reply);
          }
          break;
      }
    },
    [kioskState, partySize, addAIMessage, speakAndListen, speak, resetAndGreet]
  );

  // Keep ref in sync
  useEffect(() => {
    handleGeminiResponseRef.current = handleGeminiResponse;
  }, [handleGeminiResponse]);

  // Unclear count tracked via a simple setter (value only used inside setUnclearCount callback)
  const [, setUnclearCount] = useState(0);

  // ─── Typing animation for AI messages ────────────────────────────────────

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "ai" || lastMsg.isComplete) return;

    const timeout = setTimeout(() => {
      setMessages((prev) => {
        const updated = [...prev];
        const msg = { ...updated[updated.length - 1] };
        const nextChar = msg.text[msg.displayedText.length];
        msg.displayedText += nextChar;
        if (msg.displayedText.length === msg.text.length) {
          msg.isComplete = true;
        }
        updated[updated.length - 1] = msg;
        return updated;
      });
    }, 30);

    return () => clearTimeout(timeout);
  }, [messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ─── Party-size detection ─────────────────────────────────────────────────

  // Runs once on mount: starts camera, polls vision server, fires greeting when
  // a stable reading is available (or falls back after DETECTION_TIMEOUT_MS).
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const video = detectionVideoRef.current;
    const canvas = detectionCanvasRef.current;

    function fireGreeting(count: number) {
      if (detectionReadyRef.current) return; // already fired
      detectionReadyRef.current = true;

      // Stop camera — no longer needed
      detectionStreamRef.current?.getTracks().forEach((t) => t.stop());
      detectionStreamRef.current = null;

      const detected = count > 0 ? count : null;
      if (detected) {
        setPartySize(detected);
        const greeting = `Welcome! We detected a party of ${detected}. Is that correct?`;
        addAIMessage(greeting);
        speakAndListen(greeting);
      } else {
        // Vision server unreachable or returned 0 — ask directly
        setKioskState("ask_party_size");
        const greeting = "Welcome! How many guests are in your party?";
        addAIMessage(greeting);
        speakAndListen(greeting);
      }
    }

    // Hard timeout — greet regardless after DETECTION_TIMEOUT_MS
    const timeout = setTimeout(() => {
      const readings = detectionReadingsRef.current;
      const fallback =
        readings.length > 0
          ? readings.sort((a, b) => a - b)[Math.floor(readings.length / 2)]
          : 0;
      fireGreeting(fallback);
    }, DETECTION_TIMEOUT_MS);

    async function startDetection() {
      if (!video || !canvas) {
        clearTimeout(timeout);
        fireGreeting(0);
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        detectionStreamRef.current = stream;
        video.srcObject = stream;
        await video.play();
      } catch {
        // Camera not available — fall back immediately
        clearTimeout(timeout);
        fireGreeting(0);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        clearTimeout(timeout);
        fireGreeting(0);
        return;
      }

      const interval = setInterval(async () => {
        if (detectionReadyRef.current) {
          clearInterval(interval);
          return;
        }
        if (video.readyState < 2) return;

        canvas.width = 288;
        canvas.height = Math.round((video.videoHeight / video.videoWidth) * 288) || 162;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];

        try {
          const res = await fetch(`${VISION_SERVER}/detect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image, include_annotated: false, include_tracking: false, imgsz: 224 }),
          });
          if (!res.ok) return;
          const data = (await res.json()) as { count?: number };
          const count = typeof data.count === "number" ? data.count : 0;

          detectionReadingsRef.current.push(count);
          if (detectionReadingsRef.current.length > DETECTION_WINDOW) {
            detectionReadingsRef.current.shift();
          }

          // Stable once window is full and all readings agree within ±1
          const readings = detectionReadingsRef.current;
          if (readings.length >= DETECTION_WINDOW) {
            const sorted = [...readings].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            const allClose = sorted.every((v) => Math.abs(v - median) <= 1);
            if (allClose) {
              clearInterval(interval);
              clearTimeout(timeout);
              fireGreeting(median);
            }
          }
        } catch {
          // Vision server not reachable — timeout will handle fallback
        }
      }, DETECTION_INTERVAL_MS);
    }

    startDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Fallback chip handlers ──────────────────────────────────────────────

  const handleFallbackChip = useCallback(
    async (chipText: string) => {
      setShowFallbackChips(false);
      setUnclearCount(0);

      setMessages((prev) => [
        ...prev,
        {
          role: "guest",
          text: chipText,
          displayedText: chipText,
          isComplete: true,
        },
      ]);

      setUIState("thinking");

      try {
        const response = await sendMessage(chipText, {
          detectedPartySize: partySize,
          currentState: kioskState as "greeting" | "ask_party_size" | "ask_reservation" | "collect_reservation_email" | "collect_email" | "confirm_email",
          collectedEmail: collectedEmail || undefined,
        });
        handleGeminiResponseRef.current(response.intent, response.reply, response.partySize, response.email);
      } catch {
        setUIState("error");
        setTimeout(() => startListeningRef.current(), 2000);
      }
    },
    [sendMessage, partySize, kioskState, collectedEmail]
  );

  const fallbackChips = useMemo(() => {
    switch (kioskState) {
      case "greeting":
        return ["Yes, that's correct", "No, that's wrong"];
      case "ask_party_size":
        return ["2", "3", "4", "5", "6"];
      case "ask_reservation":
        return ["Yes, I have a reservation", "No reservation"];
      case "confirm_email":
        return ["Yes, that's correct", "No, try again"];
      default:
        return [];
    }
  }, [kioskState]);

  // ─── Mic tap to interrupt and re-listen ──────────────────────────────────

  const handleMicTap = useCallback(() => {
    if (isSpeaking()) {
      stopSpeech();
    }
    startListeningRef.current();
  }, [isSpeaking, stopSpeech]);

  // Fallback: no speech recognition support → always show chips
  useEffect(() => {
    if (!sttSupported) {
      setShowFallbackChips(true);
    }
  }, [sttSupported]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-zinc-50 to-zinc-100 font-sans antialiased text-black">
      {/* Hidden detection camera — used only for party-size inference on mount */}
      <video ref={detectionVideoRef} muted playsInline className="hidden" />
      <canvas ref={detectionCanvasRef} className="hidden" />
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-2">
        <Image
          src="/queueo.png"
          alt="Queueo"
          width={360}
          height={96}
          className="h-16 w-auto"
          priority
        />
        <p className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">
          Kiosk Check-in
        </p>
      </header>

      {/* Chat Thread */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-6 py-4">
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.map((msg, i) => {
            const isOld = i < messages.length - 2;

            return (
              <div
                key={i}
                className={`flex ${msg.role === "ai" ? "justify-start" : "justify-end"} transition-opacity duration-500 ${isOld ? "opacity-40" : "opacity-100"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-5 py-3 text-base leading-relaxed ${
                    msg.role === "ai"
                      ? "bg-white shadow-sm border border-zinc-200 text-black"
                      : "bg-black text-white"
                  } ${msg.isInterim ? "italic opacity-60" : ""}`}
                >
                  {msg.role === "ai" && !msg.isComplete
                    ? (
                        <>
                          {msg.displayedText}
                          <span className="animate-pulse">▌</span>
                        </>
                      )
                    : msg.displayedText || msg.text}
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Fallback Chips */}
        {showFallbackChips && fallbackChips.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center py-2 animate-fade-in">
            {fallbackChips.map((chip) => (
              <button
                key={chip}
                onClick={() => handleFallbackChip(chip)}
                className="rounded-full border-2 border-black bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* State Strip */}
      <div className="border-t border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          {/* Mic button */}
          <button
            onClick={handleMicTap}
            disabled={uiState === "thinking" || kioskState === "routing"}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              uiState === "listening"
                ? "bg-black text-white shadow-lg shadow-black/25 scale-110"
                : uiState === "speaking"
                  ? "bg-zinc-200 text-zinc-400"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-6 w-6"
            >
              <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
              <path d="M6 10a1 1 0 0 0-2 0 8 8 0 0 0 7 7.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A8 8 0 0 0 20 10a1 1 0 1 0-2 0 6 6 0 0 1-12 0Z" />
            </svg>
          </button>

          {/* State label & visualization */}
          <div className="flex flex-1 items-center gap-3">
            {uiState === "listening" && (
              <>
                <div className="flex items-center gap-1">
                  {barHeights.map((h, i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full bg-black"
                      style={{
                        height: `${h}px`,
                        animation: `sound-bar 0.4s ease-in-out ${i * 0.1}s infinite alternate`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-black">Listening…</span>
              </>
            )}

            {uiState === "speaking" && (
              <>
                <div className="h-3 w-3 rounded-full bg-black animate-pulse" />
                <span className="text-sm font-medium text-zinc-400">Speaking…</span>
              </>
            )}

            {uiState === "thinking" && (
              <>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-2 w-2 rounded-full bg-black animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-zinc-500">Thinking…</span>
              </>
            )}

            {uiState === "error" && (
              <span className="text-sm font-medium text-red-500 animate-pulse">
                Couldn&apos;t hear you — retrying…
              </span>
            )}

            {uiState === "idle" && (
              <span className="text-sm text-zinc-400">Tap the mic to speak</span>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        @keyframes sound-bar {
          from { height: 8px; }
          to { height: 24px; }
        }
      `}</style>
    </main>
  );
}
