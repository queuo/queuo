import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FrostedPageProps {
  children: ReactNode;
  className?: string;
}

export function FrostedPage({ children, className }: FrostedPageProps) {
  return (
    <main
      className={cn(
        "relative min-h-screen overflow-hidden frosted-page text-zinc-900 antialiased",
        className
      )}
      style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-16 -top-14 size-80 rounded-full blur-3xl"
          style={{
            background: "var(--frosted-orb-sky)",
            animation: "cloud-drift 18s ease-in-out infinite",
          }}
        />
        <div
          className="absolute right-0 top-20 size-[24rem] rounded-full blur-3xl"
          style={{
            background: "var(--frosted-orb-indigo)",
            animation: "cloud-drift-reverse 22s ease-in-out infinite",
          }}
        />
        <div
          className="absolute bottom-0 left-1/4 size-[20rem] rounded-full blur-3xl"
          style={{
            background: "var(--frosted-orb-cyan)",
            animation: "cloud-drift 20s ease-in-out infinite",
          }}
        />
      </div>
      <div className="relative">{children}</div>
    </main>
  );
}

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
}

export function GlassPanel({ children, className }: GlassPanelProps) {
  return (
    <section className={cn("rounded-[2rem] frosted-surface frosted-reveal", className)}>
      {children}
    </section>
  );
}

interface FrostedPillProps {
  children: ReactNode;
  className?: string;
}

export function FrostedPill({ children, className }: FrostedPillProps) {
  return (
    <div
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-full frosted-pill frosted-pill-pop px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-700 transition-transform duration-200 hover:-translate-y-0.5",
        className
      )}
    >
      {children}
    </div>
  );
}
