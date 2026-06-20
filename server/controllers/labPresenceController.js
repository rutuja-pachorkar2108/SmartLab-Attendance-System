const { query } = require('../config/db');

async function checkInToLab(req, res) {
    const labId = parseInt(req.params.id, 10);
    if (Number.isNaN(labId)) return res.status(400).json({ error: 'Invalid lab id' });

    const lab = await query('SELECT id FROM labs WHERE id = $1', [labId]);
    if (lab.rowCount === 0) return res.status(404).json({ error: 'Lab not found' });

    try {
        const insert = await query(
            `INSERT INTO lab_presence (lab_id, student_id, ip_address)
             VALUES ($1, $2, $3)
             RETURNING id, lab_id, student_id, checked_in_at, checked_out_at, ip_address`,
            [labId, req.user.id, req.ip]
        );
        return res.status(201).json({ presence: insert.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'You are already checked in to a lab. Check out first.' });
        }
        throw err;
    }
}

async function checkOut(req, res) {
    const presenceId = parseInt(req.params.id, 10);
    if (Number.isNaN(presenceId)) return res.status(400).json({ error: 'Invalid id' });

    const result = await query(
        `UPDATE lab_presence
            SET checked_out_at = NOW()
          WHERE id = $1 AND student_id = $2 AND checked_out_at IS NULL
          RETURNING id, lab_id, student_id, checked_in_at, checked_out_at`,
        [presenceId, req.user.id]
    );
    if (result.rowCount === 0) {
        return res.status(404).json({ error: 'No active check-in found for this id' });
    }
    return res.json({ presence: result.rows[0] });
}

async function myCurrent(req, res) {
    const result = await query(
        `SELECT p.id, p.lab_id, p.checked_in_at, p.ip_address,
                l.name AS lab_name, l.room_no
         FROM lab_presence p
         JOIN labs l ON l.id = p.lab_id
         WHERE p.student_id = $1 AND p.checked_out_at IS NULL`,
        [req.user.id]
    );
    return res.json({ current: result.rows[0] ?? null });
}

async function myHistory(req, res) {
    const result = await query(
        `SELECT p.id, p.lab_id, p.checked_in_at, p.checked_out_at,
                l.name AS lab_name, l.room_no,
                EXTRACT(EPOCH FROM (COALESCE(p.checked_out_at, NOW()) - p.checked_in_at))::int AS duration_seconds
         FROM lab_presence p
         JOIN labs l ON l.id = p.lab_id
         WHERE p.student_id = $1
         ORDER BY p.checked_in_at DESC
         LIMIT 50`,
        [req.user.id]
    );
    return res.json({ history: result.rows });
}

async function listLabActivePresence(req, res) {
    const labId = parseInt(req.params.id, 10);
    if (Number.isNaN(labId)) return res.status(400).json({ error: 'Invalid lab id' });

    const result = await query(
        `SELECT p.id, p.checked_in_at,
                u.id AS student_id, u.name AS student_name, u.roll_no
         FROM lab_presence p
         JOIN users u ON u.id = p.student_id
         WHERE p.lab_id = $1 AND p.checked_out_at IS NULL
         ORDER BY p.checked_in_at`,
        [labId]
    );
    return res.json({ active: result.rows });
}

// Full visit history for a lab — every student check-in (for any purpose), with
// timings and duration — so staff (TA/incharge/admin) can review who used the
// lab and when. Optional ?date=YYYY-MM-DD filters to a single calendar day.
async function listLabPresenceHistory(req, res) {
    const labId = parseInt(req.params.id, 10);
    if (Number.isNaN(labId)) return res.status(400).json({ error: 'Invalid lab id' });

    const lab = await query('SELECT id FROM labs WHERE id = $1', [labId]);
    if (lab.rowCount === 0) return res.status(404).json({ error: 'Lab not found' });

    const params = [labId];
    let dateFilter = '';
    if (req.query.date) {
        // Match check-ins on the given local date (server time zone).
        params.push(req.query.date);
        dateFilter = ` AND p.checked_in_at::date = $${params.length}::date`;
    }

    const limit = Math.min(parseInt(req.query.limit || '200', 10) || 200, 500);

    const result = await query(
        `SELECT p.id, p.checked_in_at, p.checked_out_at, p.ip_address,
                (p.checked_out_at IS NULL) AS is_active,
                EXTRACT(EPOCH FROM (COALESCE(p.checked_out_at, NOW()) - p.checked_in_at))::int
                    AS duration_seconds,
                u.id AS student_id, u.name AS student_name, u.roll_no,
                u.class_name, u.div
         FROM lab_presence p
         JOIN users u ON u.id = p.student_id
         WHERE p.lab_id = $1${dateFilter}
         ORDER BY p.checked_in_at DESC
         LIMIT ${limit}`,
        params
    );
    return res.json({ history: result.rows });
}

module.exports = {
    checkInToLab,
    checkOut,
    myCurrent,
    myHistory,
    listLabActivePresence,
    listLabPresenceHistory,
};
