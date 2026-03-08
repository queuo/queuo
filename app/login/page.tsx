"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { FrostedPage, FrostedPill, GlassPanel } from "@/components/ui/frosted-shell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      router.push("/admin/entry");
    }
  }

  return (
    <FrostedPage>
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 md:px-8">
        <header className="mb-5 flex items-center justify-between">
          <Image
            src="/queuo.png"
            alt="queuo"
            width={360}
            height={96}
            className="h-14 w-auto"
            priority
          />
          <FrostedPill>STAFF LOGIN</FrostedPill>
        </header>

        <div className="flex flex-1 items-center justify-center py-4">
          <GlassPanel className="grid w-full max-w-5xl gap-8 p-6 md:grid-cols-2 md:p-8">
            <div className="frosted-surface-strong frosted-reveal-soft rounded-3xl p-6 md:p-7">
              <Link
                href="/"
                className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-black"
              >
                ← Back to home
              </Link>
              <h1 className="text-[clamp(2rem,3.2vw,2.7rem)] font-semibold leading-[1.12] tracking-tight text-zinc-900">
                Sign in
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Don&apos;t have an account?{" "}
                <a href="#" className="text-black underline underline-offset-2">
                  Contact us
                </a>
              </p>

              <form onSubmit={handleSignIn} className="mt-8 flex flex-col gap-5">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold tracking-tight text-zinc-700">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-white/75 bg-white/70 px-3.5 py-2.5 text-[15px] font-medium text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-semibold tracking-tight text-zinc-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-xs text-zinc-500 hover:text-black"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/75 bg-white/70 px-3.5 py-2.5 text-[15px] font-medium text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                {error && (
                  <p className="rounded-xl border border-red-200/70 bg-red-50/75 px-3.5 py-2.5 text-sm text-red-600">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full rounded-xl bg-black text-sm font-semibold tracking-tight text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </div>

            <div className="hidden flex-col justify-center rounded-3xl frosted-surface-strong frosted-reveal-soft p-7 text-center md:flex">
              <div className="mb-2 flex items-center justify-center">
                <Image
                  src="/queuo.png"
                  alt="queuo"
                  width={360}
                  height={96}
                  className="h-40 w-auto"
                  priority
                />
              </div>
              <h2 className="-mt-6 text-2xl font-semibold tracking-tight text-zinc-900">
                Smart guest reception
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                Computer vision that seats your guests automatically.
              </p>

              <div className="mt-10 flex h-56 items-center justify-center rounded-2xl border border-white/70 bg-white/60">
                <p className="text-sm font-medium text-zinc-400">
                  Dashboard preview
                </p>
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    </FrostedPage>
  );
}
