"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useAutoDismiss, useTimedFieldErrors } from "@/lib/useTimedErrors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function LoginPage() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  // Show a confirmation when the user arrives here right after registering.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("registered") === "1") {
      setJustRegistered(true);
    }
  }, []);

  const errors = useMemo(() => {
    const e: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) e.email = "Email is required";
    else if (!EMAIL_RE.test(trimmedEmail)) e.email = "Enter a valid email address";
    if (!password) e.password = "Password is required";
    return e;
  }, [email, password]);

  const showErr = useTimedFieldErrors<"email" | "password">(
    errors,
    (k) => !!(touched[k] || submitAttempted)
  );
  const emailErr = showErr("email");
  const passwordErr = showErr("password");

  // Auto-dismiss the submit/server error banner after a few seconds.
  useAutoDismiss(error, setError);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    setError(null);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  const baseInput =
    "w-full rounded-2xl border-2 bg-white px-4 py-3 text-sm placeholder:text-violet-300 focus:outline-none transition";
  const emailCls = `${baseInput} ${
    emailErr
      ? "border-rose-300 focus:border-rose-400"
      : "border-violet-100 focus:border-violet-400"
  }`;
  const pwBorder = passwordErr
    ? "border-rose-300 focus:border-rose-400"
    : "border-violet-100 focus:border-violet-400";

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ backgroundColor: "#c4b0e3" }}
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          {logoFailed ? (
            <div className="text-7xl mb-3 leading-none select-none">🏫</div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/SNJB_Logo.jpg"
              alt="SNJB College logo"
              className="h-44 w-44 object-contain mb-4"
              onError={() => setLogoFailed(true)}
            />
          )}
          <div className="text-center mb-3">
            <div className="text-xl font-bold text-violet-950 leading-tight">
              SNJB&apos;s Late Sau. K.B. Jain College of Engineering
            </div>
            <div className="text-sm font-semibold text-fuchsia-600 mt-1.5 leading-snug">
              Smart Lab Log: User Authentication and Logbook Automation for
              Computer Labs
            </div>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-violet-950/80">
            Welcome back
          </h1>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="bg-white/80 backdrop-blur rounded-3xl p-8 shadow-[0_20px_60px_-20px_rgba(124,58,237,0.25)] border border-white space-y-5"
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-violet-900">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="you@college.edu"
              maxLength={254}
              className={emailCls}
              aria-invalid={!!emailErr}
            />
            {emailErr ? <p className="text-xs text-rose-600 mt-1">{emailErr}</p> : null}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-violet-900">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                placeholder="••••••••"
                maxLength={64}
                className={`w-full rounded-2xl border-2 bg-white pl-4 pr-11 py-3 text-sm placeholder:text-violet-300 focus:outline-none transition ${pwBorder}`}
                aria-invalid={!!passwordErr}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-violet-500 hover:text-violet-700 transition"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
            {passwordErr ? (
              <p className="text-xs text-rose-600 mt-1">{passwordErr}</p>
            ) : null}
          </div>

          {justRegistered && !error && (
            <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-100 px-4 py-3 text-sm text-emerald-700">
              Account created successfully — please sign in to continue.
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-rose-50 border-2 border-rose-100 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white font-semibold py-3 text-sm shadow-lg shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition active:scale-[0.98]"
          >
            {submitting ? "Signing in…" : "Sign in →"}
          </button>

          <p className="text-center text-sm text-violet-700/70">
            New here?{" "}
            <Link href="/register" className="font-semibold text-fuchsia-600 hover:text-fuchsia-700">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M17.94 17.94A10.42 10.42 0 0 1 12 19c-7 0-10-7-10-7a18.42 18.42 0 0 1 4.17-5.39" />
      <path d="M9.9 4.24A10.92 10.92 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
