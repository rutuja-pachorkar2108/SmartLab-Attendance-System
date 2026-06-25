-- Lab Attendance System schema (v2)
-- Run once against an empty database, or via `npm run db:init`.
-- If you already have v1 data, use `npm run db:migrate-v2` instead.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20)  NOT NULL CHECK (role IN ('student', 'incharge', 'ta', 'admin')),
    roll_no         VARCHAR(50)  UNIQUE,
    employee_id     VARCHAR(50)  UNIQUE,
    department      VARCHAR(100),
    class_name      VARCHAR(20),
    div             VARCHAR(10),
    prn_no          VARCHAR(50)  UNIQUE,
    incharge_courses TEXT[],
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS departments (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20)  UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    incharge_id     INT          REFERENCES users(id) ON DELETE RESTRICT,
    department_id   INT          REFERENCES departments(id) ON DELETE SET NULL,
    -- FK to labs(id) is added after the labs table is created (see below).
    lab_id          INT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_department ON courses(department_id);
CREATE INDEX IF NOT EXISTS idx_courses_lab ON courses(lab_id);

CREATE TABLE IF NOT EXISTS enrollments (
    id              SERIAL PRIMARY KEY,
    student_id      INT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id       INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (student_id, course_id)
);

-- Sessions are now preplanned windows scheduled by the Course Incharge.
CREATE TABLE IF NOT EXISTS sessions (
    id               SERIAL PRIMARY KEY,
    course_id        INT          NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_by       INT          NOT NULL REFERENCES users(id),
    scheduled_start  TIMESTAMPTZ  NOT NULL,
    scheduled_end    TIMESTAMPTZ  NOT NULL,
    notes            TEXT,
    -- Shared by all weekly occurrences created from one "repeat weekly" schedule,
    -- so the whole series can be deleted at once. NULL for one-off sessions.
    series_id        UUID,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (scheduled_end > scheduled_start),
    CONSTRAINT sessions_no_overlap
        EXCLUDE USING gist (
            course_id WITH =,
            tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
        )
);

CREATE INDEX IF NOT EXISTS idx_sessions_course_window
    ON sessions(course_id, scheduled_start, scheduled_end);

CREATE INDEX IF NOT EXISTS idx_sessions_series ON sessions(series_id);

CREATE TABLE IF NOT EXISTS attendance (
    id              SERIAL PRIMARY KEY,
    session_id      INT          NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id      INT          NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    marked_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ip_address      INET,
    status          VARCHAR(20)  NOT NULL DEFAULT 'present'
                    CHECK (status IN ('present', 'absent', 'late')),
    UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);

-- Labs are physical rooms managed by Admin. Admin can assign one TA per lab.
CREATE TABLE IF NOT EXISTS labs (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(150) NOT NULL,
    room_no      VARCHAR(50)  NOT NULL UNIQUE,
    department   VARCHAR(100),
    floor        VARCHAR(50),
    pc_count     INT          NOT NULL DEFAULT 0,
    ta_id        INT          REFERENCES users(id) ON DELETE SET NULL,
    created_by   INT          NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labs_ta ON labs(ta_id);

-- Link a practical (course) to the physical lab it runs in. Declared on courses
-- above; the FK is added here now that labs exists. A lab hosts many practicals.
DO $$ BEGIN
    ALTER TABLE courses
        ADD CONSTRAINT courses_lab_id_fkey
        FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Lab presence: students self-check-in / check-out (source='manual'), OR an
-- automatic visit recorded when a student marks practical attendance for a
-- session held in this lab (source='practical', session_id set).
CREATE TABLE IF NOT EXISTS lab_presence (
    id                SERIAL PRIMARY KEY,
    lab_id            INT          NOT NULL REFERENCES labs(id)  ON DELETE CASCADE,
    student_id        INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    checked_in_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    checked_out_at    TIMESTAMPTZ,
    ip_address        INET,
    source            VARCHAR(20)  NOT NULL DEFAULT 'manual',
    session_id        INT          REFERENCES sessions(id) ON DELETE SET NULL,
    CHECK (checked_out_at IS NULL OR checked_out_at > checked_in_at)
);

CREATE INDEX IF NOT EXISTS idx_lab_presence_lab_active
    ON lab_presence(lab_id) WHERE checked_out_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_presence_one_open_per_student
    ON lab_presence(student_id) WHERE checked_out_at IS NULL;

-- Registration gating: admin pre-populates these so only allowed people can sign up.
CREATE TABLE IF NOT EXISTS student_roster (
    id              SERIAL PRIMARY KEY,
    prn_no          VARCHAR(50)  UNIQUE NOT NULL,
    name            VARCHAR(255),
    department      VARCHAR(100),
    class_name      VARCHAR(20),
    div             VARCHAR(10),
    claimed_user_id INT          REFERENCES users(id) ON DELETE SET NULL,
    claimed_at      TIMESTAMPTZ,
    created_by      INT          REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roster_unclaimed
    ON student_roster(prn_no) WHERE claimed_user_id IS NULL;

-- Staff registration gating: admin pre-assigns an Employee ID + role so only
-- allowed people can sign up as incharge/TA (mirrors student_roster).
CREATE TABLE IF NOT EXISTS staff_roster (
    id              SERIAL PRIMARY KEY,
    employee_id     VARCHAR(50)  UNIQUE NOT NULL,
    role            VARCHAR(20)  NOT NULL CHECK (role IN ('incharge', 'ta')),
    name            VARCHAR(255),
    department      VARCHAR(100),
    claimed_user_id INT          REFERENCES users(id) ON DELETE SET NULL,
    claimed_at      TIMESTAMPTZ,
    created_by      INT          REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_roster_unclaimed
    ON staff_roster(employee_id) WHERE claimed_user_id IS NULL;
