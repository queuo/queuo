"use client";

import { useState } from "react";
import Link from "next/link";

export default function ConfirmReservationPage() {
  const [email, setEmail] = useState("");

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-100 to-slate-200 text-slate-900">
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-10">
        <header className="mb-12 flex items-center justify-between">
          <p className="text-2xl font-semibold tracking-tight">Restaurant X</p>
          <p className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Reservation</p>
        </header>

        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Step 2</p>
            <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-7xl">
              Confirm your
              <br />
              reservation
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600 md:text-2xl">
              Enter the email used for your booking.
            </p>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-2xl shadow-slate-400/20 backdrop-blur">
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
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
              <Link
                href="/admin/table-free"
                className="rounded-full bg-slate-900 px-7 py-4 text-center text-base font-semibold text-white transition hover:bg-slate-700"
              >
                Confirm
              </Link>
              <Link
                href="/admin/welcome-page"
                className="rounded-full border border-slate-300 bg-white px-7 py-4 text-center text-base font-semibold text-slate-900 transition hover:border-slate-500"
              >
                Back
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
