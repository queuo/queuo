"use client";

import Image from "next/image";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Mic } from "lucide-react";
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
  createdAt?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

const DEFAULT_PARTY_SIZE = 3;
const AI_TRANSITION_DELAY_MS = 220;
const AI_TYPING_TICK_MS = 46;

export default function WelcomePage() {
  // Core state
  const [kioskState, setKioskState] = useState<KioskState>("greeting");
  const [uiState, setUIState] = useState<UIState>("idle");
  const [partySize, setPartySize] = useState<number>(DEFAULT_PARTY_SIZE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showFallbackChips, setShowFallbackChips] = useState(false);
  const [collectedEmail, setCollectedEmail] = useState<string>("");
  const [assistantLift, setAssistantLift] = useState(0);

  // Refs for breaking circular callback dependencies
  const chatEndRef = useRef<HTMLDivElement>(null);
  const assistantTextRef = useRef<HTMLParagraphElement>(null);
  const hasStarted = useRef(false);
  const processingRef = useRef(false);
  const startListeningRef = useRef<() => void>(() => {});
  const handleGeminiResponseRef = useRef<
    (intent: GeminiIntent, reply: string, partySize: number | null, email: string | null) => void
  >(() => {});

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
      { role: "ai", text, displayedText: "", isComplete: false, createdAt: Date.now() },
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
    setMessages([{ role: "ai", text: greeting, displayedText: "", isComplete: false, createdAt: Date.now() }]);
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
            const tableAvailable = Math.random() < 0.5; // TBD: real YOLO data
            if (tableAvailable) {
              // Table is free — announce and reset for next guest
              setKioskState("routing");
              const tableMsg = "Great news! Table 7 is ready for you. Please proceed to your table — a team member will be with you shortly.";
              addAIMessage(tableMsg);
              setUIState("speaking");
              speak(tableMsg, () => {
                setTimeout(() => resetAndGreet(), 10000);
              });
            } else {
              // All tables full — collect email for waitlist on this page
              setKioskState("collect_email");
              const fullMsg = "It looks like all tables are full. Please say your email address and we'll notify you when a table is ready.";
              addAIMessage(fullMsg);
              speakAndListen(fullMsg);
            }
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
            // Show waitlist confirmation, then reset for next guest
            addAIMessage(reply);
            setUIState("speaking");
            speak(reply, () => {
              setTimeout(() => resetAndGreet(), 10000);
            });
          } else if (intent === "email_denied") {
            setKioskState("collect_email");
            setCollectedEmail("");
            addAIMessage(reply);
            speakAndListen(reply);
          }
          break;
      }
    },
    [kioskState, addAIMessage, speakAndListen, speak, resetAndGreet]
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

    const elapsed = lastMsg.createdAt ? Date.now() - lastMsg.createdAt : AI_TRANSITION_DELAY_MS;
    const isFirstChar = lastMsg.displayedText.length === 0;
    const waitForTransition = isFirstChar ? Math.max(0, AI_TRANSITION_DELAY_MS - elapsed) : 0;
    const tickDelay = waitForTransition > 0 ? waitForTransition : AI_TYPING_TICK_MS;

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
    }, tickDelay);

    return () => clearTimeout(timeout);
  }, [messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ─── Initial greeting ────────────────────────────────────────────────────

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const greeting = `Welcome! We detected a party of ${partySize}. Is that correct?`;
    addAIMessage(greeting);
    speakAndListen(greeting);
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

  const latestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "ai") {
        return { index: i, message: messages[i] };
      }
    }
    return null;
  }, [messages]);

  const previousAssistant = useMemo(() => {
    if (!latestAssistant) return null;
    for (let i = latestAssistant.index - 1; i >= 0; i -= 1) {
      if (messages[i].role === "ai") {
        return messages[i];
      }
    }
    return null;
  }, [latestAssistant, messages]);

  const latestUser = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "guest") {
      return null;
    }
    return last;
  }, [messages]);

  const uiLabel = useMemo(() => {
    switch (uiState) {
      case "listening":
        return "Listening";
      case "speaking":
        return "Speaking";
      case "thinking":
        return "Thinking";
      case "error":
        return "Connection Retry";
      default:
        return "Ready";
    }
  }, [uiState]);

  const waitingForGuest = useMemo(
    () => !latestUser && kioskState !== "routing",
    [kioskState, latestUser]
  );

  const showAssistantFadeOut = useMemo(() => {
    if (!latestAssistant || !previousAssistant) return false;
    return !latestAssistant.message.isComplete && latestAssistant.message.displayedText.length === 0;
  }, [latestAssistant, previousAssistant]);

  useEffect(() => {
    const el = assistantTextRef.current;
    if (!el || showAssistantFadeOut) return;

    const styles = window.getComputedStyle(el);
    const lineHeight = parseFloat(styles.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      setAssistantLift(0);
      return;
    }

    const lines = Math.max(1, Math.round(el.scrollHeight / lineHeight));
    const nextLift = Math.max(0, (lines - 1) * 18);
    setAssistantLift(nextLift);
  }, [latestAssistant?.message.displayedText, latestAssistant?.message.isComplete, showAssistantFadeOut]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f7fb] font-sans antialiased text-zinc-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 -top-14 size-80 rounded-full bg-sky-300/35 blur-3xl animate-cloud-drift" />
        <div className="absolute right-0 top-20 size-[24rem] rounded-full bg-indigo-200/45 blur-3xl animate-cloud-drift-reverse" />
        <div className="absolute bottom-0 left-1/4 size-[20rem] rounded-full bg-cyan-200/35 blur-3xl animate-cloud-drift" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 md:px-8">
        <header className="flex items-center justify-between">
          <Image
            src="/queueo.png"
            alt="Queueo"
            width={360}
            height={96}
            className="h-14 w-auto"
            priority
          />
          <div className="rounded-full border border-white/60 bg-white/45 px-4 py-2 text-xs font-semibold tracking-[0.14em] text-zinc-700 backdrop-blur-xl">
            KIOSK CHECK-IN
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-4">
          <section className="flex w-full min-h-[72vh] flex-col rounded-[2rem] border border-white/65 bg-white/45 p-5 shadow-[0_20px_80px_rgba(25,34,52,0.12)] backdrop-blur-2xl md:p-7">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 rounded-full border border-white/75 bg-white/55 px-3 py-1.5 backdrop-blur-lg">
              <span className={`relative inline-flex size-2.5 rounded-full ${
                uiState === "error" ? "bg-red-500" : "bg-emerald-500"
              }`}>
                <span className={`absolute inset-0 rounded-full ${
                  uiState === "error" ? "animate-ping bg-red-500/70" : "animate-ping bg-emerald-500/70"
                }`} />
              </span>
              <span className="text-xs font-semibold tracking-[0.08em] text-zinc-700">
                Queueo Assistant
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/75 bg-white/55 px-3 py-1.5 backdrop-blur-lg">
              {uiState === "listening" ? (
                <div className="flex items-end gap-1">
                  {barHeights.map((_h, i) => (
                    <span
                      key={i}
                      className="h-6 w-1 origin-bottom rounded-full bg-zinc-800"
                      style={{
                        animation: `sound-bar-scale 0.45s ease-in-out ${i * 0.08}s infinite alternate`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <span className={`size-2 rounded-full ${
                  uiState === "thinking"
                    ? "bg-amber-500 animate-pulse"
                    : uiState === "speaking"
                      ? "bg-blue-500 animate-pulse"
                      : uiState === "error"
                        ? "bg-red-500 animate-pulse"
                        : "bg-zinc-500"
                }`} />
              )}
              <span className="text-xs font-semibold tracking-[0.08em] text-zinc-700">{uiLabel}</span>
            </div>
          </div>

            <div className="flex flex-1 flex-col justify-center px-2 py-4 md:px-6 md:py-5">
            <div className="mt-4 flex min-h-[160px] w-full items-center justify-center px-2 md:min-h-[190px] md:px-4">
              <div
                className="w-full transition-transform duration-450 ease-out"
                style={{ transform: `translateY(-${assistantLift}px)` }}
              >
                <p
                  ref={assistantTextRef}
                  key={`${latestAssistant?.index ?? "empty-assistant"}-${showAssistantFadeOut ? "out" : "in"}`}
                  className={`${showAssistantFadeOut ? "animate-ai-fade-out" : "animate-ai-swap"} mx-auto w-full max-w-[62rem] break-words text-balance text-center text-[clamp(2.25rem,4.2vw,3.45rem)] font-semibold leading-[1.18] tracking-tight text-zinc-900`}
                >
                  {showAssistantFadeOut && previousAssistant
                    ? previousAssistant.text
                    : latestAssistant
                    ? (
                        <>
                          {latestAssistant.message.displayedText || latestAssistant.message.text}
                          {!latestAssistant.message.isComplete && <span className="ml-1 animate-pulse">▌</span>}
                        </>
                      )
                    : "Welcome to Queueo."}
                </p>
              </div>
            </div>

            <div className={`mx-auto mt-5 w-full max-w-3xl rounded-2xl border px-4 py-3 backdrop-blur-md transition ${
              waitingForGuest
                ? "border-sky-100/90 bg-gradient-to-r from-white/42 via-sky-50/38 to-indigo-50/34"
                : "border-white/70 bg-white/35"
            }`}>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-zinc-600">
                  Guest
                </p>
              </div>

              {waitingForGuest ? (
                <div className="flex min-h-[1.5rem] items-center gap-2 text-sm text-zinc-700 md:text-base">
                  <span className="animate-wait-highlight bg-[repeating-linear-gradient(112deg,rgba(71,85,105,0.9)_0px,rgba(71,85,105,0.9)_68px,rgba(148,163,184,0.94)_104px,rgba(186,230,253,0.92)_138px,rgba(199,210,254,0.9)_174px,rgba(71,85,105,0.9)_238px)] bg-[length:280px_100%] bg-clip-text text-transparent">
                    Awaiting guest response
                  </span>
                </div>
              ) : (
                <p className={`min-h-[1.5rem] text-sm text-zinc-700 md:text-base ${latestUser?.isInterim ? "italic opacity-70" : ""}`}>
                  {latestUser?.displayedText || latestUser?.text}
                </p>
              )}
            </div>

            {showFallbackChips && fallbackChips.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-2.5 animate-fade-in">
                {fallbackChips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleFallbackChip(chip)}
                    className="rounded-full border border-zinc-300/70 bg-white/85 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-900 hover:text-white"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/55 px-4 py-3 backdrop-blur-lg">
            <p className="text-sm text-zinc-600">
              {uiState === "error"
                ? "Couldn&apos;t hear you clearly. Retrying..."
                : "Tap the mic to interrupt or continue naturally."}
            </p>
            <button
              onClick={handleMicTap}
              disabled={uiState === "thinking" || kioskState === "routing"}
              aria-label="Toggle microphone"
              className={`relative flex size-14 items-center justify-center rounded-full border transition-all duration-300 ${
                uiState === "listening"
                  ? "scale-[1.02] border-sky-200/70 bg-gradient-to-br from-sky-200/45 via-white/45 to-indigo-200/40 text-zinc-800 shadow-[0_0_0_6px_rgba(186,230,253,0.28)] backdrop-blur-xl"
                  : "border-white/80 bg-gradient-to-br from-white/55 to-sky-100/35 text-zinc-700 backdrop-blur-xl hover:border-sky-200/70 hover:from-white/65 hover:to-indigo-100/30"
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <Mic
                className="relative size-5"
                strokeWidth={2.2}
              />
            </button>
          </div>
        </section>
        </div>
      </div>

      <div ref={chatEndRef} className="hidden" />

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        @keyframes sound-bar-scale {
          from { transform: scaleY(0.35); }
          to { transform: scaleY(1); }
        }

        @keyframes cloud-drift {
          0% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(24px, -18px, 0) scale(1.04); }
          100% { transform: translate3d(0, 0, 0) scale(1); }
        }

        @keyframes cloud-drift-reverse {
          0% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-28px, 14px, 0) scale(1.05); }
          100% { transform: translate3d(0, 0, 0) scale(1); }
        }

        @keyframes ai-swap {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes ai-fade-out {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-6px); }
        }

        .animate-cloud-drift {
          animation: cloud-drift 18s ease-in-out infinite;
        }

        .animate-cloud-drift-reverse {
          animation: cloud-drift-reverse 22s ease-in-out infinite;
        }

        .animate-ai-swap {
          animation: ai-swap 0.35s ease-out;
        }

        .animate-ai-fade-out {
          animation: ai-fade-out 0.22s ease-in forwards;
        }

        .animate-wait-highlight {
          animation: wait-highlight 4s linear infinite;
        }

        @keyframes wait-highlight {
          0% { background-position: 0 0; }
          100% { background-position: 280px 0; }
        }

      `}</style>
    </main>
  );
}
