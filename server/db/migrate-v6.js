// Migration v6:
//   - student_roster: admin-managed whitelist of PRNs that may register as students
//   - staff_invitations: admin-issued, single-use, expiring invitations for
//     incharge/TA registration (email + role + employee_id are locked by the token)
//
// Idempotent — safe to re-run.

require('dotenv').config();
const { pool } = require('../config/db');

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
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
            )
        `);
        await client.query(
            'CREATE INDEX IF NOT EXISTS idx_roster_unclaimed ON student_roster(prn_no) WHERE claimed_user_id IS NULL'
        );

        await client.query(`
            CREATE TABLE IF NOT EXISTS staff_invitations (
                id              SERIAL PRIMARY KEY,
                token           VARCHAR(100) UNIQUE NOT NULL,
                email           VARCHAR(255) NOT NULL,
                role            VARCHAR(20)  NOT NULL CHECK (role IN ('incharge', 'ta')),
                employee_id     VARCHAR(50)  NOT NULL,
                name            VARCHAR(255),
                department      VARCHAR(100),
                expires_at      TIMESTAMPTZ  NOT NULL,
                claimed_user_id INT          REFERENCES users(id) ON DELETE SET NULL,
                claimed_at      TIMESTAMPTZ,
                created_by      INT          REFERENCES users(id),
                created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            )
        `);
        await client.query(
            'CREATE INDEX IF NOT EXISTS idx_invitations_email ON staff_invitations(email)'
        );
        await client.query(
            'CREATE INDEX IF NOT EXISTS idx_invitations_open ON staff_invitations(token) WHERE claimed_user_id IS NULL'
        );

        await client.query('COMMIT');
        console.log('Migration v6 complete.');
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
        console.error('Migration v6 failed:', err);
        pool.end().finally(() => process.exit(1));
    });
