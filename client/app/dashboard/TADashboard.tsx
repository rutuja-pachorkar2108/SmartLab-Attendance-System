"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Course = {
  id: number;
  code: string;
  name: string;
  incharge_id: number;
};

type Session = {
  id: number;
  course_id: number;
  scheduled_start: string;
  scheduled_end: string;
  notes: string | null;
  is_live: boolean;
  is_past: boolean;
};

type RosterEntry = {
  student_id: number;
  student_name: string;
  roll_no: string | null;
  marked_at: string | null;
  status: "present" | "absent" | "late";
};

type Student = {
  id: number;
  name: string;
  email: string;
  roll_no: string | null;
};

type SummaryStudent = {
  student_id: number;
  name: string;
  roll_no: string | null;
  present_count: number;
  total_sessions: number;
  percentage: number | null;
};

type AttendanceSummary = {
  totals: {
    students: number;
    sessions: number;
    past_sessions: number;
    live_sessions: number;
    upcoming_sessions: number;
  };
  students: SummaryStudent[];
};

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
  student_id: number;
  student_name: string;
  roll_no: string | null;
  class_name: string | null;
  div: string | null;
};

function attnColor(pct: number | null): string {
  if (pct == null) return "var(--color-muted)";
  if (pct >= 75) return "var(--color-success)";
  if (pct >= 50) return "#d97706";
  return "var(--color-danger)";
}

const cardCls =
  "bg-white border rounded-lg overflow-hidden shadow-[0_4px_16px_-4px_rgba(58,11,109,0.25)]";
const cardStyle = { borderColor: "var(--color-border)" } as const;
const stripeStyle = (color: string) => ({ height: 5, backgroundColor: color });

