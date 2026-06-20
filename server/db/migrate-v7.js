// Migration v7:
//   - staff_roster: admin-managed whitelist of Employee IDs that may register as
//     incharge/TA. The admin pins the role per Employee ID; a person may only
//     register if their Employee ID is on the roster and unclaimed.
//   - Drops the old staff_invitations table (token-based invite flow removed).
//
// Idempotent — safe to re-run.

require('dotenv').config();
const { pool } = require('../config/db');

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
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
            )
        `);
        await client.query(
            'CREATE INDEX IF NOT EXISTS idx_staff_roster_unclaimed ON staff_roster(employee_id) WHERE claimed_user_id IS NULL'
        );

        // The token-based invitation flow is replaced by staff_roster.
        await client.query('DROP TABLE IF EXISTS staff_invitations');

        await client.query('COMMIT');
        console.log('Migration v7 complete.');
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
        console.error('Migration v7 failed:', err);
        pool.end().finally(() => process.exit(1));
    });
