const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Managed Postgres providers (Render external URL, Neon, etc.) require SSL.
    // Set DATABASE_SSL=1 in those cases. Render's *internal* URL and local
    // Postgres don't need it, so it defaults off and local dev is unaffected.
    ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
    console.error('Unexpected Postgres pool error:', err);
});

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
};
