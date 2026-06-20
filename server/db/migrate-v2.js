// One-shot migration for the v2 model:
//   - users.role gains 'admin'
//   - sessions table rebuilt as scheduled windows (scheduled_start/scheduled_end)
//   - attendance table rebuilt to reference the new sessions
//   - new tables: labs, lab_presence
//
// Wipes existing session + attendance rows. Users / courses / enrollments are preserved.

require('dotenv').config();
const { pool } = require('../config/db');

async function run() {
    const client = await pool.connect();
    try {
        // btree_gist is needed for the EXCLUDE constraint on sessions.
        // CREATE EXTENSION must happen outside the main transaction to be visible to it.
        await client.query('CREATE EXTENSION IF NOT EXISTS btree_gist');

        await client.query('BEGIN');

        // 1. Allow 'admin' in users.role
        await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
        await client.query(
            `ALTER TABLE users
               ADD CONSTRAINT users_role_check
               CHECK (role IN ('student', 'incharge', 'ta', 'admin'))`
        );

        // 2. Drop attendance + sessions (in dependency order)
        await client.query('DROP TABLE IF EXISTS attendance CASCADE');
        await client.query('DROP TABLE IF EXISTS sessions   CASCADE');

        // 3. Rebuild sessions as scheduled windows
        await client.query(`
            CREATE TABLE sessions (
                id               SERIAL PRIMARY KEY,
                course_id        INT          NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                created_by       INT          NOT NULL REFERENCES users(id),
                scheduled_start  TIMESTAMPTZ  NOT NULL,
                scheduled_end    TIMESTAMPTZ  NOT NULL,
                notes            TEXT,
                created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                CHECK (scheduled_end > scheduled_start)
            )
        `);
        await client.query(
            'CREATE INDEX idx_sessions_course_window ON sessions(course_id, scheduled_start, scheduled_end)'
        );
        // Prevent overlapping windows for the same course
        await client.query(`
            ALTER TABLE sessions
              ADD CONSTRAINT sessions_no_overlap
              EXCLUDE USING gist (
                course_id WITH =,
                tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
              )
        `);

        // 4. Rebuild attendance against new sessions
        await client.query(`
            CREATE TABLE attendance (
                id              SERIAL PRIMARY KEY,
                session_id      INT          NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                student_id      INT          NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
                marked_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                ip_address      INET,
                status          VARCHAR(20)  NOT NULL DEFAULT 'present'
                                CHECK (status IN ('present', 'absent', 'late')),
                UNIQUE (session_id, student_id)
            )
        `);
        await client.query('CREATE INDEX idx_attendance_student ON attendance(student_id)');

        // 5. Labs
        await client.query(`
            CREATE TABLE IF NOT EXISTS labs (
                id           SERIAL PRIMARY KEY,
                name         VARCHAR(150) NOT NULL,
                room_no      VARCHAR(50)  NOT NULL UNIQUE,
                department   VARCHAR(100),
                floor        VARCHAR(50),
                capacity     INT          NOT NULL DEFAULT 0,
                pc_count     INT          NOT NULL DEFAULT 0,
                created_by   INT          NOT NULL REFERENCES users(id),
                created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            )
        `);
        // 5a. ta_id column for labs (idempotent — earlier migrations may have created the table without it)
        await client.query(`
            ALTER TABLE labs
              ADD COLUMN IF NOT EXISTS ta_id INT REFERENCES users(id) ON DELETE SET NULL
        `);
        await client.query('CREATE INDEX IF NOT EXISTS idx_labs_ta ON labs(ta_id)');
        // 5b. Drop the legacy building column if it lingers from an older schema.
        await client.query('ALTER TABLE labs DROP COLUMN IF EXISTS building');

        // 6. Lab presence (ad-hoc check-in / check-out)
        await client.query(`
            CREATE TABLE IF NOT EXISTS lab_presence (
                id                SERIAL PRIMARY KEY,
                lab_id            INT          NOT NULL REFERENCES labs(id)  ON DELETE CASCADE,
                student_id        INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                checked_in_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                checked_out_at    TIMESTAMPTZ,
                ip_address        INET,
                CHECK (checked_out_at IS NULL OR checked_out_at > checked_in_at)
            )
        `);
        await client.query(
            'CREATE INDEX IF NOT EXISTS idx_lab_presence_lab_active ON lab_presence(lab_id) WHERE checked_out_at IS NULL'
        );
        // At most one open check-in per student at a time
        await client.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_presence_one_open_per_student
               ON lab_presence(student_id) WHERE checked_out_at IS NULL`
        );

        await client.query('COMMIT');
        console.log('Migration v2 complete.');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

run()
    .then(() => pool.end())
    .catch((err) => {
        console.error('Migration v2 failed:', err);
        pool.end().finally(() => process.exit(1));
    });
