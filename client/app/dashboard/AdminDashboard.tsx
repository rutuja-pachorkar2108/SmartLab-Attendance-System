"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { parseCsv, rowsToRecords } from "@/lib/csv";
import { downloadXlsx, parseXlsxFile } from "@/lib/xlsx";
import { useAutoDismiss } from "@/lib/useTimedErrors";
import { usePagination } from "@/lib/usePagination";
import { DashTabs, type TabDef } from "./Tabs";

type Role = "student" | "incharge" | "ta" | "admin";

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
  created_at: string;
};

type Course = {
  id: number;
  code: string;
  name: string;
  incharge_id: number | null;
  incharge_name?: string | null;
  incharge_email?: string | null;
  department_id: number | null;
  department_name?: string | null;
  lab_id: number | null;
  lab_name?: string | null;
  lab_room_no?: string | null;
  created_at: string;
};

type Department = {
  id: number;
  name: string;
};

// A course from the department catalog (seeded or admin-created), used to
// populate the course picker in the New-practical form.
type CatalogCourse = {
  id: number;
  code: string;
  name: string;
  department_id: number | null;
};

const ADD_NEW_COURSE = "__new__";

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  roll_no: string | null;
  employee_id: string | null;
  created_at: string;
};

const cardCls =
  "bg-white border rounded-lg overflow-hidden shadow-[0_4px_16px_-4px_rgba(58,11,109,0.25)]";
const cardStyle = { borderColor: "var(--color-border)" } as const;
const stripeStyle = (color: string) => ({ height: 5, backgroundColor: color });

const inputCls =
  "w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--color-primary)]";
const inputStyle = { borderColor: "var(--color-border)" } as const;

const primaryBtnCls =
  "rounded-md px-4 py-2 text-sm font-bold text-white shadow-sm transition disabled:opacity-50 active:scale-[0.98]";
const primaryBtnStyle = { backgroundColor: "var(--color-primary)" } as const;

type Tab =
  | "new-lab"
  | "labs"
  | "departments"
  | "new-practical"
  | "practicals"
  | "users"
  | "student-access"
  | "staff-access";

const ADMIN_TABS: TabDef<Tab>[] = [
  { id: "new-lab", emoji: "✨", label: "New Lab" },
  { id: "labs", emoji: "🏢", label: "Labs" },
  { id: "departments", emoji: "🏛️", label: "Departments" },
  { id: "new-practical", emoji: "➕", label: "New Practical" },
  { id: "practicals", emoji: "📘", label: "Practicals" },
  { id: "users", emoji: "👥", label: "Users" },
  { id: "student-access", emoji: "🎓", label: "Student Enrollment" },
  { id: "staff-access", emoji: "🧑‍🏫", label: "Staff Enrollment" },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("labs");

  return (
    <div className="space-y-4">
      <section
        className="rounded-lg p-6 text-white shadow-lg"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 50%, var(--color-accent) 100%)",
        }}
      >
        <div className="text-4xl">🛡️</div>
        <h1 className="text-2xl font-bold mt-2 tracking-tight">Administrator</h1>
        <p className="text-violet-100 mt-1 text-sm">
          Head Incharge — manage labs, practicals, users and registration access.
        </p>
      </section>

      <DashTabs tabs={ADMIN_TABS} active={tab} onChange={setTab} />

      <div className="min-w-0 space-y-6">
        {/* LabsTab owns the shared lab state; keep one instance mounted across
            its two cards (New Lab form + Labs list) so editing carries over. */}
        {(tab === "new-lab" || tab === "labs") && (
          <LabsTab tab={tab} setTab={setTab} />
        )}
        {/* CoursesTab owns shared course/department state across its three cards. */}
        {(tab === "departments" ||
          tab === "new-practical" ||
          tab === "practicals") && <CoursesTab tab={tab} setTab={setTab} />}
        {tab === "users" && <UsersTab />}
        {tab === "student-access" && <StudentAccessTab />}
        {tab === "staff-access" && <StaffAccessTab />}
      </div>
    </div>
  );
}

// ---------- LABS TAB ----------

