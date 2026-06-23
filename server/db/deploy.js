// Deploy-time, one-shot database bootstrap.
//
// Runs the full setup (schema + migrations + demo seed) ONLY when the database
// is still empty — i.e. the very first deploy. On every later deploy/redeploy
// (config change, cold-start rebuild, etc.) it detects that the schema already
// exists and does nothing, so your real data is never wiped.
//
// This is what lets the Render build run database setup automatically, with no
// manual shell step. See render.yaml (buildCommand) and DEPLOY.md.
//
// Why a guard is needed: `npm run db:setup` includes migrate-v2, which DROPs
// and rebuilds the sessions/attendance tables. That's fine on an empty DB but
// destructive if re-run on a live one — so we gate the whole thing.

require('dotenv').config();
const { execSync } = require('child_process');
const { pool } = require('../config/db');

async function alreadyInitialized() {
    // to_regclass returns NULL when the table doesn't exist yet.
    const res = await pool.query("SELECT to_regclass('public.users') AS tbl");
    return res.rows[0].tbl !== null;
}

async function main() {
    let initialized;
    try {
        initialized = await alreadyInitialized();
    } finally {
        await pool.end();
    }

    if (initialized) {
        console.log(
            'db:deploy — database already initialized; skipping setup & seed (data preserved).'
        );
        return;
    }

    console.log('db:deploy — empty database detected; running full setup + demo seed…');
    // Run the canonical setup chain as a child process. Each step manages its
    // own connection, and inherited stdio surfaces their logs in the build.
    execSync('npm run db:setup', { stdio: 'inherit' });
    console.log('db:deploy — setup complete.');
}

main().catch((err) => {
    console.error('db:deploy failed:', err);
    process.exit(1);
});
