import Link from "next/link";

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-zinc-50 font-sans antialiased text-black">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-6 py-10 md:px-10">
        <header className="mb-12 flex items-center justify-between">
          <p className="text-2xl font-semibold tracking-tight">Restaurant X</p>
          <p className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">Kiosk Check-in</p>
        </header>

        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Welcome</p>
            <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-7xl">
              Welcome to
              <br />
              Restaurant X
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-500 md:text-2xl">
              Party of 5 detected. Do you have a reservation?
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/admin/confirm-reservation"
                className="rounded-lg bg-black px-7 py-4 text-center text-base font-semibold text-white transition hover:bg-zinc-800"
              >
                Yes, I do
              </Link>
              <Link
                href="/admin/table-free"
                className="rounded-lg border border-zinc-300 bg-white px-7 py-4 text-center text-base font-semibold text-black transition hover:border-zinc-500"
              >
                No reservation
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="space-y-3">
              <div className="rounded-xl bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Party Size</p>
                <p className="mt-1 text-2xl font-semibold">5 Guests</p>
              </div>
              <div className="rounded-xl bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Arrival Time</p>
                <p className="mt-1 text-2xl font-semibold">Now</p>
              </div>
              <div className="rounded-xl bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Need Assistance?</p>
                <button
                  type="button"
                  className="mt-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  Call Staff
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
