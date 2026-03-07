"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTextToSpeech } from "@/lib/useTextToSpeech";

type MessageStage = "greeting" | "party-size" | "reservation-prompt" | "buttons";

interface TypedMessage {
  text: string;
  displayedText: string;
  isComplete: boolean;
}

export default function WelcomePage() {
  const [partySize, setPartySize] = useState<number>(2);
  const [manualPartySize, setManualPartySize] = useState<string>("");
  const [showPartyInput, setShowPartyInput] = useState(false);

  const [stage, setStage] = useState<MessageStage>("greeting");
  const [messages, setMessages] = useState<TypedMessage[]>([
    { text: "Welcome to Restaurant X", displayedText: "", isComplete: false },
  ]);
  const [showButtons, setShowButtons] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showReservationTimer, setShowReservationTimer] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(5);
  const [reservationTimerSeconds, setReservationTimerSeconds] = useState(5);
  const [speechComplete, setSpeechComplete] = useState(false);
  const [speechStarted, setSpeechStarted] = useState(false);
  const { speak } = useTextToSpeech({ rate: 0.8, pitch: 0.9, volume: 1 });

  const handlePartySizeWrong = () => {
    setShowTimer(false);
    setShowPartyInput(true);
  };

  const handlePartyInputSubmit = () => {
    const num = parseInt(manualPartySize, 10);
    if (num > 0) {
      setPartySize(num);
      setManualPartySize("");
      setShowPartyInput(false);
      setStage("reservation-prompt");
      setTimerSeconds(5);
      setSpeechComplete(false);
      setSpeechStarted(false);
      setShowReservationTimer(false);
      setReservationTimerSeconds(5);
      setMessages((prev) => [
        ...prev,
        {
          text: "Do you have a reservation?",
          displayedText: "",
          isComplete: false,
        },
      ]);
    }
  };

  const proceedToReservation = () => {
    setShowTimer(false);
    setTimerSeconds(5);
    setStage("reservation-prompt");
    setSpeechComplete(false);
    setSpeechStarted(false);
    setShowReservationTimer(false);
    setMessages((prev) => [
      ...prev,
      {
        text: "Do you have a reservation?",
        displayedText: "",
        isComplete: false,
      },
    ]);
  };

  const proceedToWalkIn = () => {
    setShowReservationTimer(false);
    setReservationTimerSeconds(5);
    window.location.href = "/admin/customer/table-free";
  };

  const typingSpeed = 50;

  // Typing animation effect
  useEffect(() => {
    const currentMessage = messages[messages.length - 1];
    if (!currentMessage || currentMessage.isComplete) return;

    const timeout = setTimeout(() => {
      const nextChar = currentMessage.text[currentMessage.displayedText.length];
      const updatedMessages = [...messages];
      updatedMessages[updatedMessages.length - 1] = {
        ...currentMessage,
        displayedText: currentMessage.displayedText + nextChar,
      };
      if (updatedMessages[updatedMessages.length - 1].displayedText.length === currentMessage.text.length) {
        updatedMessages[updatedMessages.length - 1].isComplete = true;
      }
      setMessages(updatedMessages);
    }, typingSpeed);

    return () => clearTimeout(timeout);
  }, [messages]);

  // Speak message when typing starts
  useEffect(() => {
    const currentMessage = messages[messages.length - 1];
    if (!currentMessage || speechStarted) return;

    if (currentMessage.displayedText.length > 0) {
      setSpeechStarted(true);
      speak(currentMessage.text, () => {
        setSpeechComplete(true);
      });
    }
  }, [messages, speak, speechStarted]);

  // Stage transition effect
  useEffect(() => {
    const currentMessage = messages[messages.length - 1];
    if (!currentMessage?.isComplete || !speechComplete) return;

    const transitionTimer = setTimeout(() => {
      switch (stage) {
        case "greeting":
          setStage("party-size");
          setSpeechComplete(false);
          setSpeechStarted(false);
          setMessages((prev) => [
            ...prev,
            {
              text: `We saw you have a party of ${partySize}.`,
              displayedText: "",
              isComplete: false,
            },
          ]);
          break;

        case "party-size":
          setShowTimer(true);
          setTimerSeconds(5);
          break;

        case "reservation-prompt":
          setShowReservationTimer(true);
          setReservationTimerSeconds(5);
          break;

        case "buttons":
          break;
      }
    }, 500);

    return () => clearTimeout(transitionTimer);
  }, [stage, messages, speechComplete, partySize]);

  // Timer effect for party size
  useEffect(() => {
    if (!showTimer) return;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setShowTimer(false);
          proceedToReservation();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showTimer]);

  // Timer effect for reservation
  useEffect(() => {
    if (!showReservationTimer) return;

    const interval = setInterval(() => {
      setReservationTimerSeconds((prev) => {
        if (prev <= 1) {
          setShowReservationTimer(false);
          proceedToWalkIn();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showReservationTimer]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 font-sans antialiased text-black">
      <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 md:px-10">
        {/* Header */}
        <header className="mb-20 flex items-center justify-between">
          <p className="text-2xl font-semibold tracking-tight">Restaurant X</p>
          <p className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">
            Kiosk Check-in
          </p>
        </header>

        {/* Conversation Container */}
        <section className="flex flex-col items-center justify-center min-h-[500px] relative">
          <div className="w-full max-w-2xl space-y-6 relative h-[120px]" style={{ perspective: "1000px" }}>
            {messages.length > 0 && (
              <div className="relative h-full overflow-hidden">
                <div
                  className="absolute w-full transition-all duration-1000"
                  style={{
                    transform: `translateY(-${(messages.length - 1) * 120}px) rotateX(0deg)`,
                    opacity: 1,
                    transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                  }}
                >
                  {messages.map((message, index) => (
                    <div key={index} className="h-[120px] flex items-start pb-6 message-item">
                      <h1 className={`text-3xl md:text-5xl font-bold text-black leading-tight tracking-tight min-h-[80px] ${
                        index === messages.length - 1 && message.displayedText.length > 0 ? 'animate-zoom-in' : ''
                      }`}>
                        {index === messages.length - 1 ? message.displayedText : message.text}
                        {index === messages.length - 1 && !message.isComplete && (
                          <span className="animate-pulse">|</span>
                        )}
                      </h1>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {showPartyInput && (
            <div className="mt-12 flex flex-col gap-4 animate-fade-in">
              <div className="flex gap-4">
                <input
                  type="number"
                  min="1"
                  value={manualPartySize}
                  onChange={(e) => setManualPartySize(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handlePartyInputSubmit()}
                  className="flex-1 rounded-lg border-2 border-black px-4 py-3 text-base font-semibold text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Enter party size"
                  autoFocus
                />
                <button
                  onClick={handlePartyInputSubmit}
                  className="rounded-lg bg-black px-8 py-3 text-base font-semibold text-white transition hover:bg-zinc-800 active:bg-black"
                >
                  Confirm
                </button>
              </div>
            </div>
          )}

          {showTimer && (
            <div className="mt-1 flex flex-col items-center gap-16">
              {/* No Button */}
              <button
                onClick={handlePartySizeWrong}
                className="rounded-lg border-2 border-black bg-white px-8 py-3 text-base font-semibold text-black transition hover:bg-black hover:text-white opacity-50 hover:opacity-100"
              >
                No
              </button>

              {/* Circular Timer */}
              <div className="relative w-16 h-16 flex items-center justify-center opacity-50">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="2"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#000"
                    strokeWidth="2"
                    strokeDasharray={`${(timerSeconds / 5) * 282.7} 282.7`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 1s linear" }}
                  />
                </svg>
              </div>
            </div>
          )}

          {showReservationTimer && (
            <div className="mt-1 flex flex-col items-center gap-16">
              {/* Yes Button */}
              <Link
                href="/admin/customer/confirm-reservation"
                className="rounded-lg bg-black px-8 py-3 text-base font-semibold text-white transition hover:bg-zinc-800 active:bg-black"
              >
                Yes, I do
              </Link>

              {/* Circular Timer */}
              <div className="relative w-16 h-16 flex items-center justify-center opacity-50">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="2"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#000"
                    strokeWidth="2"
                    strokeDasharray={`${(reservationTimerSeconds / 5) * 282.7} 282.7`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 1s linear" }}
                  />
                </svg>
              </div>
            </div>
          )}

          {showButtons && (
            <div className="mt-12 flex flex-col gap-4 sm:flex-row animate-fade-in">
              <Link
                href="/admin/customer/confirm-reservation"
                className="flex-1 rounded-lg bg-black px-8 py-5 text-center text-base font-semibold text-white transition hover:bg-zinc-800 active:bg-black"
              >
                Yes, I do
              </Link>
              <Link
                href="/admin/customer/table-free"
                className="flex-1 rounded-lg border-2 border-black bg-white px-8 py-5 text-center text-base font-semibold text-black transition hover:bg-black hover:text-white"
              >
                No reservation
              </Link>
            </div>
          )}
        </section>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes rainbow-pulse {
          0% {
            width: 0px;
            height: 0px;
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7), 0 0 0 0 rgba(255, 127, 0, 0.7), 0 0 0 0 rgba(0, 0, 255, 0.7);
          }
          50% {
            width: 200px;
            height: 200px;
            opacity: 1;
            box-shadow: 0 0 0 60px rgba(255, 0, 0, 0.5), 0 0 0 100px rgba(255, 127, 0, 0.3), 0 0 0 140px rgba(0, 0, 255, 0.1);
          }
          100% {
            width: 400px;
            height: 400px;
            opacity: 0;
            box-shadow: 0 0 0 200px rgba(255, 0, 0, 0), 0 0 0 280px rgba(255, 127, 0, 0), 0 0 0 360px rgba(0, 0, 255, 0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .animate-zoom-in {
          animation: zoom-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .message-item {
          opacity: 1;
          transition: opacity 1000ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .message-item:not(:last-child) {
          opacity: 0.3;
          filter: blur(0.8px);
        }
      `}</style>
    </main>
  );
}
