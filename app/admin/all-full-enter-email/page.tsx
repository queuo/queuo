"use client";

import { useState } from "react";
import Link from "next/link";

export default function AllFullEnterEmailPage() {
  const [email, setEmail] = useState("");

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-100 to-slate-200 text-slate-900">
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-10">
        <header className="mb-12 flex items-center justify-between">
          <p className="text-2xl font-semibold tracking-tight">Restaurant X</p>
          <p className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Waitlist</p>
        </header>

        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">No Table Available</p>
            <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-7xl">
              All tables
              <br />
              are full
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600 md:text-2xl">
              Estimated wait is 18 minutes. Add your email to join the waitlist.
            </p>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-2xl shadow-slate-400/20 backdrop-blur">
            <div className="rounded-2xl bg-slate-100 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Estimated Wait</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">18 minutes</p>
            </div>
            <label htmlFor="email" className="mt-5 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="guest@email.com"
              className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-xl font-medium outline-none transition focus:border-slate-900"
            />
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="rounded-full bg-slate-900 px-7 py-4 text-base font-semibold text-white transition hover:bg-slate-700"
              >
                Join Waitlist
              </button>
              <Link
                href="/admin/welcome-page"
                className="rounded-full border border-slate-300 bg-white px-7 py-4 text-center text-base font-semibold text-slate-900 transition hover:border-slate-500"
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