export default function TADashboard() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ courses: Course[] }>("/api/courses");
      setCourses(data.courses);
      if (data.courses.length > 0 && selected === null) {
        setSelected(data.courses[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
          View the student list and attendance for each practical, plus live,
          upcoming, and past lab sessions.
        </p>
      </section>

      <Section title="All Courses" emoji="📚">
        {loading ? (
          <Loading />
        ) : courses.length === 0 ? (
          <Empty
            emoji="📭"
            title="No courses yet"
            sub="No courses have been created."
          />
        ) : (
          <div className="p-5 flex flex-wrap gap-2">
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className="rounded-md px-4 py-2 text-sm font-bold transition"
                style={
                  selected === c.id
                    ? {
                        backgroundColor: "var(--color-accent-alt)",
                        color: "white",
                      }
                    : {
                        backgroundColor: "var(--color-surface-alt)",
                        color: "var(--color-primary)",
                        border: "1px solid var(--color-border)",
                      }
                }
              >
                {c.code}
              </button>
            ))}
          </div>
        )}
      </Section>

      <LabPresencePanel />

      {selected !== null && <CourseSessionPanel courseId={selected} />}
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
  const [loadingLabs, setLoadingLabs] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

          {/* Currently in the lab */}
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

          {/* Visit history */}
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
                    {history.map((h, i) => (
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
              </div>
            )}
          </div>
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

function CourseSessionPanel({ courseId }: { courseId: number }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [rosterFor, setRosterFor] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [ss, st, sum] = await Promise.all([
        api<{ sessions: Session[] }>(`/api/courses/${courseId}/sessions`),
        api<{ students: Student[] }>(`/api/courses/${courseId}/students`),
        api<AttendanceSummary>(`/api/courses/${courseId}/attendance-summary`),
      ]);
      setSessions(ss.sessions);
      setStudents(st.students);
      setSummary(sum);
      const live = ss.sessions.find((x) => x.is_live) ?? null;
      const target = live ?? ss.sessions.find((x) => x.is_past) ?? null;
      if (target) {
        setRosterFor(target);
        const r = await api<{ roster: RosterEntry[] }>(
          `/api/sessions/${target.id}/attendance`
        );
        setRoster(r.roster);
      } else {
        setRosterFor(null);
        setRoster(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function viewRoster(s: Session) {
    setRosterFor(s);
    setRoster(null);
    try {
      const r = await api<{ roster: RosterEntry[] }>(
        `/api/sessions/${s.id}/attendance`
      );
      setRoster(r.roster);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load roster");
    }
  }

  const live = sessions.find((x) => x.is_live) ?? null;
  const upcoming = sessions.filter((x) => !x.is_live && !x.is_past).sort(
    (a, b) =>
      new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  );
  const past = sessions.filter((x) => x.is_past);
  const presentCount = roster?.filter((r) => r.status === "present").length ?? 0;

  // Per-student attendance for the full roster, ranked best → worst.
  const ranked = [...(summary?.students ?? [])].sort(
    (a, b) => (b.percentage ?? -1) - (a.percentage ?? -1)
  );
  const pastSessions = summary?.totals.past_sessions ?? 0;

  return (
    <>
      {error && <ErrorBox msg={error} />}

      <Section
        title="Live Session"
        emoji={live ? "🟢" : "💤"}
        badge={live ? "LIVE" : null}
        badgeColor="var(--color-success)"
      >
        {live ? (
          <div className="px-5 py-4">
            <div className="text-sm" style={{ color: "var(--color-muted)" }}>
              {fmtRange(live.scheduled_start, live.scheduled_end)}
            </div>
            {roster && (
              <div
                className="text-sm font-bold mt-1"
                style={{ color: "var(--color-success)" }}
              >
                {presentCount} of {roster.length} present
              </div>
            )}
          </div>
        ) : (
          <Empty
            emoji="💤"
            title="No live session right now"
            sub="Sessions become live when their scheduled time arrives."
          />
        )}
      </Section>

      <Section
        title="Students & Attendance"
        emoji="👥"
        badge={`${students.length}`}
      >
        {students.length === 0 ? (
          <Empty
            emoji="📭"
            title="No students enrolled"
            sub="Students appear here once they're enrolled in this practical."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "var(--color-surface-alt)" }}>
                  <Th>Roll No</Th>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Attendance</Th>
                  <Th align="right">Present</Th>
                </tr>
              </thead>
              <tbody>
                {(ranked.length ? ranked : students.map((s) => ({
                  student_id: s.id,
                  name: s.name,
                  roll_no: s.roll_no,
                  present_count: 0,
                  total_sessions: pastSessions,
                  percentage: null as number | null,
                }))).map((s, i) => {
                  const email =
                    students.find((x) => x.id === s.student_id)?.email ?? "—";
                  return (
                    <tr
                      key={s.student_id}
                      style={{
                        backgroundColor:
                          i % 2 === 0 ? "white" : "var(--color-surface-alt)",
                      }}
                    >
                      <Td mono>{s.roll_no ?? "—"}</Td>
                      <Td bold>{s.name}</Td>
                      <Td muted>{email}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 rounded-full overflow-hidden"
                            style={{
                              width: 110,
                              backgroundColor: "var(--color-surface-alt)",
                            }}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${s.percentage ?? 0}%`,
                                backgroundColor: attnColor(s.percentage),
                              }}
                            />
                          </div>
                          <span
                            className="font-bold"
                            style={{ color: attnColor(s.percentage) }}
                          >
                            {s.percentage == null ? "—" : `${s.percentage}%`}
                          </span>
                        </div>
                      </Td>
                      <Td muted align="right">
                        {s.present_count}/{s.total_sessions}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {rosterFor && roster && (
        <Section
          title={`Roster — ${fmtRange(rosterFor.scheduled_start, rosterFor.scheduled_end)}`}
          emoji="📋"
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface-alt)" }}>
                <Th>Roll No</Th>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th align="right">Marked at</Th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r, i) => (
                <tr
                  key={r.student_id}
                  style={{
                    backgroundColor:
                      i % 2 === 0 ? "white" : "var(--color-surface-alt)",
                  }}
                >
                  <Td mono>{r.roll_no ?? "—"}</Td>
                  <Td bold>{r.student_name}</Td>
                  <Td>
                    {r.status === "present" ? (
                      <span
                        className="rounded-md px-2 py-0.5 text-xs font-bold text-white"
                        style={{ backgroundColor: "var(--color-success)" }}
                      >
                        ✓ Present
                      </span>
                    ) : (
                      <span
                        className="rounded-md px-2 py-0.5 text-xs font-bold"
                        style={{
                          backgroundColor: "#eee",
                          color: "var(--color-muted)",
                        }}
                      >
                        Absent
                      </span>
                    )}
                  </Td>
                  <Td muted align="right">
                    {r.marked_at
                      ? new Date(r.marked_at).toLocaleTimeString()
                      : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section
        title="Upcoming Sessions"
        emoji="📅"
        badge={upcoming.length ? `${upcoming.length}` : null}
      >
        {upcoming.length === 0 ? (
          <Empty
            emoji="📭"
            title="Nothing upcoming"
            sub="When the Course Incharge schedules a session it will appear here."
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {upcoming.map((s) => (
              <li key={s.id} className="px-5 py-3 text-sm">
                <div className="font-semibold" style={{ color: "var(--color-text)" }}>
                  {fmtRange(s.scheduled_start, s.scheduled_end)}
                </div>
                {s.notes && (
                  <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                    {s.notes}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Past Sessions" emoji="🕒" badge={past.length ? `${past.length}` : null}>
        {past.length === 0 ? (
          <Empty
            emoji="📭"
            title="No past sessions"
            sub="Finished sessions will appear here."
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {past.map((s) => (
              <li
                key={s.id}
                className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap text-sm"
              >
                <div className="font-semibold" style={{ color: "var(--color-text)" }}>
                  {fmtRange(s.scheduled_start, s.scheduled_end)}
                </div>
                <button
                  onClick={() => viewRoster(s)}
                  className="rounded-md border px-3 py-1 text-xs font-bold transition hover:bg-violet-50"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-primary)",
                  }}
                >
                  View roster
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function fmtRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay
    ? `${s.toLocaleString()} → ${e.toLocaleTimeString()}`
    : `${s.toLocaleString()} → ${e.toLocaleString()}`;
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
