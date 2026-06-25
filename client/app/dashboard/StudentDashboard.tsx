"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAutoDismiss } from "@/lib/useTimedErrors";
import { useViewAll } from "@/lib/useViewAll";
import { DashTabs, type TabDef } from "./Tabs";

type StudentTab = "practicals" | "presence" | "attendance";

const STUDENT_TABS: TabDef<StudentTab>[] = [
  { id: "practicals", emoji: "⚡", label: "Practical Sessions" },
  { id: "presence", emoji: "🏢", label: "Lab Check-In" },
  { id: "attendance", emoji: "📊", label: "My Attendance" },
];

type ActiveSession = {
  id: number;
  course_id: number;
  scheduled_start: string;
  scheduled_end: string;
  code: string;
  name: string;
};

type UpcomingSession = ActiveSession;

type CourseSummary = {
  course_id: number;
  code: string;
  name: string;
  total_sessions: number;
  present_count: number;
  percentage: number | null;
};

type Lab = {
  id: number;
  name: string;
  room_no: string;
  department: string | null;
  floor: string | null;
  pc_count: number;
};

type Department = {
  id: number;
  name: string;
};

type CurrentPresence = {
  id: number;
  lab_id: number;
  checked_in_at: string;
  lab_name: string;
  room_no: string;
};

type PresenceRecord = {
  id: number;
  lab_id: number;
  lab_name: string;
  room_no: string;
  checked_in_at: string;
  checked_out_at: string | null;
  duration_seconds: number;
};

const cardCls =
  "bg-white border rounded-lg overflow-hidden shadow-[0_4px_16px_-4px_rgba(58,11,109,0.25)]";
const cardStyle = { borderColor: "var(--color-border)" } as const;
const stripeStyle = (color: string) => ({
  height: 5,
  backgroundColor: color,
});

const primaryBtnCls =
  "rounded-md px-5 py-2.5 text-sm font-bold text-white shadow-sm transition disabled:opacity-50 active:scale-[0.98]";

