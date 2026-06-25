// Migration v10:
//   - Adds sessions.series_id — a UUID shared by all weekly occurrences created
//     together from a single "repeat weekly" schedule. This lets the incharge
//     delete a whole recurring series in one action (and lets the UI label which
//     sessions belong to a series). NULL for one-off, non-recurring sessions.
//
// Idempotent — safe to re-run.

require('dotenv').config();
const { pool } = require('../config/db');

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            'ALTER TABLE sessions ADD COLUMN IF NOT EXISTS series_id UUID'
        );
        await client.query(
            'CREATE INDEX IF NOT EXISTS idx_sessions_series ON sessions(series_id)'
        );

        await client.query('COMMIT');
        console.log('Migration v10 complete.');
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
        console.error('Migration v10 failed:', err);
        pool.end().finally(() => process.exit(1));
    });
