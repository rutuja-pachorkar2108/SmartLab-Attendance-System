// Migration v5:
//   - new `departments` table (admin-managed, public read)
//   - courses.incharge_id becomes nullable so admin can seed courses
//     before any course incharge exists
//   - courses gains department_id (FK to departments) so courses can be
//     filtered per-department in the registration dropdown
//   - default departments seeded if the table is empty
//
// Idempotent — safe to re-run.

require('dotenv').config();
const { pool } = require('../config/db');

const DEFAULT_DEPARTMENTS = [
    'Computer Science',
    'Artificial Intelligence and Data Science',
    'Electronics and Telecommunication',
    'Mechanical Engineering',
    'Civil Engineering',
];

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS departments (
                id          SERIAL PRIMARY KEY,
                name        VARCHAR(150) UNIQUE NOT NULL,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        // Seed defaults only if the table is empty.
        const existing = await client.query('SELECT COUNT(*)::int AS n FROM departments');
        if (existing.rows[0].n === 0) {
            for (const name of DEFAULT_DEPARTMENTS) {
                await client.query(
                    'INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
                    [name]
                );
            }
        }

        // Make courses.incharge_id nullable (admin can pre-seed courses before
        // an incharge registers and claims them).
        await client.query('ALTER TABLE courses ALTER COLUMN incharge_id DROP NOT NULL');

        // Add department_id FK on courses.
        await client.query(`
            ALTER TABLE courses
              ADD COLUMN IF NOT EXISTS department_id INT REFERENCES departments(id) ON DELETE SET NULL
        `);
        await client.query(
            'CREATE INDEX IF NOT EXISTS idx_courses_department ON courses(department_id)'
        );

        await client.query('COMMIT');
        console.log('Migration v5 complete.');
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
        console.error('Migration v5 failed:', err);
        pool.end().finally(() => process.exit(1));
    });
