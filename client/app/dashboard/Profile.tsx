"use client";

import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const CLASS_OPTIONS = ["FE", "SE", "TE", "BE"] as const;

const inputCls =
  "w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)]";
const inputStyle = { borderColor: "var(--color-border)" } as const;

const roleLabel: Record<string, string> = {
  student: "Student",
  incharge: "Course Incharge",
  ta: "Technical Assistant",
  admin: "Administrator",
};

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  const isStudent = user.role === "student";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ backgroundColor: "rgba(33,8,61,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-lg overflow-hidden shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-6 py-5 flex items-center gap-4 text-white"
          style={{
            background:
              "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 60%, var(--color-accent) 100%)",
          }}
        >
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold border-2 border-white/40"
            style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
          >
            {user.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold tracking-tight truncate">
              {user.name}
            </div>
            <div className="text-sm text-violet-100">
              {roleLabel[user.role] ?? user.role}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-lg leading-none text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            ✕
          </button>
        </div>

        {editing ? (
          <EditForm
            isStudent={isStudent}
            initial={{
              name: user.name,
              email: user.email,
              className: user.class_name ?? "",
              div: user.div ?? "",
              rollNo: user.roll_no ?? "",
            }}
            onCancel={() => setEditing(false)}
            onSave={async (input) => {
              await updateProfile(input);
              setEditing(false);
            }}
          />
        ) : (
          <div className="p-6 space-y-1">
            <Row label="Full name" value={user.name} />
            <Row label="Email" value={user.email} />
            <Row label="Role" value={roleLabel[user.role] ?? user.role} />
            {isStudent && (
              <>
                <Row label="PRN no." value={user.prn_no} locked />
                <Row label="Department" value={user.department} locked />
                <Row label="Class / Year" value={user.class_name} />
                <Row label="Division" value={user.div} />
                <Row label="Roll number" value={user.roll_no} />
              </>
            )}
            {(user.role === "incharge" || user.role === "ta") && (
              <>
                <Row label="Employee ID" value={user.employee_id} locked />
                <Row label="Department" value={user.department} locked />
              </>
            )}
            {user.role === "incharge" && (
              <Row
                label="Courses"
                locked
                value={
                  user.incharge_courses?.length ? (
                    <ul className="flex flex-col items-end gap-1">
                      {user.incharge_courses.map((c) => (
                        <li
                          key={c}
                          className="rounded-md px-2 py-0.5 text-xs font-semibold"
                          style={{
                            backgroundColor: "rgba(124,58,237,0.10)",
                            color: "var(--color-primary)",
                          }}
                        >
                          {c}
                        </li>
                      ))}
                    </ul>
                  ) : null
                }
              />
            )}
            {user.created_at && (
              <Row
                label="Member since"
                value={new Date(user.created_at).toLocaleDateString()}
                locked
              />
            )}

            <div className="pt-4 flex justify-end">
              <button
                onClick={() => setEditing(true)}
                className="rounded-md px-5 py-2 text-sm font-bold text-white shadow-sm transition active:scale-[0.98]"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                Edit profile
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditForm({
  isStudent,
  initial,
  onCancel,
  onSave,
}: {
  isStudent: boolean;
  initial: {
    name: string;
    email: string;
    className: string;
    div: string;
    rollNo: string;
  };
  onCancel: () => void;
  onSave: (input: {
    name?: string;
    email?: string;
    className?: string;
    div?: string;
    rollNo?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [className, setClassName] = useState(initial.className);
  const [div, setDiv] = useState(initial.div);
  const [rollNo, setRollNo] = useState(initial.rollNo);
  const [changePw, setChangePw] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Name cannot be empty");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
      return setError("Enter a valid email address");
    if (changePw) {
      if (!currentPassword) return setError("Enter your current password");
      if (newPassword.length < 8)
        return setError("New password must be at least 8 characters");
    }

    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim(),
        className: isStudent ? className || undefined : undefined,
        div: isStudent ? div.trim().toUpperCase() || undefined : undefined,
        rollNo: isStudent ? rollNo.trim() || undefined : undefined,
        currentPassword: changePw ? currentPassword : undefined,
        newPassword: changePw ? newPassword : undefined,
      });
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Could not save changes"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-6 space-y-4">
      <Field label="Full name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className={inputCls}
          style={inputStyle}
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          className={inputCls}
          style={inputStyle}
        />
      </Field>

      {isStudent && (
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Class / Year">
            <select
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className={inputCls}
              style={inputStyle}
            >
              <option value="">—</option>
              {CLASS_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Division">
            <input
              value={div}
              onChange={(e) =>
                setDiv(
                  e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase()
                )
              }
              maxLength={1}
              placeholder="A"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <Field label="Roll number">
            <input
              value={rollNo}
              onChange={(e) => setRollNo(e.target.value.toUpperCase().slice(0, 20))}
              placeholder="22BCE001"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
        </div>
      )}

      <div
        className="rounded-md border p-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer" style={{ color: "var(--color-text)" }}>
          <input
            type="checkbox"
            checked={changePw}
            onChange={(e) => setChangePw(e.target.checked)}
            className="h-4 w-4"
            style={{ accentColor: "var(--color-primary)" }}
          />
          Change password
        </label>
        {changePw && (
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            <Field label="Current password">
              <PasswordInput
                value={currentPassword}
                onChange={setCurrentPassword}
                show={showCurrent}
                onToggle={() => setShowCurrent((s) => !s)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password">
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                show={showNew}
                onToggle={() => setShowNew((s) => !s)}
                autoComplete="new-password"
              />
            </Field>
          </div>
        )}
      </div>

      {error && (
        <div
          className="rounded-md px-3 py-2 text-sm border"
          style={{
            backgroundColor: "#fdecea",
            borderColor: "#f5c6cb",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border px-4 py-2 text-sm font-bold transition hover:bg-violet-50 disabled:opacity-50"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md px-5 py-2 text-sm font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  locked,
}: {
  label: string;
  value: ReactNode;
  locked?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div
      className="flex items-start justify-between gap-4 py-2 border-b"
      style={{ borderColor: "var(--color-border)" }}
    >
      <span
        className="text-xs font-bold uppercase tracking-wider shrink-0 pt-0.5"
        style={{ color: "var(--color-muted)" }}
      >
        {label}
      </span>
      <div
        className="text-sm font-semibold text-right break-words flex items-start justify-end gap-1.5"
        style={{ color: empty ? "var(--color-muted)" : "var(--color-text)" }}
      >
        <div>{empty ? "—" : value}</div>
        {locked && (
          <span
            className="shrink-0"
            title="Set at registration — contact admin to change"
          >
            🔒
          </span>
        )}
      </div>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
}) {
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className={`${inputCls} pr-10`}
        style={inputStyle}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-violet-400 hover:text-violet-700 transition"
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: "var(--color-muted)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
