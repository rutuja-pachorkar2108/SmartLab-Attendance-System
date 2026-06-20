require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function main() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Schema applied.');
    await pool.end();
}

main().catch((err) => {
    console.error('Schema init failed:', err);
    process.exit(1);
});
