"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAutoDismiss } from "@/lib/useTimedErrors";
import { useViewAll } from "@/lib/useViewAll";
import { DashTabs, type TabDef } from "./Tabs";

type TaTab = "in" | "history";

const TA_TABS: TabDef<TaTab>[] = [
  { id: "in", emoji: "🟢", label: "Currently in Lab" },
  { id: "history", emoji: "🕓", label: "Visit History" },
];

type Lab = {
  id: number;
  name: string;
  room_no: string;
  department: string | null;
  floor: string | null;
  pc_count: number;
  ta_id: number | null;
  ta_name: string | null;
  ta_email: string | null;
};

type ActivePresence = {
  id: number;
  checked_in_at: string;
  student_id: number;
  student_name: string;
  roll_no: string | null;
};

type PresenceHistory = {
  id: number;
  checked_in_at: string;
  checked_out_at: string | null;
  ip_address: string | null;
  is_active: boolean;
  duration_seconds: number;
  source: "manual" | "practical";
  session_id: number | null;
  course_code: string | null;
  course_name: string | null;
  student_id: number;
  student_name: string;
  roll_no: string | null;
  class_name: string | null;
  div: string | null;
};

const cardCls =
  "bg-white border rounded-lg overflow-hidden shadow-[0_4px_16px_-4px_rgba(58,11,109,0.25)]";
const cardStyle = { borderColor: "var(--color-border)" } as const;
const stripeStyle = (color: string) => ({ height: 5, backgroundColor: color });

export default function TADashboard() {
  return (
    <>
      <section
        className="rounded-lg p-6 text-white shadow-lg"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-accent-alt) 50%, var(--color-accent) 100%)",
        }}
      >
        <div className="text-3xl">🧑‍💻</div>
        <h1 className="text-2xl font-bold mt-2 tracking-tight">
          Teaching Assistant
        </h1>
        <p className="text-violet-100 mt-1 text-sm">
          Monitor student presence in your lab — who is currently in, and the
          full visit history. Attendance a student marks for any practical held
          in your lab is recorded here as a lab visit.
        </p>
      </section>

      <LabPresencePanel />
    </>
  );
}

