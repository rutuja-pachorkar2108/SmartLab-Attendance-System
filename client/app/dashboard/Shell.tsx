"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import ProfileModal from "./Profile";

export default function Shell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-2xl animate-pulse">🧪</div>
      </div>
    );
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <header
        className="w-full"
        style={{
          height: 132,
          background:
            "linear-gradient(90deg, var(--color-primary-dark) 0%, var(--color-accent) 100%)",
        }}
      >
        <div className="h-full w-full pl-8 pr-10 flex items-center justify-between gap-6">
          <div className="flex items-center gap-5 min-w-0">
            <Logo />
            <div className="min-w-0 leading-snug">
              <div
                className="font-bold text-white tracking-tight truncate"
                style={{ fontSize: 26 }}
              >
                SNJB&apos;s Late Sau. K.B. Jain College of Engineering
              </div>
              <div
                className="font-bold truncate"
                style={{ fontSize: 18, color: "#C8BAFF" }}
              >
                Smart Lab Log: User Authentication and Logbook Automation for
                Computer Labs
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full text-base font-bold border-2 border-white/50"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "white",
              }}
            >
              {initial}
            </span>
            <div className="text-sm font-semibold text-white leading-tight">
              {user.name}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowProfile(true)}
                className="rounded-md bg-white/15 px-4 py-1.5 text-xs font-semibold text-white border border-white/40 transition hover:bg-white/25"
              >
                Profile
              </button>
              <button
                onClick={() => {
                  logout();
                  router.replace("/login");
                }}
                className="rounded-md bg-white px-4 py-1.5 text-xs font-semibold transition hover:bg-violet-50"
                style={{ color: "var(--color-primary)" }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      <main className="flex-1 w-full px-8 py-8 space-y-6">{children}</main>

      <footer
        className="w-full flex items-center justify-center"
        style={{
          height: 34,
          backgroundColor: "var(--color-primary)",
          color: "#C8BAFF",
          fontSize: 10,
        }}
      >
        SmartLabLog &nbsp;&nbsp; Developed by BE-Comp &nbsp;&nbsp; SNJB College
        of Engineering
      </footer>
    </div>
  );
}

function Logo() {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
      {failed ? (
        <span className="text-6xl leading-none select-none">🏫</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/SNJB_Logo.jpg"
          alt="SNJB College logo"
          className="h-[5.5rem] w-[6.25rem] object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
