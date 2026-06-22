"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "@/lib/api";
import { useAutoDismiss } from "@/lib/useTimedErrors";

type Course = {
  id: number;
  code: string;
  name: string;
  incharge_id: number;
  created_at: string;
};

type Session = {
  id: number;
  course_id: number;
  created_by: number;
  scheduled_start: string;
  scheduled_end: string;
  notes: string | null;
  is_live: boolean;
  is_past: boolean;
};

type Student = {
  id: number;
  name: string;
  email: string;
  roll_no: string | null;
  class_name: string | null;
  div: string | null;
};

type RosterEntry = {
  student_id: number;
  student_name: string;
  roll_no: string | null;
  attendance_id: number | null;
  marked_at: string | null;
  ip_address: string | null;
  status: "present" | "absent" | "late";
};

type SummarySession = {
  id: number;
  scheduled_start: string;
  scheduled_end: string;
  notes: string | null;
  is_live: boolean;
  is_past: boolean;
  present_count: number;
  total_students: number;
  percentage: number | null;
};

type SummaryStudent = {
  student_id: number;
  name: string;
  roll_no: string | null;
  class_name: string | null;
  div: string | null;
  present_count: number;
  total_sessions: number;
  percentage: number | null;
};

type AttendanceRecord = {
  student_id: number;
  session_id: number;
};

type AttendanceSummary = {
  totals: {
    students: number;
    sessions: number;
    past_sessions: number;
    live_sessions: number;
    upcoming_sessions: number;
  };
  sessions: SummarySession[];
  students: SummaryStudent[];
  records: AttendanceRecord[];
};

// Fixed class years and divisions used by the enrolled-students filters.
const CLASS_OPTIONS = ["FE", "SE", "TE", "BE"] as const;
const DIV_OPTIONS = ["A", "B"] as const;

function attnColor(pct: number | null): string {
  if (pct == null) return "var(--color-muted)";
  if (pct >= 75) return "var(--color-success)";
  if (pct >= 50) return "#d97706";
  return "var(--color-danger)";
}

const cardCls =
  "bg-white border rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(26,15,51,0.04),0_4px_12px_-6px_rgba(26,15,51,0.12)]";
const cardStyle = { borderColor: "var(--color-border)" } as const;

const inputCls =
  "w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-violet-200";
const inputStyle = { borderColor: "var(--color-border)" } as const;

const primaryBtnCls =
  "rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50 active:scale-[0.98]";
const primaryBtnStyle = { backgroundColor: "var(--color-primary)" } as const;

// Shared subtle/secondary button — used for all "View / Hide / Email" actions so
// they stay visually consistent across the dashboard.
const subtleBtnCls =
  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--color-surface-alt)]";
const subtleBtnStyle = {
  borderColor: "var(--color-border)",
  color: "var(--color-primary)",
} as const;