function LabPresencePanel() {
  const { user } = useAuth();
  const [labs, setLabs] = useState<Lab[]>([]);
  const [labId, setLabId] = useState<number | null>(null);
  const [active, setActive] = useState<ActivePresence[]>([]);
  const [history, setHistory] = useState<PresenceHistory[]>([]);
  const [date, setDate] = useState("");
  const [tab, setTab] = useState<TaTab>("in");
  const [loadingLabs, setLoadingLabs] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);

  // Load labs once; default the selection to the lab this TA is assigned to.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api<{ labs: Lab[] }>("/api/labs");
        if (!alive) return;
        setLabs(d.labs);
        const mine = d.labs.find((l) => l.ta_id === user?.id);
        setLabId(mine?.id ?? d.labs[0]?.id ?? null);
      } catch (err) {
        if (alive)
          setError(err instanceof ApiError ? err.message : "Failed to load labs");
      } finally {
        if (alive) setLoadingLabs(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const loadPresence = useCallback(async () => {
    if (labId == null) return;
    setLoadingData(true);
    setError(null);
    try {
      const qs = date ? `?date=${date}` : "";
      const [a, h] = await Promise.all([
        api<{ active: ActivePresence[] }>(`/api/labs/${labId}/presence/active`),
        api<{ history: PresenceHistory[] }>(
          `/api/labs/${labId}/presence/history${qs}`
        ),
      ]);
      setActive(a.active);
      setHistory(h.history);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load presence");
    } finally {
      setLoadingData(false);
    }
  }, [labId, date]);

  useEffect(() => {
    loadPresence();
  }, [loadPresence]);

  const selectedLab = labs.find((l) => l.id === labId) ?? null;
  const isMyLab = selectedLab?.ta_id === user?.id;

  // The visit history grows with every check-in — cap it behind a "View all".
  const { visible: visibleHistory, toggle: historyToggle } = useViewAll(history);

  return (
    <Section
      title="Lab Presence"
      emoji="🚪"
      badge={active.length ? `${active.length} in lab` : null}
      badgeColor="var(--color-success)"
    >
      {loadingLabs ? (
        <Loading />
      ) : labs.length === 0 ? (
        <Empty
          emoji="🏫"
          title="No labs yet"
          sub="Labs are created by the Administrator. Once a lab exists, student visits will show here."
        />
      ) : (
        <div className="p-5 space-y-5">
          {error && <ErrorBox msg={error} />}

          {/* Controls */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                Lab
              </span>
              <select
                value={labId ?? ""}
                onChange={(e) => setLabId(e.target.value ? Number(e.target.value) : null)}
                className="rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-violet-200"
                style={{ borderColor: "var(--color-border)" }}
              >
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · Room {l.room_no}
                    {l.ta_id === user?.id ? " (your lab)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-violet-200"
                style={{ borderColor: "var(--color-border)" }}
              />
            </label>
            {date && (
              <button
                onClick={() => setDate("")}
                className="rounded-lg border px-3 py-2 text-xs font-semibold transition hover:bg-[var(--color-surface-alt)]"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
              >
                Clear date
              </button>
            )}
            <button
              onClick={loadPresence}
              disabled={loadingData}
              className="rounded-lg border px-3 py-2 text-xs font-semibold transition hover:bg-[var(--color-surface-alt)] disabled:opacity-50"
              style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            >
              {loadingData ? "Refreshing…" : "↻ Refresh"}
            </button>
            {selectedLab && (
              <span className="ml-auto text-xs" style={{ color: "var(--color-muted)" }}>
                {selectedLab.department ? `${selectedLab.department} · ` : ""}
                {selectedLab.pc_count} PCs
                {isMyLab ? " · assigned to you" : ""}
              </span>
            )}
          </div>

          <DashTabs tabs={TA_TABS} active={tab} onChange={setTab} />

          {/* Currently in the lab */}
          {tab === "in" && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
              Currently in lab
            </div>
            {active.length === 0 ? (
              <div
                className="rounded-lg border border-dashed px-4 py-5 text-sm text-center"
                style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
              >
                No students are checked in right now.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {active.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                    style={{
                      borderColor: "color-mix(in srgb, var(--color-success) 40%, var(--color-border))",
                      backgroundColor: "color-mix(in srgb, var(--color-success) 10%, white)",
                    }}
                    title={`Since ${new Date(a.checked_in_at).toLocaleString()}`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-success)" }} />
                    <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                      {a.student_name}
                    </span>
                    {a.roll_no && (
                      <span className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                        {a.roll_no}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                      in since {new Date(a.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          )}

          {/* Visit history */}
          {tab === "history" && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
              Visit history{date ? ` — ${new Date(date).toLocaleDateString()}` : ""}
            </div>
            {history.length === 0 ? (
              <Empty
                emoji="🕓"
                title="No visits recorded"
                sub={
                  date
                    ? "No students visited this lab on the selected date."
                    : "Student lab visits (check-ins) will appear here with their timings."
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "var(--color-surface-alt)" }}>
                      <Th>Roll No</Th>
                      <Th>Name</Th>
                      <Th>Class</Th>
                      <Th>Checked in</Th>
                      <Th>Checked out</Th>
                      <Th align="right">Duration</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleHistory.map((h, i) => (
                      <tr
                        key={h.id}
                        style={{
                          backgroundColor: i % 2 === 0 ? "white" : "var(--color-surface-alt)",
                        }}
                      >
                        <Td mono>{h.roll_no ?? "—"}</Td>
                        <Td bold>{h.student_name}</Td>
                        <Td muted>
                          {h.class_name ?? "—"}
                          {h.div ? `-${h.div}` : ""}
                        </Td>
                        <Td muted>{new Date(h.checked_in_at).toLocaleString()}</Td>
                        <Td muted>
                          {h.is_active ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
                              style={{
                                backgroundColor: "color-mix(in srgb, var(--color-success) 14%, white)",
                                color: "var(--color-success)",
                              }}
                            >
                              ● Still in lab
                            </span>
                          ) : h.checked_out_at ? (
                            new Date(h.checked_out_at).toLocaleString()
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td align="right">{fmtDuration(h.duration_seconds)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {historyToggle}
              </div>
            )}
          </div>
          )}
        </div>
      )}
    </Section>
  );
}

function fmtDuration(seconds: number) {
  const mins = Math.max(0, Math.round(seconds / 60));
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function Section({
  title,
  emoji,
  badge,
  badgeColor,
  children,
}: {
  title: string;
  emoji: string;
  badge?: string | null;
  badgeColor?: string;
  children: ReactNode;
}) {
  return (
    <section className={cardCls} style={cardStyle}>
      <div style={stripeStyle("var(--color-accent-alt)")} />
      <div
        className="px-5 py-3 flex items-center gap-2 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span className="text-lg">{emoji}</span>
        <h2
          className="text-base font-bold tracking-tight"
          style={{ color: "var(--color-primary)" }}
        >
          {title}
        </h2>
        {badge && (
          <span
            className="ml-2 rounded-md px-2 py-0.5 text-xs font-bold text-white"
            style={{ backgroundColor: badgeColor ?? "var(--color-accent-alt)" }}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div className="px-5 py-8 text-sm" style={{ color: "var(--color-muted)" }}>
      Loading…
    </div>
  );
}

function Empty({
  emoji,
  title,
  sub,
}: {
  emoji: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="text-4xl mb-3">{emoji}</div>
      <div className="font-semibold" style={{ color: "var(--color-text)" }}>
        {title}
      </div>
      <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
        {sub}
      </p>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div
      className="rounded-md px-3 py-2 text-sm border"
      style={{
        backgroundColor: "#fdecea",
        borderColor: "#f5c6cb",
        color: "var(--color-danger)",
      }}
    >
      {msg}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider"
      style={{ color: "var(--color-primary)", textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  bold,
  muted,
  mono,
  align = "left",
}: {
  children: ReactNode;
  bold?: boolean;
  muted?: boolean;
  mono?: boolean;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-5 py-2.5 ${mono ? "font-mono text-xs" : "text-sm"} ${
        bold ? "font-semibold" : ""
      }`}
      style={{
        color: muted ? "var(--color-muted)" : "var(--color-text)",
        textAlign: align,
      }}
    >
      {children}
    </td>
  );
}
