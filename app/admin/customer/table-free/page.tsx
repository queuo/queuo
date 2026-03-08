import Link from "next/link";
import Image from "next/image";

export default function TableFreePage() {
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
          <p className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">Seating Ready</p>
        </header>

        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Available Table</p>
            <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-7xl">
              Table 7 is
              <br />
              ready for you
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-500 md:text-2xl">
              Please proceed to your table. A team member will be with you shortly.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="rounded-xl bg-zinc-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Assigned Table</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight">Table 7</p>
              <p className="mt-2 text-base text-zinc-500">Left side near the window.</p>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/admin/customer/welcome-page"
                className="rounded-lg bg-black px-7 py-4 text-center text-base font-semibold text-white transition hover:bg-zinc-800"
              >
                Finish
              </Link>
              <Link
                href="/admin/customer/all-full"
                className="rounded-lg border border-zinc-300 bg-white px-7 py-4 text-center text-base font-semibold text-black transition hover:border-zinc-500"
              >
                Preview Full Capacity
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