export default function InchargeDashboard() {
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
        className="rounded-xl p-6 text-white shadow-[0_8px_24px_-10px_rgba(56,0,99,0.6)] flex items-center gap-5"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 55%, var(--color-accent) 100%)",
        }}
      >
        <span className="grid place-items-center h-14 w-14 rounded-xl text-3xl shrink-0 border border-white/20 bg-white/10">
          👩‍🏫
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Course Incharge</h1>
          <p className="text-violet-100 mt-1 text-sm leading-relaxed">
            Schedule lab sessions for your assigned practicals and track
            attendance. New courses are assigned to you by the Administrator.
          </p>
        </div>
      </section>

      <Section title="My Courses" emoji="🎒">
        {loading ? (
          <Loading />
        ) : courses.length === 0 ? (
          <Empty
            emoji="📭"
            title="No practicals assigned yet"
            sub="The Administrator hasn't assigned a practical to you yet. Please reach out to them if you expect to see one here."
          />
        ) : (
          <div className="p-5 flex flex-wrap gap-2">
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                title={c.name}
                className="rounded-lg px-4 py-2 text-sm font-semibold transition active:scale-[0.98]"
                style={
                  selected === c.id
                    ? {
                        backgroundColor: "var(--color-primary)",
                        color: "white",
                        boxShadow:
                          "0 4px 12px -4px color-mix(in srgb, var(--color-primary) 60%, transparent)",
                      }
                    : {
                        backgroundColor: "white",
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

      {selected !== null && <CourseDetail courseId={selected} />}
    </>
  );
}

function CourseDetail({ courseId }: { courseId: number }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [rosterFor, setRosterFor] = useState<Session | null>(null);
  const [showStudents, setShowStudents] = useState(false);
  const [classFilter, setClassFilter] = useState("");
  const [divFilter, setDivFilter] = useState("");
  const [showCharts, setShowCharts] = useState(false);
  const [chartClass, setChartClass] = useState("");
  const [chartDiv, setChartDiv] = useState("");
  const [studentBand, setStudentBand] = useState<"all" | "good" | "mid" | "low">(
    "all"
  );
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);
  const rosterRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, ss, sum] = await Promise.all([
        api<{ students: Student[] }>(`/api/courses/${courseId}/students`),
        api<{ sessions: Session[] }>(`/api/courses/${courseId}/sessions`),
        api<AttendanceSummary>(`/api/courses/${courseId}/attendance-summary`),
      ]);
      setStudents(s.students);
      setSessions(ss.sessions);
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
    } finally {
      setLoading(false);
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
      // The roster renders in its own section further down the page, so bring it
      // into view — otherwise the click appears to do nothing. Wait a frame so
      // the section has mounted before scrolling.
      requestAnimationFrame(() =>
        rosterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load roster");
    }
  }

  async function deleteSession(id: number) {
    if (!confirm("Delete this scheduled session? Any marked attendance for it will be removed.")) return;
    try {
      await api(`/api/sessions/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  if (loading) {
    return (
      <Section title="Loading" emoji="⏳">
        <Loading />
      </Section>
    );
  }

  const live = sessions.find((x) => x.is_live) ?? null;
  const upcoming = sessions.filter((x) => !x.is_live && !x.is_past).sort(
    (a, b) =>
      new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  );
  const past = sessions.filter((x) => x.is_past);

  const totals = summary?.totals;
  const ranked = [...(summary?.students ?? [])].sort(
    (a, b) => (b.percentage ?? -1) - (a.percentage ?? -1)
  );
  const withData = ranked.filter((s) => s.percentage != null);
  const avgAttendance = withData.length
    ? Math.round(
        (withData.reduce((acc, s) => acc + (s.percentage ?? 0), 0) /
          withData.length) *
          10
      ) / 10
    : null;
  const good = withData.filter((s) => (s.percentage ?? 0) >= 75).length;
  const mid = withData.filter(
    (s) => (s.percentage ?? 0) >= 50 && (s.percentage ?? 0) < 75
  ).length;
  const low = withData.filter((s) => (s.percentage ?? 0) < 50).length;
  const pastViz = (summary?.sessions ?? []).filter((s) => s.is_past);

  const liveSummary = summary?.sessions.find((s) => s.is_live) ?? null;

  // Per-student chart filters: narrow by class/division (roll numbers repeat
  // across divisions, so these disambiguate) and attendance band, then pick one
  // student by roll number to view their session-by-session progress.
  const inBand = (pct: number | null) => {
    if (studentBand === "all") return true;
    const p = pct ?? -1;
    if (studentBand === "good") return p >= 75;
    if (studentBand === "mid") return p >= 50 && p < 75;
    return p >= 0 && p < 50;
  };
  const studentChoices = ranked.filter(
    (s) =>
      (!chartClass || s.class_name === chartClass) &&
      (!chartDiv || s.div === chartDiv) &&
      inBand(s.percentage)
  );
  const selectedStudent =
    studentChoices.find((s) => s.student_id === selectedStudentId) ??
    ranked.find((s) => s.student_id === selectedStudentId) ??
    null;
  // Sessions (oldest→newest) where the selected student was present.
  const selectedPresent = new Set(
    (summary?.records ?? [])
      .filter((r) => r.student_id === selectedStudentId)
      .map((r) => r.session_id)
  );

  // Class/division filters for the enrolled-students list. Fixed to the
  // institute's class years and divisions (see CLASS_OPTIONS / DIV_OPTIONS).
  const visibleStudents = students.filter(
    (s) =>
      (!classFilter || s.class_name === classFilter) &&
      (!divFilter || s.div === divFilter)
  );

  return (
    <>
      {error && <ErrorBox msg={error} />}

      {/* Overview KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard emoji="👥" label="Students" value={totals?.students ?? 0} />
        <StatCard emoji="📚" label="Sessions" value={totals?.sessions ?? 0} />
        <StatCard
          emoji="🟢"
          label="Live now"
          value={totals?.live_sessions ?? 0}
          accent="var(--color-success)"
        />
        <StatCard emoji="📅" label="Upcoming" value={totals?.upcoming_sessions ?? 0} />
        <StatCard emoji="🕒" label="Past" value={totals?.past_sessions ?? 0} />
        <StatCard
          emoji="📊"
          label="Avg attend."
          value={avgAttendance == null ? "—" : `${avgAttendance}%`}
          accent={attnColor(avgAttendance)}
        />
      </div>

      <ScheduleSessionForm courseId={courseId} onScheduled={load} />

      <Section
        title="Live Session"
        emoji={live ? "🟢" : "💤"}
        badge={live ? "LIVE" : null}
        badgeColor="var(--color-success)"
      >
        {live ? (
          <div className="px-5 py-5 flex items-center gap-6 flex-wrap">
            <Donut
              value={liveSummary?.percentage ?? 0}
              color="var(--color-success)"
            >
              <span className="text-2xl font-extrabold" style={{ color: "var(--color-success)" }}>
                {liveSummary?.percentage == null ? "—" : `${liveSummary.percentage}%`}
              </span>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                present
              </span>
            </Donut>
            <div className="min-w-0">
              <div className="text-sm" style={{ color: "var(--color-muted)" }}>
                {fmtRange(live.scheduled_start, live.scheduled_end)}
              </div>
              <div className="text-2xl font-bold mt-1" style={{ color: "var(--color-success)" }}>
                {liveSummary?.present_count ?? 0}
                <span className="text-base font-semibold" style={{ color: "var(--color-muted)" }}>
                  {" "}/ {liveSummary?.total_students ?? 0} present
                </span>
              </div>
              {live.notes && (
                <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                  {live.notes}
                </div>
              )}
            </div>
          </div>
        ) : (
          <Empty
            emoji="💤"
            title="No live session right now"
            sub="Schedule one above. The next one auto-becomes live when its start time arrives."
          />
        )}
      </Section>

      <Section title="Upcoming Sessions" emoji="📅" badge={upcoming.length ? `${upcoming.length}` : null}>
        {upcoming.length === 0 ? (
          <Empty emoji="📭" title="Nothing upcoming" sub="Schedule a session above." />
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {upcoming.map((s) => (
              <li
                key={s.id}
                className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap"
              >
                <div>
                  <div className="font-semibold" style={{ color: "var(--color-text)" }}>
                    {fmtRange(s.scheduled_start, s.scheduled_end)}
                  </div>
                  {s.notes && (
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                      {s.notes}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteSession(s.id)}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-[color-mix(in_srgb,var(--color-danger)_10%,white)]"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--color-danger) 40%, var(--color-border))",
                    color: "var(--color-danger)",
                  }}
                >
                  Cancel
                </button>
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
            {past.map((s) => {
              const meta = summary?.sessions.find((x) => x.id === s.id);
              return (
                <li
                  key={s.id}
                  className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold" style={{ color: "var(--color-text)" }}>
                      {fmtRange(s.scheduled_start, s.scheduled_end)}
                    </div>
                    {meta && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div
                          className="h-2 rounded-full overflow-hidden"
                          style={{ width: 120, backgroundColor: "var(--color-surface-alt)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${meta.percentage ?? 0}%`,
                              backgroundColor: attnColor(meta.percentage),
                            }}
                          />
                        </div>
                        <span className="text-xs font-bold" style={{ color: attnColor(meta.percentage) }}>
                          {meta.percentage == null ? "—" : `${meta.percentage}%`}
                        </span>
                        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                          ({meta.present_count}/{meta.total_students})
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => viewRoster(s)}
                    className={subtleBtnCls}
                    style={subtleBtnStyle}
                  >
                    View attendance
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Student attendance visualization */}
      <Section
        title="Student Attendance"
        emoji="📊"
        badge={totals?.past_sessions ? `${totals.past_sessions} sessions` : null}
        action={
          withData.length ? (
            <button
              onClick={() => setShowCharts((v) => !v)}
              className={subtleBtnCls}
              style={subtleBtnStyle}
            >
              {showCharts ? "Hide charts" : "View charts"}
            </button>
          ) : null
        }
      >
        {!withData.length ? (
          <Empty
            emoji="📈"
            title="No attendance data yet"
            sub="Attendance percentages appear once a scheduled session has ended."
          />
        ) : !showCharts ? (
          <button
            onClick={() => setShowCharts(true)}
            className="w-full px-5 py-8 text-center text-sm transition hover:bg-[var(--color-surface-alt)]"
            style={{ color: "var(--color-muted)" }}
          >
            <span className="font-semibold" style={{ color: "var(--color-primary)" }}>
              Class avg {avgAttendance == null ? "—" : `${avgAttendance}%`} across{" "}
              {withData.length} student{withData.length === 1 ? "" : "s"}
            </span>{" "}
            — click to view charts
          </button>
        ) : (
          <div className="p-5 space-y-6">
            {/* Class overview: donut + distribution */}
            <div
              className="flex items-center gap-6 flex-wrap rounded-xl border p-4"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor:
                  "color-mix(in srgb, var(--color-surface-alt) 25%, white)",
              }}
            >
              <Donut value={avgAttendance ?? 0} color={attnColor(avgAttendance)}>
                <span className="text-2xl font-extrabold" style={{ color: attnColor(avgAttendance) }}>
                  {avgAttendance == null ? "—" : `${avgAttendance}%`}
                </span>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                  class avg
                </span>
              </Donut>
              <div className="flex flex-col gap-2.5 text-sm">
                <Legend color="var(--color-success)" label="Good (≥75%)" count={good} />
                <Legend color="#d97706" label="Average (50–74%)" count={mid} />
                <Legend color="var(--color-danger)" label="Low (<50%)" count={low} />
              </div>
            </div>

            {/* Per-session trend */}
            {pastViz.length > 0 && (
              <div
                className="rounded-xl border p-4"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor:
                    "color-mix(in srgb, var(--color-surface-alt) 25%, white)",
                }}
              >
                <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--color-muted)" }}>
                  Attendance per session
                </div>
                <div
                  className="flex items-end gap-2 border-b pb-1"
                  style={{ height: 150, borderColor: "var(--color-border)" }}
                >
                  {pastViz.map((s) => (
                    <div
                      key={s.id}
                      className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
                      title={`${fmtRange(s.scheduled_start, s.scheduled_end)} — ${s.present_count}/${s.total_students}`}
                    >
                      <span className="text-[10px] font-bold" style={{ color: attnColor(s.percentage) }}>
                        {s.percentage == null ? "—" : `${s.percentage}%`}
                      </span>
                      <div
                        className="w-full rounded-t transition-all"
                        style={{
                          height: `${Math.max(4, s.percentage ?? 0)}%`,
                          backgroundColor: attnColor(s.percentage),
                        }}
                      />
                      <span className="text-[10px] truncate w-full text-center" style={{ color: "var(--color-muted)" }}>
                        {new Date(s.scheduled_start).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-student progress: filter + select one student to view */}
            <div
              className="border-t pt-5"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--color-muted)" }}>
                Individual student progress
              </div>

              {/* Filters: class → division → roll number */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <label className="block">
                  <span className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
                    Class / Year
                  </span>
                  <select
                    value={chartClass}
                    onChange={(e) => {
                      setChartClass(e.target.value);
                      setChartDiv("");
                      setSelectedStudentId(null);
                    }}
                    className={inputCls}
                    style={inputStyle}
                  >
                    <option value="">All classes</option>
                    {CLASS_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
                    Division
                  </span>
                  <select
                    value={chartDiv}
                    onChange={(e) => {
                      setChartDiv(e.target.value);
                      setSelectedStudentId(null);
                    }}
                    className={inputCls}
                    style={inputStyle}
                  >
                    <option value="">All divisions</option>
                    {DIV_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
                    Attendance
                  </span>
                  <select
                    value={studentBand}
                    onChange={(e) => {
                      setStudentBand(
                        e.target.value as "all" | "good" | "mid" | "low"
                      );
                      setSelectedStudentId(null);
                    }}
                    className={inputCls}
                    style={inputStyle}
                  >
                    <option value="all">All</option>
                    <option value="good">Good (≥75%)</option>
                    <option value="mid">Average (50–74%)</option>
                    <option value="low">Low (&lt;50%)</option>
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
                    Roll number
                  </span>
                  <select
                    value={selectedStudentId ?? ""}
                    onChange={(e) =>
                      setSelectedStudentId(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    className={inputCls}
                    style={inputStyle}
                  >
                    <option value="">
                      Select ({studentChoices.length})
                    </option>
                    {studentChoices.map((s) => (
                      <option key={s.student_id} value={s.student_id}>
                        {s.roll_no ?? "—"}
                        {s.div ? ` (${s.div})` : ""} · {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!selectedStudent ? (
                <div
                  className="rounded-md border border-dashed px-4 py-8 text-center text-sm"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
                >
                  Select a student above to view their attendance progress.
                </div>
              ) : (
                <div
                  className="flex flex-col lg:flex-row gap-6 items-start rounded-xl border p-4"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor:
                      "color-mix(in srgb, var(--color-surface-alt) 25%, white)",
                  }}
                >
                  {/* Selected student's overall donut */}
                  <div className="flex items-center gap-4">
                    <Donut
                      value={selectedStudent.percentage ?? 0}
                      color={attnColor(selectedStudent.percentage)}
                    >
                      <span className="text-2xl font-extrabold" style={{ color: attnColor(selectedStudent.percentage) }}>
                        {selectedStudent.percentage == null ? "—" : `${selectedStudent.percentage}%`}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                        overall
                      </span>
                    </Donut>
                    <div className="text-sm">
                      <div className="font-bold" style={{ color: "var(--color-text)" }}>
                        {selectedStudent.name}
                      </div>
                      <div className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                        {selectedStudent.roll_no ?? "—"}
                        {selectedStudent.class_name || selectedStudent.div
                          ? ` · ${selectedStudent.class_name ?? ""}${
                              selectedStudent.div ? `-${selectedStudent.div}` : ""
                            }`
                          : ""}
                      </div>
                      <div className="mt-1" style={{ color: "var(--color-muted)" }}>
                        Present {selectedStudent.present_count} / {selectedStudent.total_sessions} sessions
                      </div>
                    </div>
                  </div>

                  {/* Session-by-session timeline */}
                  <div className="flex-1 min-w-0 w-full">
                    {pastViz.length === 0 ? (
                      <div className="text-sm" style={{ color: "var(--color-muted)" }}>
                        No past sessions yet.
                      </div>
                    ) : (
                      <>
                        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
                          Session-by-session
                        </div>
                        <div className="flex items-end gap-2" style={{ height: 130 }}>
                          {pastViz.map((s) => {
                            const present = selectedPresent.has(s.id);
                            return (
                              <div
                                key={s.id}
                                className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
                                title={`${fmtRange(s.scheduled_start, s.scheduled_end)} — ${present ? "Present" : "Absent"}`}
                              >
                                <span
                                  className="text-sm font-bold"
                                  style={{
                                    color: present
                                      ? "var(--color-success)"
                                      : "var(--color-danger)",
                                  }}
                                >
                                  {present ? "✓" : "✕"}
                                </span>
                                <div
                                  className="w-full rounded-t transition-all"
                                  style={{
                                    height: present ? "100%" : "10%",
                                    backgroundColor: present
                                      ? "var(--color-success)"
                                      : "var(--color-danger)",
                                    opacity: present ? 1 : 0.5,
                                  }}
                                />
                                <span className="text-[10px] truncate w-full text-center" style={{ color: "var(--color-muted)" }}>
                                  {new Date(s.scheduled_start).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: "var(--color-muted)" }}>
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "var(--color-success)" }} />
                            Present
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "var(--color-danger)", opacity: 0.5 }} />
                            Absent
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Section>

      {rosterFor && roster && (
        <div ref={rosterRef} style={{ scrollMarginTop: 16 }}>
        <Section
          title={`Session Attendance — ${fmtRange(rosterFor.scheduled_start, rosterFor.scheduled_end)}`}
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
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--color-success) 14%, white)",
                          color: "var(--color-success)",
                        }}
                      >
                        ✓ Present
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{
                          backgroundColor: "var(--color-surface-alt)",
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
        </div>
      )}

      {/* Manual enroll hidden: students are auto-enrolled into their department's
          courses on registration. Restore <EnrollForm> below if you hit a case
          auto-enroll can't cover (department-name mismatch, cross-department). */}
      {/* <EnrollForm courseId={courseId} onEnrolled={load} /> */}

      <Section
        title="Enrolled Students"
        emoji="👥"
        badge={`${students.length}`}
        action={
          students.length > 0 ? (
            <button
              onClick={() => setShowStudents((v) => !v)}
              className={subtleBtnCls}
              style={subtleBtnStyle}
            >
              {showStudents ? "Hide list" : "View list"}
            </button>
          ) : null
        }
      >
        {students.length === 0 ? (
          <Empty
            emoji="📭"
            title="No students yet"
            sub="Students are auto-enrolled into their department's courses on registration."
          />
        ) : !showStudents ? (
          <button
            onClick={() => setShowStudents(true)}
            className="w-full px-5 py-8 text-center text-sm transition hover:bg-[var(--color-surface-alt)]"
            style={{ color: "var(--color-muted)" }}
          >
            <span className="font-semibold" style={{ color: "var(--color-primary)" }}>
              {students.length} student{students.length === 1 ? "" : "s"} enrolled
            </span>{" "}
            — click to view the full list
          </button>
        ) : (
          <>
            <div
              className="px-5 py-3 flex items-end gap-3 flex-wrap border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <label className="block space-y-1">
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--color-muted)" }}
                >
                  Class / Year
                </span>
                <select
                  value={classFilter}
                  onChange={(e) => {
                    setClassFilter(e.target.value);
                    setDivFilter("");
                  }}
                  className={inputCls}
                  style={inputStyle}
                >
                  <option value="">All classes</option>
                  {CLASS_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--color-muted)" }}
                >
                  Division
                </span>
                <select
                  value={divFilter}
                  onChange={(e) => setDivFilter(e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                >
                  <option value="">All divisions</option>
                  {DIV_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <span
                className="ml-auto text-sm font-semibold"
                style={{ color: "var(--color-muted)" }}
              >
                {visibleStudents.length} of {students.length}
              </span>
              {visibleStudents.length > 0 && (
                <a
                  href={`mailto:?bcc=${visibleStudents
                    .map((s) => s.email)
                    .join(",")}`}
                  className={subtleBtnCls}
                  style={subtleBtnStyle}
                  title="Email all listed students"
                >
                  ✉ Email all
                </a>
              )}
            </div>
            {visibleStudents.length === 0 ? (
              <Empty
                emoji="🔍"
                title="No students match"
                sub="Try a different class or division."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "var(--color-surface-alt)" }}>
                      <Th>Roll No</Th>
                      <Th>Name</Th>
                      <Th>Class</Th>
                      <Th>Div</Th>
                      <Th>Email</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStudents.map((s, i) => (
                      <tr
                        key={s.id}
                        style={{
                          backgroundColor:
                            i % 2 === 0 ? "white" : "var(--color-surface-alt)",
                        }}
                      >
                        <Td mono>{s.roll_no ?? "—"}</Td>
                        <Td bold>{s.name}</Td>
                        <Td muted>{s.class_name ?? "—"}</Td>
                        <Td muted>{s.div ?? "—"}</Td>
                        <Td>
                          <a
                            href={`mailto:${s.email}`}
                            className="font-semibold underline-offset-2 hover:underline"
                            style={{ color: "var(--color-primary)" }}
                            title={`Email ${s.name}`}
                          >
                            {s.email}
                          </a>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Section>
    </>
  );
}

function StatCard({
  emoji,
  label,
  value,
  accent,
}: {
  emoji: string;
  label: string;
  value: ReactNode;
  accent?: string;
}) {
  const tone = accent ?? "var(--color-primary)";
  return (
    <div
      className={`${cardCls} transition hover:-translate-y-0.5`}
      style={cardStyle}
    >
      <div className="px-4 py-3.5 relative">
        <span
          className="absolute left-0 top-3.5 bottom-3.5 w-1 rounded-full"
          style={{ backgroundColor: tone }}
        />
        <div className="flex items-center justify-between pl-2">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
            {label}
          </span>
          <span className="text-base opacity-80">{emoji}</span>
        </div>
        <div className="mt-1 pl-2 text-2xl font-extrabold tracking-tight" style={{ color: tone }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function Donut({
  value,
  color = "var(--color-success)",
  size = 120,
  children,
}: {
  value: number | null;
  color?: string;
  size?: number;
  children: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const inner = Math.round(size * 0.72);
  return (
    <div className="relative grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${pct * 3.6}deg, var(--color-surface-alt) 0deg)`,
        }}
      />
      <div
        className="relative grid place-items-center rounded-full bg-white text-center"
        style={{ width: inner, height: inner }}
      >
        {children}
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span style={{ color: "var(--color-text)" }}>{label}</span>
      <span className="font-bold" style={{ color }}>
        {count}
      </span>
    </div>
  );
}

function ScheduleSessionForm({
  courseId,
  onScheduled,
}: {
  courseId: number;
  onScheduled: () => void;
}) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const startISO = new Date(`${date}T${startTime}`).toISOString();
      const endISO = new Date(`${date}T${endTime}`).toISOString();
      await api("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          courseId,
          scheduledStart: startISO,
          scheduledEnd: endISO,
          notes: notes || undefined,
        }),
      });
      setDate("");
      setStartTime("");
      setEndTime("");
      setNotes("");
      onScheduled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to schedule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Schedule a Session" emoji="📅">
      <form onSubmit={submit} className="p-5 space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
              Date
            </span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
              Start
            </span>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
              End
            </span>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
            Notes (optional)
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Practical 3 — Linked Lists"
            className={inputCls}
            style={inputStyle}
          />
        </label>
        {error && <ErrorBox msg={error} />}
        <div className="flex justify-end">
          <button disabled={busy} className={primaryBtnCls} style={primaryBtnStyle}>
            {busy ? "Scheduling…" : "Schedule"}
          </button>
        </div>
      </form>
    </Section>
  );
}

function EnrollForm({
  courseId,
  onEnrolled,
}: {
  courseId: number;
  onEnrolled: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [mode, setMode] = useState<"email" | "rollNo">("email");
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/api/courses/${courseId}/enrollments`, {
        method: "POST",
        body: JSON.stringify({ [mode]: identifier }),
      });
      setIdentifier("");
      onEnrolled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Enroll a Student" emoji="➕">
      <form onSubmit={submit} className="p-5 space-y-3">
        <div className="grid sm:grid-cols-[auto_1fr_auto] gap-2">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "email" | "rollNo")}
            className={inputCls}
            style={inputStyle}
          >
            <option value="email">By email</option>
            <option value="rollNo">By roll no</option>
          </select>
          <input
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={mode === "email" ? "student@col.edu" : "22BCE001"}
            className={inputCls}
            style={inputStyle}
          />
          <button disabled={busy} className={primaryBtnCls} style={primaryBtnStyle}>
            {busy ? "Adding…" : "Add Student"}
          </button>
        </div>
        {error && <ErrorBox msg={error} />}
      </form>
    </Section>
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
  action,
  children,
}: {
  title: string;
  emoji: string;
  badge?: string | null;
  badgeColor?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cardCls} style={cardStyle}>
      <div
        className="px-5 py-3.5 flex items-center gap-3 border-b"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "color-mix(in srgb, var(--color-surface-alt) 35%, white)",
        }}
      >
        <span
          className="grid place-items-center h-8 w-8 rounded-lg text-base shrink-0 border"
          style={{
            backgroundColor: "white",
            borderColor: "var(--color-border)",
          }}
        >
          {emoji}
        </span>
        <h2
          className="text-base font-bold tracking-tight"
          style={{ color: "var(--color-text)" }}
        >
          {title}
        </h2>
        {badge && (
          <span
            className="ml-1 rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
            style={{ backgroundColor: badgeColor ?? "var(--color-accent)" }}
          >
            {badge}
          </span>
        )}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div
      className="px-5 py-8 flex items-center gap-3 text-sm"
      style={{ color: "var(--color-muted)" }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
        aria-hidden
      />
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
      <div
        className="mx-auto mb-3 grid place-items-center h-14 w-14 rounded-full text-2xl"
        style={{ backgroundColor: "var(--color-surface-alt)" }}
      >
        {emoji}
      </div>
      <div className="font-semibold" style={{ color: "var(--color-text)" }}>
        {title}
      </div>
      <p className="text-sm mt-1 max-w-md mx-auto" style={{ color: "var(--color-muted)" }}>
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