function LabsTab({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [tas, setTas] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);
  const [editing, setEditing] = useState<Lab | null>(null);
  const [viewing, setViewing] = useState<Lab | null>(null);
  const {
    visible: visibleLabs,
    filterBox: labsFilter,
    controls: labsControls,
  } = usePagination(labs, {
    searchText: (l) => `${l.room_no} ${l.name} ${l.department ?? ""} ${l.floor ?? ""}`,
    searchPlaceholder: "Filter labs…",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [labData, taData, deptData] = await Promise.all([
        api<{ labs: Lab[] }>("/api/labs"),
        api<{ users: AdminUser[] }>("/api/users?role=ta"),
        api<{ departments: Department[] }>("/api/departments"),
      ]);
      setLabs(labData.labs);
      setTas(taData.users);
      setDepartments(deptData.departments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function remove(id: number) {
    if (!confirm("Delete this lab? Any check-in history for it will be removed.")) return;
    try {
      await api(`/api/labs/${id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function quickAssignTa(labId: number, taId: number | null) {
    setError(null);
    try {
      await api(`/api/labs/${labId}`, {
        method: "PATCH",
        body: JSON.stringify({ taId }),
      });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Assignment failed");
    }
  }

  return (
    <>
      {error && <ErrorBox msg={error} />}

      {tab === "new-lab" && (
      <LabForm
        editing={editing}
        tas={tas}
        departments={departments}
        onCancel={() => {
          setEditing(null);
          setTab("labs");
        }}
        onSaved={() => {
          setEditing(null);
          refresh();
          setTab("labs");
        }}
      />
      )}

      {tab === "labs" && (
      <Section title="Labs" emoji="🏢" badge={labs.length ? `${labs.length}` : null}>
        {labs.length > 0 && <div className="px-5 pt-4">{labsFilter}</div>}
        {loading ? (
          <Loading />
        ) : labs.length === 0 ? (
          <Empty
            emoji="📭"
            title="No labs yet"
            sub="Create one using the form above."
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface-alt)" }}>
                <Th>Room</Th>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Floor</Th>
                <Th align="right">PCs</Th>
                <Th>Assigned TA</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visibleLabs.map((l, i) => (
                <tr
                  key={l.id}
                  style={{
                    backgroundColor:
                      i % 2 === 0 ? "white" : "var(--color-surface-alt)",
                  }}
                >
                  <Td mono>{l.room_no}</Td>
                  <Td bold>{l.name}</Td>
                  <Td muted>{l.department ?? "—"}</Td>
                  <Td muted>{l.floor ?? "—"}</Td>
                  <Td align="right">{l.pc_count}</Td>
                  <Td>
                    <select
                      value={l.ta_id ?? ""}
                      onChange={(e) =>
                        quickAssignTa(
                          l.id,
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                      className="w-full max-w-[12rem] rounded-md border bg-white px-2 py-1 text-xs outline-none"
                      style={inputStyle}
                    >
                      <option value="">— Unassigned —</option>
                      {tas.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.employee_id ?? t.email})
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td align="right">
                    <ActionRow
                      onView={() => setViewing(l)}
                      onEdit={() => {
                        setEditing(l);
                        setTab("new-lab");
                      }}
                      onDelete={() => remove(l.id)}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {labsControls}
          </div>
        )}
      </Section>
      )}

      {viewing && <LabViewModal lab={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function LabViewModal({ lab, onClose }: { lab: Lab; onClose: () => void }) {
  return (
    <Modal title={`Lab — ${lab.name}`} onClose={onClose}>
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <DtDd label="Room number" value={lab.room_no} mono />
        <DtDd label="Name" value={lab.name} />
        <DtDd label="Department" value={lab.department ?? "—"} />
        <DtDd label="Floor" value={lab.floor ?? "—"} />
        <DtDd label="PC count" value={`${lab.pc_count} PCs`} />
        <DtDd
          label="Assigned TA"
          value={
            lab.ta_name
              ? `${lab.ta_name} (${lab.ta_email})`
              : "— Unassigned —"
          }
        />
        <DtDd
          label="Created at"
          value={new Date(lab.created_at).toLocaleString()}
          muted
        />
      </dl>
    </Modal>
  );
}

function LabForm({
  editing,
  tas,
  departments,
  onCancel,
  onSaved,
}: {
  editing: Lab | null;
  tas: AdminUser[];
  departments: Department[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [department, setDepartment] = useState("");
  const [floor, setFloor] = useState("");
  const [pcCount, setPcCount] = useState("");
  const [taId, setTaId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);
  const formRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setRoomNo(editing.room_no);
      setDepartment(editing.department ?? "");
      setFloor(editing.floor ?? "");
      setPcCount(String(editing.pc_count));
      setTaId(editing.ta_id !== null ? String(editing.ta_id) : "");
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setName("");
      setRoomNo("");
      setDepartment("");
      setFloor("");
      setPcCount("");
      setTaId("");
    }
    setError(null);
  }, [editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        name,
        roomNo,
        department: department || null,
        floor: floor || null,
        pcCount: pcCount === "" ? 0 : Number(pcCount),
        taId: taId === "" ? null : Number(taId),
      };
      if (editing) {
        await api(`/api/labs/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/labs", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={formRef} className="scroll-mt-6">
    <Section title={editing ? "Edit Lab" : "New Lab"} emoji={editing ? "✏️" : "✨"}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Lab name *">
            <input
              required
              className={inputCls}
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Computer Lab 1"
            />
          </Field>
          <Field label="Room number *">
            <input
              required
              className={inputCls}
              style={inputStyle}
              value={roomNo}
              onChange={(e) => setRoomNo(e.target.value)}
              placeholder="e.g. 301"
            />
          </Field>
          <Field label="Department">
            <select
              className={inputCls}
              style={inputStyle}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
              {/* Preserve a legacy free-text value not in the departments list */}
              {department && !departments.some((d) => d.name === department) && (
                <option value={department}>{department}</option>
              )}
            </select>
          </Field>
          <Field label="Floor">
            <input
              className={inputCls}
              style={inputStyle}
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="e.g. 3rd"
            />
          </Field>
          <Field label="PC count">
            <input
              type="number"
              min={0}
              className={inputCls}
              style={inputStyle}
              value={pcCount}
              onChange={(e) => setPcCount(e.target.value)}
              placeholder="e.g. 30"
            />
          </Field>
          <Field label="Assigned Teaching Assistant">
            <select
              className={inputCls}
              style={inputStyle}
              value={taId}
              onChange={(e) => setTaId(e.target.value)}
            >
              <option value="">— Unassigned —</option>
              {tas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.employee_id ?? t.email})
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error && <ErrorBox msg={error} />}

        <div className="flex gap-2 justify-end">
          {editing && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border px-4 py-2 text-sm font-bold transition"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-primary)",
              }}
            >
              Cancel
            </button>
          )}
          <button disabled={busy} className={primaryBtnCls} style={primaryBtnStyle}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create lab"}
          </button>
        </div>
      </form>
    </Section>
    </div>
  );
}

// ---------- COURSES TAB ----------

