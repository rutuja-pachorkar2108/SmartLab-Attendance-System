// Migration v9:
//   - Adds courses.lab_id — the physical lab a practical is held in. A lab hosts
//     many practicals; each practical belongs to at most one lab. This is what
//     lets a student's practical-attendance mark count as lab presence for the
//     lab's assigned TA.
//   - Adds lab_presence.source ('manual' | 'practical') and lab_presence.session_id
//     so the TA dashboard can show which visits came from a student marking
//     practical attendance vs. a walk-in lab check-in, and trace it to the session.
//
// Idempotent — safe to re-run.

require('dotenv').config();
const { pool } = require('../config/db');

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            'ALTER TABLE courses ADD COLUMN IF NOT EXISTS lab_id INT REFERENCES labs(id) ON DELETE SET NULL'
        );
        await client.query(
            'CREATE INDEX IF NOT EXISTS idx_courses_lab ON courses(lab_id)'
        );

        await client.query(
            `ALTER TABLE lab_presence
                ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual'`
        );
        await client.query(
            `ALTER TABLE lab_presence
                ADD COLUMN IF NOT EXISTS session_id INT REFERENCES sessions(id) ON DELETE SET NULL`
        );

        await client.query('COMMIT');
        console.log('Migration v9 complete.');
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
        console.error('Migration v9 failed:', err);
        pool.end().finally(() => process.exit(1));
    });
