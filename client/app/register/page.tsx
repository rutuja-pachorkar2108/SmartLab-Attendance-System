"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, type Role } from "@/lib/auth";

type DepartmentOption = { id: number; name: string };
type CourseOption = { id: number; code: string; name: string; department_id: number | null };

const ROLES: { value: Role; label: string; emoji: string; tint: string }[] = [
  {
    value: "student",
    label: "Student",
    emoji: "🎓",
    tint: "from-violet-100 to-fuchsia-100 border-violet-300",
  },
  {
    value: "incharge",
    label: "Course Incharge",
    emoji: "📚",
    tint: "from-amber-100 to-orange-100 border-amber-300",
  },
  {
    value: "ta",
    label: "Technical Assistant",
    emoji: "🛠️",
    tint: "from-sky-100 to-cyan-100 border-sky-300",
  },
];

const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,59}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PRN_RE = /^\d{10,15}$/;
const ROLL_RE = /^[A-Za-z0-9-]{1,20}$/;
const EMP_RE = /^[A-Za-z0-9-]{2,20}$/;
const DIV_RE = /^[A-Za-z]$/;
const PW_UPPER = /[A-Z]/;
const PW_LOWER = /[a-z]/;
const PW_DIGIT = /\d/;
const PW_SPECIAL = /[^A-Za-z0-9]/;

type FieldKey =
  | "name"
  | "email"
  | "password"
  | "department"
  | "className"
  | "div"
  | "prnNo"
  | "rollNo"
  | "employeeId"
  | "courses";

