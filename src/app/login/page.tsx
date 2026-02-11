"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Instrument_Serif, DM_Sans } from "next/font/google";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument-serif",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Check your email for the magic link!");
    }
    setLoading(false);
  };

  return (
    <main
      className={`${instrumentSerif.variable} ${dmSans.variable} min-h-screen flex items-center justify-center px-4`}
      style={{
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "#faf7f2",
        color: "#1a0e2e",
      }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="no-underline"
            style={{
              fontFamily:
                "var(--font-instrument-serif), 'Instrument Serif', serif",
              fontSize: "1.5rem",
              color: "#1a0e2e",
              letterSpacing: "-0.02em",
            }}
          >
            Daily Gist
          </Link>
        </div>

        <div
          className="bg-white rounded-2xl p-8"
          style={{
            border: "1px solid rgba(45, 27, 78, 0.08)",
            boxShadow: "0 8px 32px rgba(26, 14, 46, 0.06)",
          }}
        >
          <h1
            className="text-center mb-2"
            style={{
              fontFamily:
                "var(--font-instrument-serif), 'Instrument Serif', serif",
              fontSize: "1.75rem",
              color: "#1a0e2e",
              letterSpacing: "-0.02em",
            }}
          >
            Welcome back
          </h1>
          <p
            className="text-center text-sm mb-8"
            style={{ color: "#5a4d6b" }}
          >
            Sign in with a magic link — no password needed
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "#1a0e2e" }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  border: "1px solid rgba(45, 27, 78, 0.15)",
                  background: "#faf7f2",
                  color: "#1a0e2e",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#6b4c9a";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 3px rgba(107, 76, 154, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor =
                    "rgba(45, 27, 78, 0.15)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#6b4c9a", color: "#faf7f2" }}
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
          </form>

          {message && (
            <p
              className="mt-4 text-center text-sm"
              style={{ color: "#5a4d6b" }}
            >
              {message}
            </p>
          )}
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: "#8a7f96" }}
        >
          Don&apos;t have an account? The magic link will create one for you.
        </p>
      </div>
    </main>
  );
}
