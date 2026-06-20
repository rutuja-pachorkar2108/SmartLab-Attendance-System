// Migration v3: add academic fields to users.
//   - department, class_name, div, prn_no
//   - prn_no is uniquely indexed (nullable so non-student rows are unaffected)
//
// Idempotent — safe to re-run.

require('dotenv').config();
const { pool } = require('../config/db');

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            ALTER TABLE users
              ADD COLUMN IF NOT EXISTS department  VARCHAR(100),
              ADD COLUMN IF NOT EXISTS class_name  VARCHAR(20),
              ADD COLUMN IF NOT EXISTS div         VARCHAR(10),
              ADD COLUMN IF NOT EXISTS prn_no      VARCHAR(50)
        `);

        await client.query(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_prn_no ON users(prn_no) WHERE prn_no IS NOT NULL'
        );

        await client.query('COMMIT');
        console.log('Migration v3 complete.');
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
        console.error('Migration v3 failed:', err);
        pool.end().finally(() => process.exit(1));
    });