function CoursesTab({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [incharges, setIncharges] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);
  const [editing, setEditing] = useState<Course | null>(null);
  const [viewing, setViewing] = useState<Course | null>(null);
  const {
    visible: visibleCourses,
    filterBox: coursesFilter,
    controls: coursesControls,
  } = usePagination(courses, {
    searchText: (c) =>
      `${c.code} ${c.name} ${c.department_name ?? ""} ${c.lab_name ?? ""} ${c.incharge_name ?? ""}`,
    searchPlaceholder: "Filter practicals…",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [courseData, inchargeData, deptData, labData] = await Promise.all([
        api<{ courses: Course[] }>("/api/courses"),
        api<{ users: AdminUser[] }>("/api/users?role=incharge"),
        api<{ departments: Department[] }>("/api/departments"),
        api<{ labs: Lab[] }>("/api/labs"),
      ]);
      setCourses(courseData.courses);
      setIncharges(inchargeData.users);
      setDepartments(deptData.departments);
      setLabs(labData.labs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function remove(id: number) {
    if (
      !confirm(
        "Delete this practical/course? All scheduled sessions, enrollments, and attendance records will be removed."
      )
    )
      return;
    try {
      await api(`/api/courses/${id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function reassignIncharge(courseId: number, inchargeId: number) {
    setError(null);
    try {
      await api(`/api/courses/${courseId}`, {
        method: "PATCH",
        body: JSON.stringify({ inchargeId }),
      });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reassignment failed");
    }
  }

  return (
    <>
      {error && <ErrorBox msg={error} />}

      {tab === "departments" && (
      <DepartmentsPanel
        departments={departments}
        onChanged={refresh}
        onError={setError}
      />
      )}

      {tab === "new-practical" && (
      <CourseForm
        editing={editing}
        incharges={incharges}
        departments={departments}
        labs={labs}
        onCancel={() => {
          setEditing(null);
          setTab("practicals");
        }}
        onSaved={() => {
          setEditing(null);
          refresh();
          setTab("practicals");
        }}
      />
      )}

      {tab === "practicals" && (
      <Section
        title="Practicals / Courses"
        emoji="📘"
        badge={courses.length ? `${courses.length}` : null}
      >
        {courses.length > 0 && <div className="px-5 pt-4">{coursesFilter}</div>}
        {loading ? (
          <Loading />
        ) : courses.length === 0 ? (
          <Empty
            emoji="📭"
            title="No practicals yet"
            sub="Create a practical above. Selecting a department makes it available in the incharge registration dropdown."
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface-alt)" }}>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Lab</Th>
                <Th>Assigned Course Incharge</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visibleCourses.map((c, i) => (
                <tr
                  key={c.id}
                  style={{
                    backgroundColor:
                      i % 2 === 0 ? "white" : "var(--color-surface-alt)",
                  }}
                >
                  <Td mono>{c.code}</Td>
                  <Td bold>{c.name}</Td>
                  <Td muted>{c.department_name ?? "—"}</Td>
                  <Td muted>
                    {c.lab_name
                      ? `${c.lab_name}${c.lab_room_no ? ` · ${c.lab_room_no}` : ""}`
                      : "—"}
                  </Td>
                  <Td>
                    <select
                      value={c.incharge_id ?? ""}
                      onChange={(e) =>
                        reassignIncharge(c.id, Number(e.target.value))
                      }
                      className="w-full max-w-[12rem] rounded-md border bg-white px-2 py-1 text-xs outline-none"
                      style={inputStyle}
                    >
                      <option value="">— Unassigned —</option>
                      {incharges.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.employee_id ?? u.email})
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td align="right">
                    <ActionRow
                      onView={() => setViewing(c)}
                      onEdit={() => {
                        setEditing(c);
                        setTab("new-practical");
                      }}
                      onDelete={() => remove(c.id)}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {coursesControls}
          </div>
        )}
      </Section>
      )}

      {viewing && (
        <CourseViewModal course={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  );
}

function DepartmentsPanel({
  departments,
  onChanged,
  onError,
}: {
  departments: Department[];
  onChanged: () => void;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onError(null);
    setBusy(true);
    try {
      await api("/api/departments", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setName("");
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, label: string) {
    if (!confirm(`Delete department "${label}"? Courses linked to it will lose the link.`))
      return;
    onError(null);
    try {
      await api(`/api/departments/${id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <Section
      title="Departments"
      emoji="🏛️"
      badge={departments.length ? `${departments.length}` : null}
    >
      <div className="p-5 space-y-3">
        <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
          <Field label="New department name">
            <input
              className={inputCls}
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Information Technology"
              maxLength={150}
            />
          </Field>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className={primaryBtnCls}
            style={primaryBtnStyle}
          >
            {busy ? "Adding…" : "Add department"}
          </button>
        </form>

        {departments.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No departments yet. Add one above so it appears in the registration form.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {departments.map((d) => (
              <span
                key={d.id}
                className="inline-flex items-center gap-2 rounded-full bg-violet-100 text-violet-800 text-xs font-medium px-3 py-1.5"
              >
                {d.name}
                <button
                  type="button"
                  onClick={() => remove(d.id, d.name)}
                  aria-label={`Delete ${d.name}`}
                  className="text-violet-500 hover:text-rose-600"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

function CourseViewModal({
  course,
  onClose,
}: {
  course: Course;
  onClose: () => void;
}) {
  return (
    <Modal title={`Practical — ${course.code}`} onClose={onClose}>
      <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
        <DtDd label="Course code" value={course.code} mono />
        <DtDd label="Practical name" value={course.name} />
        <DtDd
          label="Course Incharge"
          value={
            course.incharge_name
              ? `${course.incharge_name} (${course.incharge_email})`
              : course.incharge_id
                ? `User #${course.incharge_id}`
                : "Unassigned"
          }
        />
        <DtDd label="Department" value={course.department_name ?? "—"} muted />
        <DtDd
          label="Lab"
          value={
            course.lab_name
              ? `${course.lab_name}${course.lab_room_no ? ` (Room ${course.lab_room_no})` : ""}`
              : "— Not assigned —"
          }
        />
        <DtDd
          label="Created at"
          value={new Date(course.created_at).toLocaleString()}
          muted
        />
      </dl>
    </Modal>
  );
}

function CourseForm({
  editing,
  incharges,
  departments,
  labs,
  onCancel,
  onSaved,
}: {
  editing: Course | null;
  incharges: AdminUser[];
  departments: Department[];
  labs: Lab[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [inchargeId, setInchargeId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [labId, setLabId] = useState<string>("");
  // New-practical flow: pick a course from the department's catalog, or
  // ADD_NEW_COURSE to type a brand-new one.
  const [courseSel, setCourseSel] = useState<string>("");
  const [catalog, setCatalog] = useState<CatalogCourse[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);
  const [notice, setNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const addingNew = courseSel === ADD_NEW_COURSE;
  // Code/name inputs show when editing an existing course or adding a new one.
  const showCourseFields = !!editing || addingNew;

  useEffect(() => {
    if (editing) {
      setCode(editing.code);
      setName(editing.name);
      setInchargeId(editing.incharge_id ? String(editing.incharge_id) : "");
      setDepartmentId(editing.department_id ? String(editing.department_id) : "");
      setLabId(editing.lab_id ? String(editing.lab_id) : "");
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setCode("");
      setName("");
      setInchargeId("");
      setDepartmentId("");
      setLabId("");
      setCourseSel("");
    }
    setError(null);
    setNotice(null);
  }, [editing]);

  // When the admin picks a department (in the New-practical flow), load that
  // department's course catalog so they can choose from it or add a new course.
  useEffect(() => {
    if (editing) return;
    setCourseSel("");
    setCode("");
    setName("");
    if (!departmentId) {
      setCatalog([]);
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    api<{ courses: CatalogCourse[] }>(
      `/api/courses/catalog?department=${encodeURIComponent(departmentId)}`
    )
      .then((d) => {
        if (!cancelled) setCatalog(d.courses);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    // New-practical flow: the admin must pick a department, then either a
    // catalog course or "Add a new course".
    if (!editing) {
      if (!departmentId) {
        setError("Select a department first.");
        return;
      }
      if (!courseSel) {
        setError("Select a course, or choose “Add a new course”.");
        return;
      }
    }

    setBusy(true);
    try {
      if (editing) {
        await api(`/api/courses/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            code,
            name,
            inchargeId: inchargeId === "" ? undefined : Number(inchargeId),
            departmentId: departmentId === "" ? undefined : Number(departmentId),
            // Sent as null (not undefined) so editing can also un-assign a lab.
            labId: labId === "" ? null : Number(labId),
          }),
        });
        onSaved();
      } else if (!addingNew) {
        // Assign an existing catalog course to the chosen incharge / lab.
        await api(`/api/courses/${courseSel}`, {
          method: "PATCH",
          body: JSON.stringify({
            inchargeId: inchargeId === "" ? undefined : Number(inchargeId),
            departmentId: Number(departmentId),
            labId: labId === "" ? null : Number(labId),
          }),
        });
        setNotice("✓ Practical assigned. Incharge and lab updated.");
        onSaved();
      } else {
        // Create a brand-new course not already in the catalog.
        const res = await api<{ autoEnrolled?: number }>("/api/courses", {
          method: "POST",
          body: JSON.stringify({
            code,
            name,
            inchargeId: inchargeId === "" ? undefined : Number(inchargeId),
            departmentId: Number(departmentId),
            labId: labId === "" ? null : Number(labId),
          }),
        });
        const n = res?.autoEnrolled ?? 0;
        setNotice(
          n > 0
            ? `✓ Course created — auto-enrolled ${n} student${n === 1 ? "" : "s"} from the selected department.`
            : "✓ Course created. No students matched the selected department yet — new registrations in that department will need manual enrollment."
        );
        onSaved();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={formRef} className="scroll-mt-6">
    <Section
      title={editing ? "Edit practical" : "New practical"}
      emoji={editing ? "✏️" : "✨"}
    >
      <form onSubmit={submit} className="p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Department *">
            <select
              className={inputCls}
              style={inputStyle}
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">
                {editing ? "— No department —" : "— Select department —"}
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>

          {!editing && (
            <Field label="Course *">
              <select
                className={inputCls}
                style={inputStyle}
                value={courseSel}
                disabled={!departmentId || catalogLoading}
                onChange={(e) => {
                  const v = e.target.value;
                  setCourseSel(v);
                  if (v === ADD_NEW_COURSE) {
                    setCode("");
                    setName("");
                  } else {
                    const c = catalog.find((x) => String(x.id) === v);
                    if (c) {
                      setCode(c.code);
                      setName(c.name);
                    }
                  }
                }}
              >
                <option value="">
                  {!departmentId
                    ? "Select a department first"
                    : catalogLoading
                      ? "Loading courses…"
                      : catalog.length === 0
                        ? "No catalog courses yet — add a new one"
                        : "Select a course"}
                </option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
                <option value={ADD_NEW_COURSE}>➕ Add a new course…</option>
              </select>
            </Field>
          )}

          {showCourseFields && (
            <>
              <Field label="Course code *">
                <input
                  required
                  className={inputCls}
                  style={inputStyle}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. CS-LAB-3"
                />
              </Field>
              <Field label="Practical name *">
                <input
                  required
                  className={inputCls}
                  style={inputStyle}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Database Management Lab"
                />
              </Field>
            </>
          )}

          <Field label="Course Incharge">
            <select
              className={inputCls}
              style={inputStyle}
              value={inchargeId}
              onChange={(e) => setInchargeId(e.target.value)}
            >
              <option value="">— Unassigned —</option>
              {incharges.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.employee_id ?? u.email})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lab (where this practical is held)">
            <select
              className={inputCls}
              style={inputStyle}
              value={labId}
              onChange={(e) => setLabId(e.target.value)}
            >
              <option value="">— No lab —</option>
              {labs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · Room {l.room_no}
                  {l.ta_name ? ` · TA: ${l.ta_name}` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          💡 When a student marks attendance for this practical, it is recorded as
          presence in the selected lab — visible to that lab&apos;s Teaching Assistant.
        </p>

        {error && <ErrorBox msg={error} />}
        {notice && (
          <div
            className="rounded-md px-3 py-2 text-sm border"
            style={{
              backgroundColor: "#ecfdf3",
              borderColor: "#abefc6",
              color: "#067647",
            }}
          >
            {notice}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          {editing && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border px-4 py-2 text-sm font-bold transition"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-primary)",
              }}
            >
              Cancel
            </button>
          )}
          <button disabled={busy} className={primaryBtnCls} style={primaryBtnStyle}>
            {busy
              ? "Saving…"
              : editing
                ? "Save changes"
                : addingNew
                  ? "Create & assign incharge"
                  : "Assign practical"}
          </button>
        </div>
      </form>
    </Section>
    </div>
  );
}

// ---------- USERS TAB ----------

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null);
  const { visible: visibleUsers, controls: usersControls } = usePagination(users);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (q.trim()) params.set("q", q.trim());
      const data = await api<{ users: AdminUser[] }>(
        `/api/users${params.toString() ? `?${params.toString()}` : ""}`
      );
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [roleFilter, q]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function removeUser(u: AdminUser) {
    if (!confirm(`Delete user ${u.name} (${u.email})? This cannot be undone.`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <>
      {error && <ErrorBox msg={error} />}

      <Section title="Users" emoji="👥" badge={users.length ? `${users.length}` : null}>
        <div
          className="px-5 py-3 grid sm:grid-cols-[auto_1fr_auto] gap-2 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
            className={inputCls}
            style={inputStyle}
          >
            <option value="all">All roles</option>
            <option value="student">Students</option>
            <option value="incharge">Course Incharges</option>
            <option value="ta">Teaching Assistants</option>
            <option value="admin">Admins</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email, roll no, or employee ID…"
            className={inputCls}
            style={inputStyle}
          />
          <button
            onClick={refresh}
            className={primaryBtnCls}
            style={primaryBtnStyle}
          >
            Search
          </button>
        </div>

        {loading ? (
          <Loading />
        ) : users.length === 0 ? (
          <Empty
            emoji="📭"
            title="No users match"
            sub="Adjust the role filter or search term."
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface-alt)" }}>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Roll / Emp. ID</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u, i) => (
                <tr
                  key={u.id}
                  style={{
                    backgroundColor:
                      i % 2 === 0 ? "white" : "var(--color-surface-alt)",
                  }}
                >
                  <Td bold>{u.name}</Td>
                  <Td muted>{u.email}</Td>
                  <Td>
                    <RoleBadge role={u.role} />
                  </Td>
                  <Td mono>{u.roll_no ?? u.employee_id ?? "—"}</Td>
                  <Td align="right">
                    <ActionRow
                      onView={() => setViewingUser(u)}
                      onEdit={() => setEditingUser(u)}
                      onDelete={() => removeUser(u)}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {usersControls}
          </div>
        )}
      </Section>

      {viewingUser && (
        <UserViewModal
          user={viewingUser}
          onClose={() => setViewingUser(null)}
          onResetPassword={() => {
            setResetTarget(viewingUser);
            setViewingUser(null);
          }}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={() => setResetTarget(null)}
        />
      )}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function UserViewModal({
  user,
  onClose,
  onResetPassword,
}: {
  user: AdminUser;
  onClose: () => void;
  onResetPassword: () => void;
}) {
  return (
    <Modal title={`User — ${user.name}`} onClose={onClose}>
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <DtDd label="Name" value={user.name} />
        <DtDd label="Email" value={user.email} />
        <DtDd
          label="Role"
          value={<RoleBadge role={user.role} />}
        />
        <DtDd label="Roll number" value={user.roll_no ?? "—"} mono />
        <DtDd label="Employee ID" value={user.employee_id ?? "—"} mono />
        <DtDd
          label="Created at"
          value={new Date(user.created_at).toLocaleString()}
          muted
        />
      </dl>

      <div
        className="mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="text-xs" style={{ color: "var(--color-muted)" }}>
          Need to help this user recover their account?
        </div>
        <button
          onClick={onResetPassword}
          className="rounded-md border px-3 py-1.5 text-xs font-bold transition hover:bg-violet-50"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          🔑 Reset password
        </button>
      </div>
    </Modal>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const color =
    role === "admin"
      ? "var(--color-primary)"
      : role === "incharge"
        ? "var(--color-accent)"
        : role === "ta"
          ? "var(--color-accent-alt, #6d28d9)"
          : "var(--color-muted)";
  return (
    <span
      className="rounded-md px-2 py-0.5 text-xs font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {role}
    </span>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (pw !== pw2) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/users/${user.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: pw }),
      });
      alert(
        `Password reset for ${user.name}. Share the new password with them out-of-band (in person or over a secure channel).`
      );
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Reset password — ${user.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="New password *">
          <input
            type="password"
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="At least 6 characters"
            className={inputCls}
            style={inputStyle}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password *">
          <input
            type="password"
            required
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="Re-enter the new password"
            className={inputCls}
            style={inputStyle}
            autoComplete="new-password"
          />
        </Field>
        {error && <ErrorBox msg={error} />}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-bold transition"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          >
            Cancel
          </button>
          <button disabled={busy} className={primaryBtnCls} style={primaryBtnStyle}>
            {busy ? "Resetting…" : "Reset password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const [rollNo, setRollNo] = useState(user.roll_no ?? "");
  const [employeeId, setEmployeeId] = useState(user.employee_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/api/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          email,
          role,
          rollNo: rollNo || null,
          employeeId: employeeId || null,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit user — ${user.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Full name *">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Prof. Anita Roy"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <Field label="Email *">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. anita.roy@col.edu"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <Field label="Role *">
            <select
              required
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={inputCls}
              style={inputStyle}
            >
              <option value="student">Student</option>
              <option value="incharge">Course Incharge</option>
              <option value="ta">Teaching Assistant</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>
          <Field label="Roll number (students)">
            <input
              value={rollNo}
              onChange={(e) => setRollNo(e.target.value)}
              placeholder="e.g. 22BCE001"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <Field label="Employee ID (staff)">
            <input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="e.g. E101"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
        </div>

        {error && <ErrorBox msg={error} />}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-bold transition"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          >
            Cancel
          </button>
          <button disabled={busy} className={primaryBtnCls} style={primaryBtnStyle}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- SHARED ----------

function ActionRow({
  onView,
  onEdit,
  onDelete,
}: {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <IconAction
        title="View details"
        icon="👁"
        onClick={onView}
        color="var(--color-primary)"
      />
      <IconAction
        title="Edit"
        icon="✏️"
        onClick={onEdit}
        color="var(--color-primary)"
      />
      <IconAction
        title="Delete"
        icon="🗑️"
        onClick={onDelete}
        color="var(--color-danger)"
      />
    </div>
  );
}

function IconAction({
  title,
  icon,
  onClick,
  color,
}: {
  title: string;
  icon: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="rounded-md border w-8 h-8 inline-flex items-center justify-center text-base transition hover:bg-violet-50 active:scale-95"
      style={{ borderColor: "var(--color-border)", color }}
    >
      <span aria-hidden>{icon}</span>
    </button>
  );
}

function DtDd({
  label,
  value,
  mono,
  muted,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <>
      <dt
        className="text-xs font-bold uppercase tracking-wider self-center"
        style={{ color: "var(--color-muted)" }}
      >
        {label}
      </dt>
      <dd
        className={mono ? "font-mono text-xs" : "text-sm"}
        style={{ color: muted ? "var(--color-muted)" : "var(--color-text)" }}
      >
        {value}
      </dd>
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-lg w-full overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={stripeStyle("var(--color-accent)")} />
        <div
          className="px-5 py-3 border-b flex items-center justify-between"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h3
            className="text-base font-bold tracking-tight"
            style={{ color: "var(--color-primary)" }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-sm font-bold"
            style={{ color: "var(--color-muted)" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
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

function Section({
  title,
  emoji,
  badge,
  children,
}: {
  title: string;
  emoji: string;
  badge?: string | null;
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
            style={{ backgroundColor: "var(--color-accent)" }}
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

// ---------- ACCESS TAB (student PRN roster + staff Employee-ID roster) ----------

type RosterEntry = {
  id: number;
  prn_no: string;
  name: string | null;
  department: string | null;
  class_name: string | null;
  div: string | null;
  claimed_user_id: number | null;
  claimed_at: string | null;
  created_at: string;
};

type StaffRosterEntry = {
  id: number;
  employee_id: string;
  role: "incharge" | "ta";
  name: string | null;
  department: string | null;
  claimed_user_id: number | null;
  claimed_at: string | null;
  created_at: string;
};

function StudentAccessTab() {
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);

  return (
    <>
      {error && <ErrorBox msg={error} />}
      <RosterPanel onError={setError} />
    </>
  );
}

function StaffAccessTab() {
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(error, setError);

  return (
    <>
      {error && <ErrorBox msg={error} />}
      <StaffRosterPanel onError={setError} />
    </>
  );
}

type BulkProblem = { row: number; value: string; reason: string };
type BulkResult = {
  total: number;
  added: number;
  updated: number;
  failed: number;
  problems: BulkProblem[];
};

// Shared toolbar: Download template / Upload data / Export, used by both
// enrollment panels. Columns and field-mapping are passed in per panel.
function EnrollmentTools({
  sheetName,
  templateName,
  exportName,
  headers,
  exampleRows,
  buildExportRows,
  mapRecord,
  bulkPath,
  hint,
  onDone,
  onError,
}: {
  sheetName: string;
  templateName: string;
  exportName: string;
  headers: string[];
  exampleRows: string[][];
  buildExportRows: () => string[][];
  mapRecord: (rec: Record<string, string>) => Record<string, unknown>;
  bulkPath: string;
  hint?: string;
  onDone: () => void;
  onError: (m: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyAction, setBusyAction] = useState<"template" | "export" | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  async function downloadTemplate() {
    setBusyAction("template");
    try {
      await downloadXlsx(templateName, sheetName, headers, exampleRows);
    } catch {
      onError("Could not generate the template file.");
    } finally {
      setBusyAction(null);
    }
  }

  async function exportData() {
    setBusyAction("export");
    try {
      await downloadXlsx(exportName, sheetName, headers, buildExportRows());
    } catch {
      onError("Could not generate the export file.");
    } finally {
      setBusyAction(null);
    }
  }

  // Auto-dismiss the summary on a fully clean upload; keep it on screen when
  // there are row errors so the admin can read and fix them.
  useEffect(() => {
    if (result && result.failed === 0) {
      const t = setTimeout(() => setResult(null), 5000);
      return () => clearTimeout(t);
    }
  }, [result]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    onError(null);
    setResult(null);
    setUploading(true);
    try {
      const isXlsx = /\.xlsx$/i.test(file.name);
      const grid = isXlsx ? await parseXlsxFile(file) : parseCsv(await file.text());
      const { records } = rowsToRecords(grid);
      if (records.length === 0) {
        onError("That file has a header but no data rows.");
        return;
      }
      const res = await api<BulkResult>(bulkPath, {
        method: "POST",
        body: JSON.stringify({ entries: records.map(mapRecord) }),
      });
      setResult(res);
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const toolBtn =
    "rounded-md border px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--color-surface-alt)] disabled:opacity-50";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={toolBtn}
          style={inputStyle}
          disabled={busyAction === "template"}
          onClick={downloadTemplate}
        >
          {busyAction === "template" ? "Preparing…" : "⬇️ Download template"}
        </button>
        <button
          type="button"
          className={toolBtn}
          style={inputStyle}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "Uploading…" : "📤 Upload data"}
        </button>
        <button
          type="button"
          className={toolBtn}
          style={inputStyle}
          disabled={busyAction === "export"}
          onClick={exportData}
        >
          {busyAction === "export" ? "Preparing…" : "📥 Export"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={onFile}
        />
      </div>

      {hint && (
        <p className="text-xs text-[var(--color-muted)]">💡 {hint}</p>
      )}

      {result && (
        <div
          className="relative rounded-md border px-3 py-2 pr-9 text-sm"
          style={{
            borderColor: result.failed > 0 ? "#fca5a5" : "var(--color-border)",
            backgroundColor: result.failed > 0 ? "#fef2f2" : "var(--color-surface-alt)",
          }}
        >
          <button
            type="button"
            onClick={() => setResult(null)}
            aria-label="Dismiss"
            className="absolute right-1.5 top-1.5 rounded p-1 text-[var(--color-muted)] transition hover:bg-black/5 hover:text-[var(--color-text)]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
          <div className="font-semibold">
            Upload finished — {result.added} added
            {result.updated ? `, ${result.updated} updated` : ""}
            {result.failed ? `, ${result.failed} failed` : ""}{" "}
            <span className="font-normal text-[var(--color-muted)]">
              ({result.total} row{result.total === 1 ? "" : "s"} in file)
            </span>
          </div>
          {result.problems.length > 0 && (
            <ul className="mt-2 max-h-60 overflow-auto space-y-0.5 text-xs text-[var(--color-muted)]">
              {result.problems.map((p, i) => (
                <li key={i}>
                  Row {p.row}
                  {p.value ? ` (${p.value})` : ""}: {p.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RosterPanel({ onError }: { onError: (m: string | null) => void }) {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [prn, setPrn] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [className, setClassName] = useState("");
  const [div, setDiv] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<RosterEntry | null>(null);
  const [editing, setEditing] = useState<RosterEntry | null>(null);
  const {
    visible: visibleEntries,
    filterBox: entriesFilter,
    controls: entriesControls,
  } = usePagination(entries, {
    searchText: (e) =>
      `${e.prn_no} ${e.name ?? ""} ${e.department ?? ""} ${e.class_name ?? ""} ${e.div ?? ""}`,
    searchPlaceholder: "Filter students…",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([
        api<{ entries: RosterEntry[] }>("/api/roster"),
        api<{ departments: Department[] }>("/api/departments"),
      ]);
      setEntries(r.entries);
      setDepartments(d.departments);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Failed to load enrollment list");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!prn.trim()) return;
    onError(null);
    setBusy(true);
    try {
      await api("/api/roster", {
        method: "POST",
        body: JSON.stringify({
          prnNo: prn.trim(),
          name: name.trim() || undefined,
          department: department || undefined,
          className: className || undefined,
          div: div.trim() || undefined,
        }),
      });
      setPrn("");
      setName("");
      setDiv("");
      // keep department/className as the admin likely adds many in a row
      refresh();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, prnNo: string) {
    if (!confirm(`Remove PRN ${prnNo} from the enrollment list?`)) return;
    onError(null);
    try {
      await api(`/api/roster/${id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <Section
      title="Student Enrollment List"
      emoji="🎓"
      badge={entries.length ? `${entries.length}` : null}
    >
      <div className="p-5 space-y-4">
        <EnrollmentTools
          sheetName="Students"
          templateName="student-enrollment-template.xlsx"
          exportName="student-enrollment.xlsx"
          headers={["PRN", "Name", "Department", "Class", "Div"]}
          exampleRows={[["740000000001", "Aqil Ahmed", "Computer Engineering", "TE", "A"]]}
          buildExportRows={() =>
            entries.map((e) => [
              e.prn_no,
              e.name ?? "",
              e.department ?? "",
              e.class_name ?? "",
              e.div ?? "",
            ])
          }
          mapRecord={(rec) => ({
            prnNo: rec.prn ?? rec.prnno ?? "",
            name: rec.name ?? "",
            department: rec.department ?? rec.dept ?? "",
            className: rec.class ?? rec.classname ?? "",
            div: rec.div ?? rec.division ?? "",
          })}
          bulkPath="/api/roster/bulk"
          hint="The Excel template keeps PRNs as text, so just type and save — no scientific notation. You can upload .xlsx or .csv."
          onDone={refresh}
          onError={onError}
        />
        <form onSubmit={add} className="grid sm:grid-cols-5 gap-3 items-end">
          <Field label="PRN *">
            <input
              required
              className={inputCls}
              style={inputStyle}
              value={prn}
              onChange={(e) => setPrn(e.target.value.replace(/\D/g, "").slice(0, 15))}
              placeholder="74200xxxxxx"
              inputMode="numeric"
            />
          </Field>
          <Field label="Name *">
            <input
              required
              className={inputCls}
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Aqil Ahmed"
              maxLength={60}
            />
          </Field>
          <Field label="Department">
            <select
              className={inputCls}
              style={inputStyle}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Class">
            <select
              className={inputCls}
              style={inputStyle}
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            >
              <option value="">Select class</option>
              <option value="FE">FE</option>
              <option value="SE">SE</option>
              <option value="TE">TE</option>
              <option value="BE">BE</option>
            </select>
          </Field>
          <Field label="Div">
            <input
              className={inputCls}
              style={inputStyle}
              value={div}
              onChange={(e) =>
                setDiv(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase())
              }
              placeholder="A"
              maxLength={1}
            />
          </Field>
          <div className="sm:col-span-5">
            <button
              type="submit"
              disabled={busy || !prn.trim() || !name.trim()}
              className={primaryBtnCls}
              style={primaryBtnStyle}
            >
              {busy ? "Adding…" : "Add Student"}
            </button>
          </div>
        </form>

        {entries.length > 0 && entriesFilter}

        {loading ? (
          <Loading />
        ) : entries.length === 0 ? (
          <Empty
            emoji="📭"
            title="Enrollment list is empty"
            sub="Add at least one student PRN above so students can register."
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface-alt)" }}>
                <Th>PRN</Th>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Class</Th>
                <Th>Div</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((e, i) => (
                <tr
                  key={e.id}
                  style={{
                    backgroundColor:
                      i % 2 === 0 ? "white" : "var(--color-surface-alt)",
                  }}
                >
                  <Td mono>{e.prn_no}</Td>
                  <Td>{e.name ?? "—"}</Td>
                  <Td muted>{e.department ?? "—"}</Td>
                  <Td>{e.class_name ?? "—"}</Td>
                  <Td>{e.div ?? "—"}</Td>
                  <Td>
                    {e.claimed_user_id ? (
                      <span className="rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5">
                        Claimed
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5">
                        Open
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setViewing(e)}
                        className="rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 px-2 py-1 text-xs font-semibold"
                      >
                        View
                      </button>
                      <button
                        onClick={() => setEditing(e)}
                        className="rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 px-2 py-1 text-xs font-semibold"
                      >
                        Edit
                      </button>
                      {!e.claimed_user_id && (
                        <button
                          onClick={() => remove(e.id, e.prn_no)}
                          className="rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100 px-2 py-1 text-xs font-semibold"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {entriesControls}
          </div>
        )}
      </div>

      {viewing && (
        <StudentRosterViewModal
          entry={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}
      {editing && (
        <StudentRosterEditModal
          entry={editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          onError={onError}
        />
      )}
    </Section>
  );
}

function StaffRosterPanel({ onError }: { onError: (m: string | null) => void }) {
  const [entries, setEntries] = useState<StaffRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [employeeId, setEmployeeId] = useState("");
  const [role, setRole] = useState<"incharge" | "ta">("incharge");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<StaffRosterEntry | null>(null);
  const [editing, setEditing] = useState<StaffRosterEntry | null>(null);
  const {
    visible: visibleEntries,
    filterBox: entriesFilter,
    controls: entriesControls,
  } = usePagination(entries, {
    searchText: (e) =>
      `${e.employee_id} ${e.role} ${e.name ?? ""} ${e.department ?? ""}`,
    searchPlaceholder: "Filter staff…",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, dept] = await Promise.all([
        api<{ entries: StaffRosterEntry[] }>("/api/staff-roster"),
        api<{ departments: Department[] }>("/api/departments"),
      ]);
      setEntries(r.entries);
      setDepartments(dept.departments);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Failed to load staff enrollment list");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId.trim()) return;
    onError(null);
    setBusy(true);
    try {
      await api("/api/staff-roster", {
        method: "POST",
        body: JSON.stringify({
          employeeId: employeeId.trim(),
          role,
          name: name.trim() || undefined,
          department: department || undefined,
        }),
      });
      setEmployeeId("");
      setName("");
      // keep role/department as the admin likely adds several in a row
      refresh();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, empId: string) {
    if (!confirm(`Remove Employee ID ${empId} from the staff enrollment list?`)) return;
    onError(null);
    try {
      await api(`/api/staff-roster/${id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <Section
      title="Staff Enrollment List"
      emoji="🛠️"
      badge={entries.length ? `${entries.length}` : null}
    >
      <div className="p-5 space-y-4">
        <EnrollmentTools
          sheetName="Staff"
          templateName="staff-enrollment-template.xlsx"
          exportName="staff-enrollment.xlsx"
          headers={["Employee ID", "Role", "Name", "Department"]}
          exampleRows={[
            ["E101", "incharge", "Prof. R. Roy", "Computer Engineering"],
            ["T201", "ta", "Asst. Khan", "Computer Engineering"],
          ]}
          buildExportRows={() =>
            entries.map((e) => [
              e.employee_id,
              e.role,
              e.name ?? "",
              e.department ?? "",
            ])
          }
          mapRecord={(rec) => ({
            employeeId: rec.employeeid ?? rec.empid ?? rec.id ?? "",
            role: rec.role ?? "",
            name: rec.name ?? "",
            department: rec.department ?? rec.dept ?? "",
          })}
          bulkPath="/api/staff-roster/bulk"
          onDone={refresh}
          onError={onError}
        />
        <form onSubmit={add} className="grid sm:grid-cols-4 gap-3 items-end">
          <Field label="Employee ID *">
            <input
              required
              className={inputCls}
              style={inputStyle}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value.toUpperCase().slice(0, 20))}
              placeholder="E101"
            />
          </Field>
          <Field label="Role *">
            <select
              className={inputCls}
              style={inputStyle}
              value={role}
              onChange={(e) => setRole(e.target.value as "incharge" | "ta")}
            >
              <option value="incharge">Course Incharge</option>
              <option value="ta">Technical Assistant</option>
            </select>
          </Field>
          <Field label="Name *">
            <input
              required
              className={inputCls}
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prof. R. Roy"
              maxLength={60}
            />
          </Field>
          <Field label="Department">
            <select
              className={inputCls}
              style={inputStyle}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={busy || !employeeId.trim() || !name.trim()}
              className={primaryBtnCls}
              style={primaryBtnStyle}
            >
              {busy ? "Adding…" : "Add Staff"}
            </button>
          </div>
        </form>

        {entries.length > 0 && entriesFilter}

        {loading ? (
          <Loading />
        ) : entries.length === 0 ? (
          <Empty
            emoji="📭"
            title="Enrollment list is empty"
            sub="Assign at least one staff Employee ID above so staff can register."
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface-alt)" }}>
                <Th>Employee ID</Th>
                <Th>Role</Th>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((e, i) => (
                <tr
                  key={e.id}
                  style={{
                    backgroundColor:
                      i % 2 === 0 ? "white" : "var(--color-surface-alt)",
                  }}
                >
                  <Td mono>{e.employee_id}</Td>
                  <Td>{e.role === "incharge" ? "Course Incharge" : "Technical Assistant"}</Td>
                  <Td>{e.name ?? "—"}</Td>
                  <Td muted>{e.department ?? "—"}</Td>
                  <Td>
                    {e.claimed_user_id ? (
                      <span className="rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5">
                        Claimed
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5">
                        Open
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setViewing(e)}
                        className="rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 px-2 py-1 text-xs font-semibold"
                      >
                        View
                      </button>
                      <button
                        onClick={() => setEditing(e)}
                        className="rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 px-2 py-1 text-xs font-semibold"
                      >
                        Edit
                      </button>
                      {!e.claimed_user_id && (
                        <button
                          onClick={() => remove(e.id, e.employee_id)}
                          className="rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100 px-2 py-1 text-xs font-semibold"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {entriesControls}
          </div>
        )}
      </div>

      {viewing && (
        <StaffRosterViewModal
          entry={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}
      {editing && (
        <StaffRosterEditModal
          entry={editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          onError={onError}
        />
      )}
    </Section>
  );
}

function StatusBadge({ claimed }: { claimed: boolean }) {
  return claimed ? (
    <span className="rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5">
      Claimed
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5">
      Open
    </span>
  );
}

function ModalFooter({
  onClose,
  onEdit,
}: {
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="mt-5 pt-4 border-t flex justify-end gap-2"
      style={{ borderColor: "var(--color-border)" }}
    >
      <button
        onClick={onClose}
        className="rounded-md border px-3 py-1.5 text-xs font-bold transition hover:bg-violet-50"
        style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
      >
        Close
      </button>
      <button
        onClick={onEdit}
        className="rounded-md px-3 py-1.5 text-xs font-bold text-white transition"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        ✏️ Edit
      </button>
    </div>
  );
}

function StudentRosterViewModal({
  entry,
  onClose,
  onEdit,
}: {
  entry: RosterEntry;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Modal title={`Student — ${entry.name ?? entry.prn_no}`} onClose={onClose}>
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <DtDd label="PRN" value={entry.prn_no} mono />
        <DtDd label="Name" value={entry.name ?? "—"} />
        <DtDd label="Department" value={entry.department ?? "—"} />
        <DtDd label="Class" value={entry.class_name ?? "—"} />
        <DtDd label="Div" value={entry.div ?? "—"} />
        <DtDd label="Status" value={<StatusBadge claimed={!!entry.claimed_user_id} />} />
        <DtDd
          label="Added on"
          value={new Date(entry.created_at).toLocaleString()}
          muted
        />
      </dl>
      <ModalFooter onClose={onClose} onEdit={onEdit} />
    </Modal>
  );
}

function StudentRosterEditModal({
  entry,
  departments,
  onClose,
  onSaved,
  onError,
}: {
  entry: RosterEntry;
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string | null) => void;
}) {
  const [name, setName] = useState(entry.name ?? "");
  const [department, setDepartment] = useState(entry.department ?? "");
  const [className, setClassName] = useState(entry.class_name ?? "");
  const [div, setDiv] = useState(entry.div ?? "");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onError(null);
    setBusy(true);
    try {
      await api(`/api/roster/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          department: department || undefined,
          className: className || undefined,
          div: div.trim() || undefined,
        }),
      });
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit student — ${entry.prn_no}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="PRN (cannot change)">
          <input
            className={inputCls}
            style={{ ...inputStyle, backgroundColor: "var(--color-surface-alt)" }}
            value={entry.prn_no}
            readOnly
          />
        </Field>
        <Field label="Name *">
          <input
            required
            className={inputCls}
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Aqil Ahmed"
          />
        </Field>
        <Field label="Department">
          <select
            className={inputCls}
            style={inputStyle}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">Select department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Class">
          <select
            className={inputCls}
            style={inputStyle}
            value={className}
            onChange={(e) => setClassName(e.target.value)}
          >
            <option value="">Select class</option>
            <option value="FE">FE</option>
            <option value="SE">SE</option>
            <option value="TE">TE</option>
            <option value="BE">BE</option>
          </select>
        </Field>
        <Field label="Div">
          <input
            className={inputCls}
            style={inputStyle}
            value={div}
            onChange={(e) =>
              setDiv(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase())
            }
            maxLength={1}
            placeholder="A"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-bold transition hover:bg-violet-50"
            style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className={primaryBtnCls}
            style={primaryBtnStyle}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StaffRosterViewModal({
  entry,
  onClose,
  onEdit,
}: {
  entry: StaffRosterEntry;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Modal title={`Staff — ${entry.name ?? entry.employee_id}`} onClose={onClose}>
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <DtDd label="Employee ID" value={entry.employee_id} mono />
        <DtDd
          label="Role"
          value={entry.role === "incharge" ? "Course Incharge" : "Technical Assistant"}
        />
        <DtDd label="Name" value={entry.name ?? "—"} />
        <DtDd label="Department" value={entry.department ?? "—"} />
        <DtDd label="Status" value={<StatusBadge claimed={!!entry.claimed_user_id} />} />
        <DtDd
          label="Added on"
          value={new Date(entry.created_at).toLocaleString()}
          muted
        />
      </dl>
      <ModalFooter onClose={onClose} onEdit={onEdit} />
    </Modal>
  );
}

function StaffRosterEditModal({
  entry,
  departments,
  onClose,
  onSaved,
  onError,
}: {
  entry: StaffRosterEntry;
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string | null) => void;
}) {
  const [role, setRole] = useState<"incharge" | "ta">(entry.role);
  const [name, setName] = useState(entry.name ?? "");
  const [department, setDepartment] = useState(entry.department ?? "");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onError(null);
    setBusy(true);
    try {
      await api(`/api/staff-roster/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          role,
          name: name.trim(),
          department: department || undefined,
        }),
      });
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit staff — ${entry.employee_id}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Employee ID (cannot change)">
          <input
            className={inputCls}
            style={{ ...inputStyle, backgroundColor: "var(--color-surface-alt)" }}
            value={entry.employee_id}
            readOnly
          />
        </Field>
        <Field label="Role *">
          <select
            className={inputCls}
            style={inputStyle}
            value={role}
            onChange={(e) => setRole(e.target.value as "incharge" | "ta")}
          >
            <option value="incharge">Course Incharge</option>
            <option value="ta">Technical Assistant</option>
          </select>
        </Field>
        <Field label="Name *">
          <input
            required
            className={inputCls}
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Prof. R. Roy"
          />
        </Field>
        <Field label="Department">
          <select
            className={inputCls}
            style={inputStyle}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">Select department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-bold transition hover:bg-violet-50"
            style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className={primaryBtnCls}
            style={primaryBtnStyle}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
