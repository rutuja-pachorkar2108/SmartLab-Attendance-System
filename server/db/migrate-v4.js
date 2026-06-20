// Migration v4: add incharge_courses (TEXT[]) to users for course incharges.
// Idempotent — safe to re-run.

require('dotenv').config();
const { pool } = require('../config/db');

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS incharge_courses TEXT[]'
        );
        await client.query('COMMIT');
        console.log('Migration v4 complete.');
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
        console.error('Migration v4 failed:', err);
        pool.end().finally(() => process.exit(1));
    });
