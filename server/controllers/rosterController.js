const { query } = require('../config/db');

const PRN_RE = /^\d{10,15}$/;

async function listRoster(req, res) {
    const { status, q } = req.query;
    const params = [];
    const where = [];

    if (status === 'claimed') {
        where.push('claimed_user_id IS NOT NULL');
    } else if (status === 'unclaimed') {
        where.push('claimed_user_id IS NULL');
    }
    if (q) {
        params.push(`%${q}%`);
        where.push(`(prn_no ILIKE $${params.length} OR name ILIKE $${params.length})`);
    }

    const sql = `SELECT id, prn_no, name, department, class_name, div,
                        claimed_user_id, claimed_at, created_at
                 FROM student_roster
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY created_at DESC`;
    const result = await query(sql, params);
    return res.json({ entries: result.rows });
}

async function addRosterEntry(req, res) {
    const { prnNo, name, department, className, div } = req.body || {};
    const trimmedPrn = typeof prnNo === 'string' ? prnNo.trim() : '';
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedPrn) return res.status(400).json({ error: 'prnNo is required' });
    if (!PRN_RE.test(trimmedPrn)) {
        return res.status(400).json({ error: 'prnNo must be 10–15 digits' });
    }
    if (!trimmedName) return res.status(400).json({ error: 'name is required' });

    try {
        const result = await query(
            `INSERT INTO student_roster (prn_no, name, department, class_name, div, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, prn_no, name, department, class_name, div,
                       claimed_user_id, claimed_at, created_at`,
            [
                trimmedPrn,
                trimmedName,
                department?.trim() || null,
                className?.trim() || null,
                div?.trim() || null,
                req.user.id,
            ]
        );
        return res.status(201).json({ entry: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'This PRN is already on the enrollment list' });
        }
        throw err;
    }
}

async function bulkAddRosterEntries(req, res) {
    const { entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: 'entries must be a non-empty array' });
    }
    if (entries.length > 2000) {
        return res.status(400).json({ error: 'Too many rows (max 2000 per upload)' });
    }

    let added = 0;
    let updated = 0;
    let failed = 0;
    const problems = [];

    for (let i = 0; i < entries.length; i++) {
        const { prnNo, name, department, className, div } = entries[i] || {};
        const row = i + 1;
        const trimmedPrn = typeof prnNo === 'string' ? prnNo.trim() : '';

        if (!trimmedPrn) {
            failed++;
            problems.push({ row, value: '', reason: 'PRN is required' });
            continue;
        }
        if (!PRN_RE.test(trimmedPrn)) {
            const looksScientific = /[eE.]/.test(trimmedPrn);
            failed++;
            problems.push({
                row,
                value: trimmedPrn,
                reason: looksScientific
                    ? 'PRN got converted to scientific notation by Excel — format that column as Text (or edit the CSV in a plain-text editor / Google Sheets) and re-upload'
                    : 'PRN must be 10–15 digits',
            });
            continue;
        }
        const trimmedName = typeof name === 'string' ? name.trim() : '';
        if (!trimmedName) {
            failed++;
            problems.push({ row, value: trimmedPrn, reason: 'Name is required' });
            continue;
        }

        try {
            // Upsert: insert a new PRN, or refresh the details of an existing one.
            // The claim columns (claimed_user_id/claimed_at) are left untouched.
            const result = await query(
                `INSERT INTO student_roster (prn_no, name, department, class_name, div, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (prn_no) DO UPDATE SET
                     name = EXCLUDED.name,
                     department = EXCLUDED.department,
                     class_name = EXCLUDED.class_name,
                     div = EXCLUDED.div
                 RETURNING (xmax = 0) AS inserted`,
                [
                    trimmedPrn,
                    trimmedName,
                    typeof department === 'string' && department.trim() ? department.trim() : null,
                    typeof className === 'string' && className.trim() ? className.trim() : null,
                    typeof div === 'string' && div.trim() ? div.trim() : null,
                    req.user.id,
                ]
            );
            if (result.rows[0].inserted) added++;
            else updated++;
        } catch (err) {
            failed++;
            problems.push({ row, value: trimmedPrn, reason: 'Could not be saved' });
        }
    }

    return res.json({ total: entries.length, added, updated, failed, problems });
}

async function updateRosterEntry(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const { name, department, className, div } = req.body || {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) return res.status(400).json({ error: 'name is required' });

    const result = await query(
        `UPDATE student_roster SET
             name = $1, department = $2, class_name = $3, div = $4
         WHERE id = $5
         RETURNING id, prn_no, name, department, class_name, div,
                   claimed_user_id, claimed_at, created_at`,
        [
            trimmedName,
            department?.trim() || null,
            className?.trim() || null,
            div?.trim() || null,
            id,
        ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    return res.json({ entry: result.rows[0] });
}

async function deleteRosterEntry(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const entry = await query(
        'SELECT claimed_user_id FROM student_roster WHERE id = $1',
        [id]
    );
    if (entry.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    if (entry.rows[0].claimed_user_id) {
        return res.status(409).json({
            error: 'This PRN has already been claimed by a registered student',
        });
    }

    await query('DELETE FROM student_roster WHERE id = $1', [id]);
    return res.status(204).end();
}

module.exports = {
    listRoster,
    addRosterEntry,
    bulkAddRosterEntries,
    updateRosterEntry,
    deleteRosterEntry,
};
