"use client";

import { useState } from "react";
import Link from "next/link";

export default function AllFullEnterEmailPage() {
  const [email, setEmail] = useState("");

  return (
    <main className="min-h-screen bg-zinc-50 font-sans antialiased text-black">
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-10">
        <header className="mb-12 flex items-center justify-between">
          <p className="text-2xl font-semibold tracking-tight">Restaurant X</p>
          <p className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">Waitlist</p>
        </header>

        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">No Table Available</p>
            <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-7xl">
              All tables
              <br />
              are full
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-500 md:text-2xl">
              Estimated wait is 18 minutes. Add your email to join the waitlist.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="rounded-xl bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Estimated Wait</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">18 minutes</p>
            </div>
            <label htmlFor="email" className="mt-5 block text-sm font-medium text-zinc-700">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="guest@email.com"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-black placeholder:text-zinc-400 outline-none transition focus:ring-2 focus:ring-black"
            />
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="rounded-lg bg-black px-7 py-4 text-base font-semibold text-white transition hover:bg-zinc-800"
              >
                Join Waitlist
              </button>
              <Link
                href="/admin/customer/welcome-page"
                className="rounded-lg border border-zinc-300 bg-white px-7 py-4 text-center text-base font-semibold text-black transition hover:border-zinc-500"
              >
                Back To Start
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
