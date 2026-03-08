"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function ConfirmReservationPage() {
  const [email, setEmail] = useState("");

  return (
    <main className="min-h-screen bg-zinc-50 font-sans antialiased text-black">
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-10">
        <header className="mb-12 flex items-center justify-between">
          <Image
            src="/queuo.png"
            alt="queuo"
            width={240}
            height={64}
            className="h-14 w-auto"
            priority
          />
          <p className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">Reservation</p>
        </header>

        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Step 2</p>
            <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-7xl">
              Confirm your
              <br />
              reservation
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-500 md:text-2xl">
              Enter the email used for your booking.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="guest@email.com"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-black placeholder:text-zinc-400 outline-none transition focus:ring-2 focus:ring-black"
            />
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/admin/customer/table-free"
                className="rounded-lg bg-black px-7 py-4 text-center text-base font-semibold text-white transition hover:bg-zinc-800"
              >
                Confirm
              </Link>
              <Link
                href="/admin/customer/welcome-page"
                className="rounded-lg border border-zinc-300 bg-white px-7 py-4 text-center text-base font-semibold text-black transition hover:border-zinc-500"
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