export default function RegisterPage() {
  const router = useRouter();
  const { register, user, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [rollNo, setRollNo] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [department, setDepartment] = useState("");
  const [className, setClassName] = useState("");
  const [div, setDiv] = useState("");
  const [prnNo, setPrnNo] = useState("");
  const [courses, setCourses] = useState<string[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([]);
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    let cancelled = false;
    api<{ departments: DepartmentOption[] }>("/api/departments")
      .then((d) => {
        if (!cancelled) setDepartmentOptions(d.departments);
      })
      .catch(() => {
        if (!cancelled) setDepartmentOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (role !== "incharge" || !department) {
      setCourseOptions([]);
      return;
    }
    let cancelled = false;
    setCoursesLoading(true);
    api<{ courses: CourseOption[] }>(
      `/api/courses/catalog?department=${encodeURIComponent(department)}`
    )
      .then((d) => {
        if (!cancelled) setCourseOptions(d.courses);
      })
      .catch(() => {
        if (!cancelled) setCourseOptions([]);
      })
      .finally(() => {
        if (!cancelled) setCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, department]);

  useEffect(() => {
    setCourses((sel) =>
      sel.filter((s) => courseOptions.some((c) => c.name === s))
    );
  }, [courseOptions]);

  const errors = useMemo<Partial<Record<FieldKey, string>>>(() => {
    const e: Partial<Record<FieldKey, string>> = {};

    const trimmedName = name.trim();
    if (!trimmedName) e.name = "Full name is required";
    else if (!NAME_RE.test(trimmedName))
      e.name = "Use 2–60 letters; only letters, spaces, . ' - allowed";

    const trimmedEmail = email.trim();
    if (!trimmedEmail) e.email = "Email is required";
    else if (!EMAIL_RE.test(trimmedEmail)) e.email = "Enter a valid email address";

    if (!password) e.password = "Password is required";
    else if (password.length < 8) e.password = "Must be at least 8 characters";
    else if (password.length > 64) e.password = "Must be at most 64 characters";
    else if (!PW_UPPER.test(password)) e.password = "Add an uppercase letter";
    else if (!PW_LOWER.test(password)) e.password = "Add a lowercase letter";
    else if (!PW_DIGIT.test(password)) e.password = "Add a number";
    else if (!PW_SPECIAL.test(password)) e.password = "Add a special character";

    if (role === "student") {
      if (!department) e.department = "Select a department";
      if (!className) e.className = "Select a class";
      if (!prnNo.trim()) e.prnNo = "PRN is required";
      else if (!PRN_RE.test(prnNo.trim()))
        e.prnNo = "PRN must be 10–15 digits";
      if (div && !DIV_RE.test(div.trim()))
        e.div = "Division must be a single letter (A–Z)";
      if (rollNo && !ROLL_RE.test(rollNo.trim()))
        e.rollNo = "1–20 chars, letters/digits/hyphen only";
    } else if (role === "incharge") {
      if (!department) e.department = "Select a department";
      if (courses.length === 0) e.courses = "Pick at least one course";
      if (!employeeId.trim()) e.employeeId = "College / Employee ID is required";
      else if (!EMP_RE.test(employeeId.trim()))
        e.employeeId = "2–20 chars, letters/digits/hyphen only";
    } else {
      if (!employeeId.trim()) e.employeeId = "Employee ID is required";
      else if (!EMP_RE.test(employeeId.trim()))
        e.employeeId = "2–20 chars, letters/digits/hyphen only";
    }

    return e;
  }, [name, email, password, role, department, className, prnNo, div, rollNo, employeeId, courses]);

  const showErr = (k: FieldKey) =>
    (touched[k] || submitAttempted) && errors[k] ? errors[k] : null;

  const markTouched = (k: FieldKey) => setTouched((t) => ({ ...t, [k]: true }));

  const inputCls = (k: FieldKey) =>
    `w-full rounded-2xl border-2 bg-white px-4 py-3 text-sm placeholder:text-violet-300 focus:outline-none transition ${
      showErr(k)
        ? "border-rose-300 focus:border-rose-400"
        : "border-violet-100 focus:border-violet-400"
    }`;

  const selectCls = (k: FieldKey) =>
    `${inputCls(k)} appearance-none bg-no-repeat bg-[length:1.25rem] bg-[right_0.875rem_center] pr-10`;

  const chevronBg = {
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%237c3aed'><path fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z' clip-rule='evenodd'/></svg>\")",
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    setError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        rollNo: role === "student" ? rollNo.trim() || undefined : undefined,
        employeeId: role !== "student" ? employeeId.trim() : undefined,
        department:
          role === "student" || role === "incharge" ? department : undefined,
        className: role === "student" ? className : undefined,
        div: role === "student" ? div.trim().toUpperCase() || undefined : undefined,
        prnNo: role === "student" ? prnNo.trim() : undefined,
        courses: role === "incharge" ? courses : undefined,
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ backgroundColor: "#c4b0e3" }}
    >
      <div className="w-full max-w-lg">
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
            Create your account
          </h1>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="bg-white/80 backdrop-blur rounded-3xl p-8 shadow-[0_20px_60px_-20px_rgba(124,58,237,0.25)] border border-white space-y-5"
        >
          <div>
            <label className="text-sm font-medium text-violet-900 mb-2 block">
              I am a…
            </label>
            <div className="grid grid-cols-3 gap-3">
              {ROLES.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  className={`rounded-2xl p-4 border-2 text-center transition ${
                    role === r.value
                      ? `bg-gradient-to-br ${r.tint} shadow-md`
                      : "bg-white border-violet-100 hover:border-violet-200"
                  }`}
                >
                  <div className="text-2xl mb-1">{r.emoji}</div>
                  <div className="text-xs font-semibold text-violet-950 leading-tight">
                    {r.label}
                  </div>
                </button>
              ))}
            </div>
            {role !== "student" ? (
              <p className="text-xs text-violet-500 mt-2">
                Enter the Employee ID assigned to you by the admin. Registration
                only works if your ID is on the staff roster.
              </p>
            ) : null}
          </div>

          {role === "student" ? (
            <>
              <FieldShell label="Department" error={showErr("department")}>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  onBlur={() => markTouched("department")}
                  className={selectCls("department")}
                  style={chevronBg}
                  aria-invalid={!!showErr("department")}
                >
                  <option value="" disabled>
                    {departmentOptions.length === 0
                      ? "No departments yet — contact admin"
                      : "Select department"}
                  </option>
                  {departmentOptions.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <div className="grid sm:grid-cols-2 gap-3">
                <FieldShell label="Class" error={showErr("className")}>
                  <select
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    onBlur={() => markTouched("className")}
                    className={selectCls("className")}
                    style={chevronBg}
                    aria-invalid={!!showErr("className")}
                  >
                    <option value="" disabled>
                      Select class
                    </option>
                    <option value="FE">FE</option>
                    <option value="SE">SE</option>
                    <option value="TE">TE</option>
                    <option value="BE">BE</option>
                  </select>
                </FieldShell>

                <FieldShell
                  label="Div"
                  hint="(optional)"
                  error={showErr("div")}
                >
                  <input
                    value={div}
                    onChange={(e) =>
                      setDiv(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase())
                    }
                    onBlur={() => markTouched("div")}
                    placeholder="A"
                    maxLength={1}
                    className={inputCls("div")}
                    aria-invalid={!!showErr("div")}
                  />
                </FieldShell>
              </div>

              <FieldShell label="PRN no." error={showErr("prnNo")}>
                <input
                  inputMode="numeric"
                  value={prnNo}
                  onChange={(e) => setPrnNo(e.target.value.replace(/\D/g, "").slice(0, 15))}
                  onBlur={() => markTouched("prnNo")}
                  placeholder="74200xxxxxx"
                  className={inputCls("prnNo")}
                  aria-invalid={!!showErr("prnNo")}
                />
              </FieldShell>

              <FieldShell label="Full name" error={showErr("name")}>
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => markTouched("name")}
                  placeholder="Aqil Ahmed"
                  maxLength={60}
                  className={inputCls("name")}
                  aria-invalid={!!showErr("name")}
                />
              </FieldShell>

              <FieldShell label="Email" error={showErr("email")}>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                  placeholder="you@col.edu"
                  maxLength={254}
                  className={inputCls("email")}
                  aria-invalid={!!showErr("email")}
                />
              </FieldShell>

              <FieldShell
                label="Roll number"
                hint="(optional)"
                error={showErr("rollNo")}
              >
                <input
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value.toUpperCase().slice(0, 20))}
                  onBlur={() => markTouched("rollNo")}
                  placeholder="22BCE001"
                  className={inputCls("rollNo")}
                  aria-invalid={!!showErr("rollNo")}
                />
              </FieldShell>

              <PasswordField
                value={password}
                onChange={setPassword}
                onBlur={() => markTouched("password")}
                show={showPassword}
                onToggle={() => setShowPassword((s) => !s)}
                error={showErr("password")}
                autoComplete="new-password"
              />

              <PasswordStrength password={password} />
            </>
          ) : role === "incharge" ? (
            <>
              <FieldShell label="Department" error={showErr("department")}>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  onBlur={() => markTouched("department")}
                  className={selectCls("department")}
                  style={chevronBg}
                  aria-invalid={!!showErr("department")}
                >
                  <option value="" disabled>
                    {departmentOptions.length === 0
                      ? "No departments yet — contact admin"
                      : "Select department"}
                  </option>
                  {departmentOptions.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell label="Courses" error={showErr("courses")}>
                <MultiSelect
                  options={courseOptions.map((c) => c.name)}
                  selected={courses}
                  onChange={setCourses}
                  onBlur={() => markTouched("courses")}
                  invalid={!!showErr("courses")}
                  placeholder={
                    !department
                      ? "Pick a department first"
                      : coursesLoading
                        ? "Loading courses…"
                        : courseOptions.length === 0
                          ? "No courses for this department — contact admin"
                          : "Select courses you teach"
                  }
                  disabled={!department || coursesLoading || courseOptions.length === 0}
                />
              </FieldShell>

              <FieldShell label="Full name" error={showErr("name")}>
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => markTouched("name")}
                  placeholder="Prof. R. Roy"
                  maxLength={60}
                  className={inputCls("name")}
                  aria-invalid={!!showErr("name")}
                />
              </FieldShell>

              <FieldShell
                label="College / Employee ID"
                error={showErr("employeeId")}
              >
                <input
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value.toUpperCase().slice(0, 20))}
                  onBlur={() => markTouched("employeeId")}
                  placeholder="E101"
                  className={inputCls("employeeId")}
                  aria-invalid={!!showErr("employeeId")}
                />
              </FieldShell>

              <FieldShell label="Email" error={showErr("email")}>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                  placeholder="you@col.edu"
                  maxLength={254}
                  className={inputCls("email")}
                  aria-invalid={!!showErr("email")}
                />
              </FieldShell>

              <PasswordField
                value={password}
                onChange={setPassword}
                onBlur={() => markTouched("password")}
                show={showPassword}
                onToggle={() => setShowPassword((s) => !s)}
                error={showErr("password")}
                autoComplete="new-password"
              />

              <PasswordStrength password={password} />
            </>
          ) : (
            <>
              <FieldShell label="Full name" error={showErr("name")}>
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => markTouched("name")}
                  placeholder="Aqil Ahmed"
                  maxLength={60}
                  className={inputCls("name")}
                  aria-invalid={!!showErr("name")}
                />
              </FieldShell>

              <div className="grid sm:grid-cols-2 gap-3">
                <FieldShell label="Email" error={showErr("email")}>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => markTouched("email")}
                    placeholder="you@col.edu"
                    maxLength={254}
                    className={inputCls("email")}
                    aria-invalid={!!showErr("email")}
                  />
                </FieldShell>
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  onBlur={() => markTouched("password")}
                  show={showPassword}
                  onToggle={() => setShowPassword((s) => !s)}
                  error={showErr("password")}
                  autoComplete="new-password"
                />
              </div>

              <PasswordStrength password={password} />

              <FieldShell label="Employee ID" error={showErr("employeeId")}>
                <input
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value.toUpperCase().slice(0, 20))}
                  onBlur={() => markTouched("employeeId")}
                  placeholder="E101"
                  className={inputCls("employeeId")}
                  aria-invalid={!!showErr("employeeId")}
                />
              </FieldShell>
            </>
          )}

          {error && (
            <div className="rounded-2xl bg-rose-50 border-2 border-rose-100 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white font-semibold py-3 text-sm shadow-lg shadow-violet-500/30 disabled:opacity-50 transition active:scale-[0.98]"
          >
            {submitting ? "Creating account…" : "Let's go ✨"}
          </button>

          <p className="text-center text-sm text-violet-700/70">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-fuchsia-600 hover:text-fuchsia-700">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

function FieldShell({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-violet-900">
        {label}
        {hint ? (
          <span className="text-violet-400 font-normal"> {hint}</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-rose-600 mt-1">{error}</p>
      ) : null}
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  onBlur,
  show,
  onToggle,
  error,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  show: boolean;
  onToggle: () => void;
  error: string | null;
  autoComplete: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-violet-900">Password</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="••••••••"
          maxLength={64}
          className={`w-full rounded-2xl border-2 bg-white pl-4 pr-11 py-3 text-sm placeholder:text-violet-300 focus:outline-none transition ${
            error
              ? "border-rose-300 focus:border-rose-400"
              : "border-violet-100 focus:border-violet-400"
          }`}
          aria-invalid={!!error}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-violet-500 hover:text-violet-700 transition"
        >
          <EyeIcon open={show} />
        </button>
      </div>
      {error ? <p className="text-xs text-rose-600 mt-1">{error}</p> : null}
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

function MultiSelect({
  options,
  selected,
  onChange,
  onBlur,
  invalid,
  placeholder,
  disabled = false,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  onBlur: () => void;
  invalid: boolean;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
        onBlur();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onBlur]);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter((s) => s !== opt));
    else onChange([...selected, opt]);
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} courses selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`w-full rounded-2xl border-2 px-4 py-3 text-sm text-left focus:outline-none transition flex items-center justify-between gap-2 ${
          disabled
            ? "bg-violet-50 border-violet-100 cursor-not-allowed"
            : "bg-white"
        } ${
          invalid
            ? "border-rose-300 focus:border-rose-400"
            : "border-violet-100 focus:border-violet-400"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid}
      >
        <span className={selected.length === 0 ? "text-violet-300" : "text-violet-950"}>
          {summary}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="#7c3aed"
          className={`h-5 w-5 shrink-0 transition ${open ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-800 text-xs font-medium px-2.5 py-1"
            >
              {s}
              <button
                type="button"
                onClick={() => toggle(s)}
                aria-label={`Remove ${s}`}
                className="text-violet-500 hover:text-violet-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          role="listbox"
          className="absolute z-10 mt-2 w-full max-h-64 overflow-auto rounded-2xl border-2 border-violet-100 bg-white shadow-lg p-1"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-violet-400">No options available</div>
          ) : (
            options.map((opt) => {
              const checked = selected.includes(opt);
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-violet-950 hover:bg-violet-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(opt)}
                    className="h-4 w-4 accent-violet-500"
                  />
                  <span>{opt}</span>
                </label>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    { ok: password.length >= 8, label: "8+ characters" },
    { ok: PW_UPPER.test(password), label: "uppercase" },
    { ok: PW_LOWER.test(password), label: "lowercase" },
    { ok: PW_DIGIT.test(password), label: "number" },
    { ok: PW_SPECIAL.test(password), label: "special" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5 -mt-2">
      {checks.map((c) => (
        <span
          key={c.label}
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            c.ok
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-violet-50 text-violet-500 border-violet-100"
          }`}
        >
          {c.ok ? "✓" : "•"} {c.label}
        </span>
      ))}
    </div>
  );
}