export default function StudentDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<StudentTab>("practicals");
  const [active, setActive] = useState<ActiveSession[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingSession[]>([]);
  const [summary, setSummary] = useState<CourseSummary[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [selectedLabId, setSelectedLabId] = useState<number | null>(null);
  const [current, setCurrent] = useState<CurrentPresence | null>(null);
  const [history, setHistory] = useState<PresenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<number | null>(null);
  const [labBusy, setLabBusy] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    id: number;
    kind: "ok" | "err";
    msg: string;
  } | null>(null);
  const [labFeedback, setLabFeedback] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  // Auto-dismiss the transient feedback banners after a few seconds.
  useAutoDismiss(feedback, setFeedback);
  useAutoDismiss(labFeedback, setLabFeedback);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [a, u, s, l, d, c, h] = await Promise.all([
        api<{ sessions: ActiveSession[] }>("/api/sessions/active"),
        api<{ sessions: UpcomingSession[] }>("/api/sessions/upcoming"),
        api<{ courses: CourseSummary[] }>("/api/attendance/me"),
        api<{ labs: Lab[] }>("/api/labs"),
        api<{ departments: Department[] }>("/api/departments"),
        api<{ current: CurrentPresence | null }>("/api/lab-presence/me/current"),
        api<{ history: PresenceRecord[] }>("/api/lab-presence/me/history"),
      ]);
      setActive(a.sessions);
      setUpcoming(u.sessions);
      setSummary(s.courses);
      setLabs(l.labs);
      setDepartments(d.departments);
      setCurrent(c.current);
      setHistory(h.history);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load, then keep session/attendance data fresh so a session that
  // ends (or starts) while the page is open updates without a manual reload.
  useEffect(() => {
    refresh();
    const interval = setInterval(() => refresh(true), 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Labs belonging to the chosen department (matched by department name).
  const labsInDept = labs.filter((l) => l.department === selectedDept);

  // Don't pre-select a department — the user must pick one. Only clear the
  // selection if the chosen department no longer exists.
  useEffect(() => {
    setSelectedDept((prev) =>
      prev != null && departments.some((d) => d.name === prev) ? prev : null
    );
  }, [departments]);

  // Keep the lab selection valid within the chosen department: default to the
  // first lab, and reset when the department changes or the lab disappears.
  useEffect(() => {
    setSelectedLabId((prev) =>
      prev != null && labsInDept.some((l) => l.id === prev)
        ? prev
        : labsInDept[0]?.id ?? null
    );
    // labsInDept is derived from labs + selectedDept; depend on those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labs, selectedDept]);

  // Guard against showing a session as LIVE in the gap between it ending and
  // the next background refresh. Re-evaluated every 15s.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const liveSessions = active.filter(
    (s) => new Date(s.scheduled_end).getTime() > nowTick
  );

  async function mark(sessionId: number) {
    setFeedback(null);
    setMarking(sessionId);
    try {
      await api(`/api/sessions/${sessionId}/attendance`, { method: "POST" });
      setFeedback({ id: sessionId, kind: "ok", msg: "✓ You're marked present" });
      refresh();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Could not mark attendance";
      setFeedback({ id: sessionId, kind: "err", msg });
    } finally {
      setMarking(null);
    }
  }

  async function checkIn(labId: number) {
    setLabFeedback(null);
    setLabBusy(labId);
    try {
      await api(`/api/labs/${labId}/check-in`, { method: "POST" });
      setLabFeedback({ kind: "ok", msg: "✓ Checked in" });
      refresh();
    } catch (err) {
      setLabFeedback({
        kind: "err",
        msg: err instanceof ApiError ? err.message : "Check-in failed",
      });
    } finally {
      setLabBusy(null);
    }
  }

  async function checkOut(presenceId: number) {
    setLabFeedback(null);
    setLabBusy(presenceId);
    try {
      await api(`/api/lab-presence/${presenceId}/check-out`, { method: "POST" });
      setLabFeedback({ kind: "ok", msg: "✓ Checked out" });
      refresh();
    } catch (err) {
      setLabFeedback({
        kind: "err",
        msg: err instanceof ApiError ? err.message : "Check-out failed",
      });
    } finally {
      setLabBusy(null);
    }
  }

  const overall = (() => {
    const totals = summary.reduce(
      (acc, c) => ({
        sessions: acc.sessions + c.total_sessions,
        present: acc.present + c.present_count,
      }),
      { sessions: 0, present: 0 }
    );
    if (totals.sessions === 0) return null;
    return Math.round((totals.present / totals.sessions) * 1000) / 10;
  })();

  const firstName = user?.name.split(" ")[0] ?? "there";

  // Cap the visit history; it grows with every check-in.
  const { visible: visibleHistory, toggle: historyToggle } = useViewAll(history);

  return (
    <>
      <section
        className="rounded-lg p-6 text-white shadow-lg"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 50%, var(--color-accent) 100%)",
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-6">
          <div>
            <div className="text-3xl">🎓</div>
            <h1 className="text-2xl font-bold mt-2 tracking-tight">
              Welcome, {firstName}
            </h1>
            <p className="text-violet-100 mt-1 text-sm">
              Mark your lab attendance and track your progress.
            </p>
          </div>
          {overall !== null && (
            <div
              className="rounded-md px-6 py-4 text-center border border-white/20"
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <div className="text-xs uppercase tracking-wider text-violet-100">
                Overall
              </div>
              <div className="text-3xl font-bold mt-1">{overall}%</div>
            </div>
          )}
        </div>
      </section>

      <DashTabs tabs={STUDENT_TABS} active={tab} onChange={setTab} />

      {tab === "presence" && (
      <Section
        title="Lab Presence"
        emoji="🏢"
        badge={current ? "CHECKED IN" : null}
        badgeColor="var(--color-success)"
      >
        {labFeedback && (
          <div
            className="mx-5 mt-4 rounded-md px-3 py-2 text-sm border"
            style={
              labFeedback.kind === "ok"
                ? {
                    backgroundColor: "#e7f6ed",
                    borderColor: "#bfe5cc",
                    color: "var(--color-success)",
                  }
                : {
                    backgroundColor: "#fdecea",
                    borderColor: "#f5c6cb",
                    color: "var(--color-danger)",
                  }
            }
          >
            {labFeedback.msg}
          </div>
        )}
        {current ? (
          <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold" style={{ color: "var(--color-text)" }}>
                {current.lab_name}
                <span
                  className="ml-2 rounded-md px-2 py-0.5 text-xs font-bold"
                  style={{
                    backgroundColor: "var(--color-surface-alt)",
                    color: "var(--color-primary)",
                  }}
                >
                  Room {current.room_no}
                </span>
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                Checked in {new Date(current.checked_in_at).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => checkOut(current.id)}
              disabled={labBusy === current.id}
              className={primaryBtnCls}
              style={{ backgroundColor: "var(--color-danger)" }}
            >
              {labBusy === current.id ? "Checking out…" : "Check out"}
            </button>
          </div>
        ) : labs.length === 0 ? (
          <Empty
            emoji="📭"
            title="No labs available"
            sub="Wait for an admin to add labs."
          />
        ) : (
          (() => {
            const selectedLab =
              labsInDept.find((l) => l.id === selectedLabId) ?? null;
            return (
              <div className="px-5 py-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="block space-y-1 flex-1">
                    <span
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: "var(--color-muted)" }}
                    >
                      Select a department
                    </span>
                    <select
                      value={selectedDept ?? ""}
                      onChange={(e) =>
                        setSelectedDept(e.target.value || null)
                      }
                      className="block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-violet-200"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <option value="">Select department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1 flex-1">
                    <span
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: "var(--color-muted)" }}
                    >
                      Select a lab
                    </span>
                    <select
                      value={selectedLabId ?? ""}
                      onChange={(e) =>
                        setSelectedLabId(
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                      className="block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-violet-200"
                      style={{ borderColor: "var(--color-border)" }}
                      disabled={labsInDept.length === 0}
                    >
                      {labsInDept.length === 0 ? (
                        <option value="">
                          {selectedDept == null
                            ? "Select a department first"
                            : "No labs in this department"}
                        </option>
                      ) : (
                        labsInDept.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} · Room {l.room_no}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </div>
                {selectedLab && (
                  <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {[
                      selectedLab.floor && `${selectedLab.floor} floor`,
                      selectedLab.department,
                      `PCs ${selectedLab.pc_count || "—"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
                <button
                  onClick={() =>
                    selectedLabId != null && checkIn(selectedLabId)
                  }
                  disabled={selectedLabId == null || labBusy === selectedLabId}
                  className={primaryBtnCls}
                  style={{ backgroundColor: "var(--color-success)" }}
                >
                  {selectedLabId != null && labBusy === selectedLabId
                    ? "Checking in…"
                    : "Check in"}
                </button>
              </div>
            );
          })()
        )}
      </Section>
      )}

      {tab === "practicals" && (
      <Section
        title="Active Practical Sessions"
        emoji="⚡"
        badge={liveSessions.length > 0 ? `${liveSessions.length} live` : null}
      >
        {loading ? (
          <Loading />
        ) : liveSessions.length === 0 ? (
          <Empty
            emoji="😴"
            title="No session live right now"
            sub="A practical opens automatically when its scheduled start time arrives."
          />
        ) : (
          <ul
            className="divide-y"
            style={{ borderColor: "var(--color-border)" }}
          >
            {liveSessions.map((s) => (
              <li
                key={s.id}
                className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-md px-2.5 py-0.5 text-xs font-bold"
                      style={{
                        backgroundColor: "var(--color-surface-alt)",
                        color: "var(--color-primary)",
                      }}
                    >
                      {s.code}
                    </span>
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: "var(--color-success)" }}
                    >
                      ● LIVE
                    </span>
                  </div>
                  <div
                    className="font-semibold mt-2"
                    style={{ color: "var(--color-text)" }}
                  >
                    {s.name}
                  </div>
                  <div
                    className="text-xs mt-1"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {new Date(s.scheduled_start).toLocaleTimeString()} →{" "}
                    {new Date(s.scheduled_end).toLocaleTimeString()}
                  </div>
                  {feedback?.id === s.id && (
                    <div
                      className="text-sm mt-2 font-semibold"
                      style={{
                        color:
                          feedback.kind === "ok"
                            ? "var(--color-success)"
                            : "var(--color-danger)",
                      }}
                    >
                      {feedback.msg}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => mark(s.id)}
                  disabled={marking === s.id}
                  className={primaryBtnCls}
                  style={{ backgroundColor: "var(--color-success)" }}
                >
                  {marking === s.id ? "Marking…" : "Mark Present ✋"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      )}

      {tab === "practicals" && (
      <Section
        title="Upcoming This Week"
        emoji="📅"
        badge={upcoming.length ? `${upcoming.length}` : null}
      >
        {upcoming.length === 0 ? (
          <Empty
            emoji="📭"
            title="Nothing scheduled"
            sub="Your incharge hasn't scheduled any sessions in the next week."
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {upcoming.map((s) => (
              <li key={s.id} className="px-5 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-bold"
                    style={{
                      backgroundColor: "var(--color-surface-alt)",
                      color: "var(--color-primary)",
                    }}
                  >
                    {s.code}
                  </span>
                  <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                    {s.name}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                  {new Date(s.scheduled_start).toLocaleString()} →{" "}
                  {new Date(s.scheduled_end).toLocaleTimeString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      )}

      {tab === "attendance" && (
      <Section title="My Attendance" emoji="📊">
        {summary.length === 0 ? (
          <Empty
            emoji="📭"
            title="No courses yet"
            sub="You are not enrolled in any course."
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4 p-5">
            {summary.map((c) => (
              <CourseCard key={c.course_id} course={c} />
            ))}
          </div>
        )}
      </Section>
      )}

      {tab === "presence" && (
      <Section
        title="Recent Lab Visits"
        emoji="🕒"
        badge={history.length ? `${history.length}` : null}
      >
        {history.length === 0 ? (
          <Empty emoji="📭" title="No lab visits yet" sub="Your check-ins will appear here." />
        ) : (
          <>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface-alt)" }}>
                <Th>Lab</Th>
                <Th>In</Th>
                <Th>Out</Th>
                <Th align="right">Duration</Th>
              </tr>
            </thead>
            <tbody>
              {visibleHistory.map((h, i) => (
                <tr
                  key={h.id}
                  style={{
                    backgroundColor:
                      i % 2 === 0 ? "white" : "var(--color-surface-alt)",
                  }}
                >
                  <Td bold>
                    {h.lab_name}{" "}
                    <span className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                      ({h.room_no})
                    </span>
                  </Td>
                  <Td muted>{new Date(h.checked_in_at).toLocaleString()}</Td>
                  <Td muted>
                    {h.checked_out_at
                      ? new Date(h.checked_out_at).toLocaleString()
                      : "— still in"}
                  </Td>
                  <Td align="right">{fmtDuration(h.duration_seconds)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {historyToggle}
          </>
        )}
      </Section>
      )}
    </>
  );
}

function fmtDuration(sec: number) {
  if (!sec || sec < 60) return `${sec || 0}s`;
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m % 60}m`;
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
      <div style={stripeStyle("var(--color-accent)")} />
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
            style={{ backgroundColor: badgeColor ?? "var(--color-accent)" }}
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

function CourseCard({ course }: { course: CourseSummary }) {
  const pct = course.percentage;
  const color =
    pct === null
      ? "var(--color-muted)"
      : pct >= 75
      ? "var(--color-success)"
      : pct >= 50
      ? "var(--color-warn)"
      : "var(--color-danger)";

  return (
    <div
      className="rounded-md border bg-white overflow-hidden"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div style={stripeStyle(color)} />
      <div className="p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div
            className="inline-block rounded-md px-2 py-0.5 text-xs font-bold"
            style={{
              backgroundColor: "var(--color-surface-alt)",
              color: "var(--color-primary)",
            }}
          >
            {course.code}
          </div>
          <div
            className="font-semibold mt-2 truncate"
            style={{ color: "var(--color-text)" }}
          >
            {course.name}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
            {course.present_count} present · {course.total_sessions} total
          </div>
        </div>
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4"
          style={{ borderColor: color }}
        >
          <div className="text-base font-bold" style={{ color }}>
            {pct === null ? "—" : `${pct}%`}
          </div>
        </div>
      </div>
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
