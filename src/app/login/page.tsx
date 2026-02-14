"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
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

type Step = "email" | "code" | "verify";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState(["", "", "", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [codeSendPending, setCodeSendPending] = useState(0); // countdown before auto-sending OTP
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const supabase = createClient();

  const sendOtpCode = useCallback(
    async (targetEmail: string): Promise<"sent" | "rate_limited" | "error"> => {
      setLoading(true);
      setError(null);

      // Send OTP via raw fetch to avoid @supabase/ssr injecting PKCE state.
      // GoTrue always generates a 6-digit OTP regardless of code_challenge.
      const otpBody = { email: targetEmail, create_user: true };
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify(otpBody),
        }
      );


      setLoading(false);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ msg: "Request failed" }));
        const msg: string = body.msg || "Something went wrong";
        const match = msg.match(/after (\d+) second/);
        if (match) {
          const seconds = parseInt(match[1], 10);
          setCodeSendPending(seconds);
          return "rate_limited";
        }
        setError(msg);
        return "error";
      }

      setResendCooldown(60);
      return "sent";
    },
    []
  );

  // Handle magic link redirect: Supabase redirects here with #access_token=...
  // The SDK won't auto-detect hash fragments because @supabase/ssr forces PKCE,
  // so we parse them manually and set the session.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token")) {
      const params = new URLSearchParams(hash.replace("#", ""));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(() => router.replace("/dashboard"));
      }
      return;
    }

    // Handle error params from callback redirect
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"));
    const errorCode =
      hashParams.get("error_code") || params.get("error");
    const emailParam = params.get("email");

    if (
      errorCode === "code_exchange_failed" ||
      errorCode === "auth_failed"
    ) {
      if (emailParam) {
        setEmail(emailParam);
        sendOtpCode(emailParam).then((result) => {
          if (result === "sent" || result === "rate_limited") setStep("verify");
          else setStep("code");
        });
      } else {
        setError(
          "That didn\u2019t work. Enter your email to get a sign-in code."
        );
        setStep("code");
      }
    } else if (errorCode === "otp_expired") {
      setError("Your sign-in code has expired. Please request a new one.");
    } else if (errorCode === "access_denied") {
      setError("That code is no longer valid. Please request a new one.");
    } else if (errorCode) {
      setError("Something went wrong. Please try signing in again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the user signs in via magic link in another tab, redirect this tab too.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        router.replace("/dashboard");
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase.auth, router]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Auto-send OTP after rate limit countdown expires
  useEffect(() => {
    if (codeSendPending <= 0) return;
    const timer = setTimeout(() => {
      setCodeSendPending((c) => {
        if (c <= 1) {
          // Timer done — send the code
          sendOtpCode(email);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [codeSendPending, email, sendOtpCode]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const result = await sendOtpCode(email);
    if (result === "sent" || result === "rate_limited") {
      setStep("verify");
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await sendOtpCode(email);
    if (result === "sent" || result === "rate_limited") setStep("verify");
  };

  const handleVerifyCode = useCallback(
    async (otpCode: string) => {
      setLoading(true);
      setError(null);

      // Verify via our server-side endpoint which computes the token hash
      // using SHA-224 (matching GoTrue's internal hashing) and calls
      // Supabase with token_hash instead of token.
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otpCode }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setLoading(false);
        setError(
          body?.error === "Token has expired or is invalid"
            ? "That code is invalid or expired. Please try again."
            : body?.error || "Verification failed. Please try again."
        );
        setCode(["", "", "", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }

      const { access_token, refresh_token } = await res.json();
      await supabase.auth.setSession({ access_token, refresh_token });

      // Brief pause for the session cookie to propagate before navigating
      await new Promise((r) => setTimeout(r, 100));
      router.replace("/dashboard");
    },
    [email, supabase.auth, router]
  );

  const handleCodeChange = (index: number, value: string) => {
    // Handle paste of full code
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 8).split("");
      const newCode = [...code];
      digits.forEach((d, i) => {
        if (index + i < 8) newCode[index + i] = d;
      });
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, 7);
      inputRefs.current[nextIndex]?.focus();
      if (newCode.every((d) => d !== "")) {
        handleVerifyCode(newCode.join(""));
      }
      return;
    }

    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newCode.every((d) => d !== "")) {
      handleVerifyCode(newCode.join(""));
    }
  };

  const handleCodeKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    await sendOtpCode(email);
  };

  const handleUseDifferentEmail = () => {
    setStep("email");
    setEmail("");
    setError(null);
    setMessage(null);
    setCode(["", "", "", "", "", "", "", ""]);
  };

  const inputStyle = {
    border: "1px solid rgba(45, 27, 78, 0.15)",
    background: "#faf7f2",
    color: "#1a0e2e",
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#6b4c9a";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(107, 76, 154, 0.1)";
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "rgba(45, 27, 78, 0.15)";
    e.currentTarget.style.boxShadow = "none";
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
          {/* Step: email — initial sign-in */}
          {step === "email" && (
            <>
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
                We&apos;ll email you a magic link and sign-in code
              </p>

              {error && <ErrorBanner message={error} />}

              <form onSubmit={handleSendMagicLink} className="space-y-4">
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
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
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
            </>
          )}

          {/* Step: code — email + send code (cold start after redirect) */}
          {step === "code" && (
            <>
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
                Sign in with a code
              </h1>
              <p
                className="text-center text-sm mb-8"
                style={{ color: "#5a4d6b" }}
              >
                We&apos;ll send a code to your email
              </p>

              {error && <ErrorBanner message={error} />}

              <form onSubmit={handleSendCode} className="space-y-4">
                <div>
                  <label
                    htmlFor="code-email"
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: "#1a0e2e" }}
                  >
                    Email
                  </label>
                  <input
                    id="code-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "#6b4c9a", color: "#faf7f2" }}
                >
                  {loading ? "Sending..." : "Send code"}
                </button>
              </form>

              <button
                onClick={handleUseDifferentEmail}
                className="w-full mt-4 text-sm hover:underline"
                style={{ color: "#8a7f96", background: "none", border: "none" }}
              >
                Use a different email
              </button>
            </>
          )}

          {/* Step: verify — 6-digit code entry */}
          {step === "verify" && (
            <>
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
                Check your email
              </h1>
              <p
                className="text-center text-sm mb-6"
                style={{ color: "#5a4d6b" }}
              >
                {codeSendPending > 0 ? (
                  <>
                    Sending an email to{" "}
                    <strong style={{ color: "#1a0e2e" }}>{email}</strong> in{" "}
                    {codeSendPending}s...
                  </>
                ) : (
                  <>
                    Click the magic link or enter the code from the email
                    we sent to{" "}
                    <strong style={{ color: "#1a0e2e" }}>{email}</strong>
                    <br />
                    <span style={{ color: "#8a7f96", fontSize: "0.75rem" }}>
                      Magic links may not work on some phones — the code always
                      works
                    </span>
                  </>
                )}
              </p>

              {error && <ErrorBanner message={error} />}

              <div className="flex justify-center gap-2 mb-6">
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    onFocus={(e) => {
                      e.currentTarget.select();
                      handleInputFocus(e);
                    }}
                    onBlur={handleInputBlur}
                    disabled={loading}
                    className="w-9 h-12 text-center text-lg font-semibold rounded-lg outline-none transition-all disabled:opacity-50"
                    style={inputStyle}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {loading && (
                <p
                  className="text-center text-sm mb-4"
                  style={{ color: "#5a4d6b" }}
                >
                  Verifying...
                </p>
              )}

              <div className="flex justify-center gap-4 text-sm">
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="hover:underline disabled:no-underline disabled:cursor-default"
                  style={{
                    color: resendCooldown > 0 ? "#8a7f96" : "#6b4c9a",
                    background: "none",
                    border: "none",
                  }}
                >
                  {resendCooldown > 0
                    ? `Resend code (${resendCooldown}s)`
                    : "Resend code"}
                </button>
                <span style={{ color: "#d1cdd8" }}>|</span>
                <button
                  onClick={handleUseDifferentEmail}
                  className="hover:underline"
                  style={{
                    color: "#8a7f96",
                    background: "none",
                    border: "none",
                  }}
                >
                  Different email
                </button>
              </div>
            </>
          )}

          {step === "email" && message && (
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
          Don&apos;t have an account? We&apos;ll create one for you.
        </p>
      </div>
    </main>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="mb-6 px-4 py-3 rounded-xl text-sm text-center"
      style={{
        background: "rgba(220, 38, 38, 0.06)",
        color: "#b91c1c",
        border: "1px solid rgba(220, 38, 38, 0.12)",
      }}
    >
      {message}
    </div>
  );
}
