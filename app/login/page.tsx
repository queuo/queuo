"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";

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
      router.push("/admin/test-route");
    }
  }

  return (
    <div className="flex min-h-screen font-sans antialiased">
      {/* Left panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-sm">
          <a
            href="/"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-black"
          >
            ← Back to home
          </a>
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Don&apos;t have an account?{" "}
            <a href="#" className="text-black underline underline-offset-2">
              Contact us
            </a>
          </p>

          <form onSubmit={handleSignIn} className="mt-8 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-black placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-700">
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
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-black placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-lg bg-black text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>

      {/* Right panel — branding */}
      <div className="hidden flex-col items-center justify-center bg-zinc-50 px-12 lg:flex lg:flex-1">
        <div className="w-full max-w-md text-center">
          {/* Logo */}
          <div className="mb-6 flex items-center justify-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
              <span className="text-sm font-bold text-white">+</span>
            </div>
            <span className="text-xl font-semibold tracking-tight text-black">
              PlaceholderName
            </span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-black">
            Smart guest reception
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            Computer vision that seats your guests — automatically.
          </p>

          {/* Product mockup placeholder */}
          <div className="mt-10 flex h-64 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <p className="text-sm font-medium text-zinc-400">
              Dashboard preview
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
