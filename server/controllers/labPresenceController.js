const { query } = require('../config/db');

// Close practical visits left open past their session's end. A forgotten
// check-out is capped at the session's scheduled end, so it never credits time
// beyond the practical window. Idempotent — called on a timer (see index.js)
// and lazily before presence reads, so displayed durations are always current.
async function closeEndedPracticalPresences() {
    await query(
        `UPDATE lab_presence p
            SET checked_out_at = s.scheduled_end
           FROM sessions s
          WHERE p.session_id = s.id
            AND p.source = 'practical'
            AND p.checked_out_at IS NULL
            AND s.scheduled_end <= NOW()
            AND s.scheduled_end > p.checked_in_at`
    );
}

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

    // Manual visits check out at NOW(). A practical visit caps at its session's
    // scheduled end, so a late check-out never credits time past the practical.
    const result = await query(
        `UPDATE lab_presence p
            SET checked_out_at = CASE
                WHEN p.source = 'practical' THEN LEAST(
                    NOW(),
                    COALESCE(
                        (SELECT s.scheduled_end FROM sessions s WHERE s.id = p.session_id),
                        NOW()
                    )
                )
                ELSE NOW()
            END
          WHERE p.id = $1 AND p.student_id = $2 AND p.checked_out_at IS NULL
          RETURNING p.id, p.lab_id, p.student_id, p.checked_in_at, p.checked_out_at`,
        [presenceId, req.user.id]
    );
    if (result.rowCount === 0) {
        return res.status(404).json({ error: 'No active check-in found for this id' });
    }
    return res.json({ presence: result.rows[0] });
}

async function myCurrent(req, res) {
    await closeEndedPracticalPresences().catch(() => {});
    const result = await query(
        `SELECT p.id, p.lab_id, p.checked_in_at, p.ip_address, p.source, p.session_id,
                l.name AS lab_name, l.room_no
         FROM lab_presence p
         JOIN labs l ON l.id = p.lab_id
         WHERE p.student_id = $1 AND p.checked_out_at IS NULL`,
        [req.user.id]
    );
    return res.json({ current: result.rows[0] ?? null });
}

async function myHistory(req, res) {
    await closeEndedPracticalPresences().catch(() => {});
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

// A TA may only view presence for the lab assigned to them. Returns true if the
// request is allowed; otherwise sets a 403/404 response and returns false.
async function taMayAccessLab(req, res, labId) {
    if (req.user.role !== 'ta') return true;
    const lab = await query('SELECT ta_id FROM labs WHERE id = $1', [labId]);
    if (lab.rowCount === 0) {
        res.status(404).json({ error: 'Lab not found' });
        return false;
    }
    if (lab.rows[0].ta_id !== req.user.id) {
        res.status(403).json({ error: 'You can only view the lab assigned to you.' });
        return false;
    }
    return true;
}

async function listLabActivePresence(req, res) {
    const labId = parseInt(req.params.id, 10);
    if (Number.isNaN(labId)) return res.status(400).json({ error: 'Invalid lab id' });

    if (!(await taMayAccessLab(req, res, labId))) return;

    await closeEndedPracticalPresences().catch(() => {});

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

    if (!(await taMayAccessLab(req, res, labId))) return;

    await closeEndedPracticalPresences().catch(() => {});

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
                p.source, p.session_id,
                c.code AS course_code, c.name AS course_name,
                u.id AS student_id, u.name AS student_name, u.roll_no,
                u.class_name, u.div
         FROM lab_presence p
         JOIN users u ON u.id = p.student_id
         LEFT JOIN sessions s ON s.id = p.session_id
         LEFT JOIN courses  c ON c.id = s.course_id
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
    closeEndedPracticalPresences,
};
