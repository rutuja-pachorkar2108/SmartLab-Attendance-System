// Migration v8:
//   - Drops the labs.capacity column. Lab capacity (seat count) and the
//     associated check-in capacity gate have been removed from the product.
//
// Idempotent — safe to re-run.

require('dotenv').config();
const { pool } = require('../config/db');

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query('ALTER TABLE labs DROP COLUMN IF EXISTS capacity');

        await client.query('COMMIT');
        console.log('Migration v8 complete.');
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
        console.error('Migration v8 failed:', err);
        pool.end().finally(() => process.exit(1));
    });
