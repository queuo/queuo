import Image from "next/image";
import { Button } from "@/components/ui/button";
import { FrostedPage, GlassPanel, FrostedPill } from "@/components/ui/frosted-shell";

export default function Home() {
  return (
    <FrostedPage className="font-sans">

      {/* Navbar */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/60 bg-white/45 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          {/* Logo */}
          <Image
            src="/queuo.png"
            alt="queuo Logo"
            height={80}
            width={80}
            className="h-14 w-auto"
          />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 rounded-full px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 hover:bg-white/60"
              asChild
            >
              <a href="/login">Login</a>
            </Button>
            <Button
              size="sm"
              className="h-10 rounded-full bg-black px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-zinc-800"
            >
              Contact
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pb-24 pt-32">
        <div className="mx-auto max-w-7xl">
          <GlassPanel className="p-8 md:p-10">
          <div className="max-w-2xl">
            <FrostedPill>Smart Reception Platform</FrostedPill>
            <h1 className="text-6xl font-semibold leading-[1.1] tracking-tight text-black">
              Smart guest
              <br />
              reception.
              <br />
              No host required.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-500">
              Computer vision detects arriving guests and their party size. Your
              kiosk guides them to their table — automatically.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <Button className="h-12 rounded-xl bg-black px-6 text-base font-semibold tracking-tight text-white hover:bg-zinc-800">
                Get a demo
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-xl border-zinc-300/70 bg-white/80 px-6 text-base font-semibold tracking-tight"
              >
                Learn more
              </Button>
            </div>
          </div>

          {/* Dashboard preview video */}
          <div className="mt-14 overflow-hidden rounded-2xl border border-white/70 shadow-xl">
            <video
              src="/Staff Preview.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="w-full"
            />
          </div>
          </GlassPanel>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <GlassPanel className="grid grid-cols-1 gap-16 p-8 md:p-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-4xl font-semibold leading-tight tracking-tight text-black">
                Smart reception meets next-generation vision
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-zinc-500">
                From the moment a guest approaches your entrance, our system
                handles detection, seating, waitlisting, and notifications —
                all without a host.
              </p>
              <div className="mt-10 space-y-6">
                {[
                  {
                    title: "Works with any iPhone or IP camera",
                    desc: "No proprietary hardware. Stream via WebRTC from any device.",
                  },
                  {
                    title: "Real-time floor management",
                    desc: "Live table states, dwell timers, and waitlist queue in one dashboard.",
                  },
                  {
                    title: "Automated guest notifications",
                    desc: "Guests are emailed the moment their table is ready — no manual follow-up.",
                  },
                ].map((f) => (
                  <div key={f.title} className="flex gap-4">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black">
                      <svg
                        className="h-3 w-3 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-black">{f.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                        {f.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Kiosk experience video */}
            <div className="overflow-hidden rounded-2xl border border-white/70 shadow-xl">
              <video
                src="/kiosk experience.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full"
              />
            </div>
          </GlassPanel>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <GlassPanel className="p-8 md:p-10">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-black">
              How it works
            </h2>
            <p className="mt-4 text-lg text-zinc-500">
              Three steps from arrival to seated.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Detect",
                desc: "YOLO vision counts your guests as they approach the entrance and identifies which tables are occupied vs. free in real time.",
              },
              {
                step: "02",
                title: "Guide",
                desc: "The kiosk greets guests by party size, confirms reservations or finds a free table, and directs them — no staff required.",
              },
              {
                step: "03",
                title: "Notify",
                desc: "When a table opens, the next waitlisted guest is automatically emailed and your staff dashboard updates instantly.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-white/70 bg-white/70 p-8 backdrop-blur-lg"
              >
                <p className="font-mono text-sm font-medium text-zinc-400">
                  {item.step}
                </p>
                <h3 className="mt-4 text-2xl font-semibold text-black">
                  {item.title}
                </h3>
                <p className="mt-3 leading-relaxed text-zinc-500">{item.desc}</p>
              </div>
            ))}
          </div>
          </GlassPanel>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-black px-6 py-24">
        <div className="mx-auto max-w-7xl text-center">
          <h2 className="text-4xl font-semibold text-white">
            Ready to transform your reception?
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            See how it works in a live demo.
          </p>
          <Button className="mt-8 h-12 rounded-xl bg-white px-8 text-sm font-semibold tracking-tight text-black hover:bg-zinc-100">
            Get a free demo
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-black px-6 pb-12 pt-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
            {[
              {
                heading: "Product",
                links: ["Dashboard", "Kiosk", "Camera Setup", "Integrations"],
              },
              {
                heading: "Use Cases",
                links: ["Fine Dining", "Fast Casual", "Cafes", "Hotels"],
              },
              {
                heading: "Company",
                links: ["About", "Blog", "Careers", "Contact"],
              },
              {
                heading: "Resources",
                links: ["Docs", "Support", "Privacy Policy", "Terms"],
              },
            ].map((col) => (
              <div key={col.heading}>
                <p className="text-sm font-semibold text-white">{col.heading}</p>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a
                        href="#"
                        className="text-sm text-zinc-400 transition-colors hover:text-white"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex items-center justify-between border-t border-zinc-800 pt-8">
            <Image
              src="/queuo.png"
              alt="queuo Logo"
              height={60}
              width={60}
              className="h-14 w-auto"
            />
            <p className="text-sm text-zinc-500">
              © 2026 queuo. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </FrostedPage>
  );
}
