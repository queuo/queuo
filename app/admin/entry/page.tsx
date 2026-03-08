"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

type Stage = "greeting" | "buttons";

interface TypedMessage {
  text: string;
  displayedText: string;
  isComplete: boolean;
}

export default function AdminLanding() {
  const [stage, setStage] = useState<Stage>("greeting");
  const [messages, setMessages] = useState<TypedMessage[]>([
    { text: "Welcome, Restaurant X.", displayedText: "", isComplete: false },
  ]);
  const [showButtons, setShowButtons] = useState(false);

  const typingSpeed = 10;

  // Typing animation
  useEffect(() => {
    const current = messages[messages.length - 1];
    if (!current || current.isComplete) return;

    const timeout = setTimeout(() => {
      const next = current.text[current.displayedText.length];
      const updated = [...messages];
      const nextDisplayed = current.displayedText + next;
      updated[updated.length - 1] = {
        ...current,
        displayedText: nextDisplayed,
        isComplete: nextDisplayed.length === current.text.length,
      };
      setMessages(updated);
    }, typingSpeed);

    return () => clearTimeout(timeout);
  }, [messages]);

  // Stage transitions
  useEffect(() => {
    const current = messages[messages.length - 1];
    if (!current?.isComplete) return;

    const timer = setTimeout(() => {
      if (stage === "greeting") {
        setStage("buttons");
        setMessages((prev) => [
          ...prev,
          {
            text: "How would you like to proceed?",
            displayedText: "",
            isComplete: false,
          },
        ]);
      } else if (stage === "buttons") {
        setShowButtons(true);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [stage, messages]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 font-sans antialiased text-black">
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
          Admin Portal
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 md:px-10">

        {/* Conversation Container */}
        <section className="flex flex-col items-center justify-center min-h-[500px]">
          <div className="w-full max-w-2xl space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className="animate-fade-in">
                <h1 className="text-4xl md:text-6xl font-bold text-black leading-tight tracking-tight min-h-[80px]">
                  {msg.displayedText}
                  {!msg.isComplete && i === messages.length - 1 && (
                    <span className="animate-pulse">|</span>
                  )}
                </h1>
              </div>
            ))}

            {showButtons && (
              <div className="mt-12 flex flex-col gap-4 sm:flex-row animate-fade-in">
                <Link
                  href="/admin/customer/welcome-page"
                  className="flex-1 rounded-lg bg-black px-8 py-5 text-center text-base font-semibold text-white transition hover:bg-zinc-800 active:bg-black"
                >
                  Customer View
                </Link>
                <Link
                  href="/admin/business/dashboard"
                  className="flex-1 rounded-lg border-2 border-black bg-white px-8 py-5 text-center text-base font-semibold text-black transition hover:bg-black hover:text-white"
                >
                  Business View
                </Link>
              </div>
            )}
          </div>
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

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
      `}</style>
    </main>
  );
}
