"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { FrostedPage, FrostedPill, GlassPanel } from "@/components/ui/frosted-shell";

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
    <FrostedPage className="font-sans">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 md:px-8">
        <header className="flex items-center justify-between">
          <Image
            src="/queuo.png"
            alt="queuo"
            width={360}
            height={96}
            className="h-14 w-auto"
            priority
          />
          <FrostedPill>ADMIN PORTAL</FrostedPill>
        </header>

        <div className="flex flex-1 items-center justify-center py-4">
          <GlassPanel className="flex w-full min-h-[72vh] max-w-6xl flex-col p-5 md:p-7">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="frosted-pill-pop flex items-center gap-2.5 rounded-full border border-white/75 bg-white/55 px-3 py-1.5 backdrop-blur-lg">
                <span className="inline-flex size-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold tracking-[0.08em] text-zinc-700">
                  queuo Assistant
                </span>
              </div>
              <div className="frosted-pill-pop rounded-full border border-white/75 bg-white/55 px-3 py-1.5 text-xs font-semibold tracking-[0.08em] text-zinc-700 backdrop-blur-lg">
                Ready
              </div>
            </div>

            <div className="frosted-reveal-soft flex flex-1 flex-col justify-center px-2 py-4 md:px-6 md:py-5">
              <div className="mt-4 flex min-h-[220px] w-full items-center justify-center px-2 md:min-h-[250px] md:px-4">
                <div className="mx-auto w-full max-w-[58rem]">
                  {messages.map((msg, i) => (
                    <div key={i} className="animate-fade-in">
                      <h1 className="min-h-[88px] text-balance text-center text-[clamp(2.25rem,4.2vw,3.45rem)] font-semibold leading-[1.18] tracking-tight text-zinc-900">
                        {msg.displayedText}
                        {!msg.isComplete && i === messages.length - 1 && (
                          <span className="animate-pulse">|</span>
                        )}
                      </h1>
                    </div>
                  ))}
                </div>
              </div>

              {showButtons && (
                <div className="mx-auto mt-8 flex w-full max-w-4xl flex-col gap-4 animate-fade-in sm:flex-row">
                  <Link
                    href="/admin/customer/welcome-page"
                    className="flex h-12 flex-1 items-center justify-center rounded-xl bg-black px-8 text-center text-base font-semibold tracking-tight text-white transition hover:bg-zinc-800 active:bg-black"
                  >
                    Customer View
                  </Link>
                  <Link
                    href="/admin/business/dashboard"
                    className="flex h-12 flex-1 items-center justify-center rounded-xl border border-zinc-300/70 bg-white/80 px-8 text-center text-base font-semibold tracking-tight text-black transition hover:bg-black hover:text-white"
                  >
                    Business View
                  </Link>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-white/70 bg-white/55 px-4 py-3 text-sm font-medium text-zinc-600 backdrop-blur-lg">
              Select a mode to continue.
            </div>
          </GlassPanel>
        </div>
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
    </FrostedPage>
  );
}
