const { query } = require('../config/db');

const ROLES = ['incharge', 'ta'];
const EMP_RE = /^[A-Za-z0-9-]{2,20}$/;

async function listStaffRoster(req, res) {
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
        where.push(`(employee_id ILIKE $${params.length} OR name ILIKE $${params.length})`);
    }

    const sql = `SELECT id, employee_id, role, name, department,
                        claimed_user_id, claimed_at, created_at
                 FROM staff_roster
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY created_at DESC`;
    const result = await query(sql, params);
    return res.json({ entries: result.rows });
}

async function addStaffRosterEntry(req, res) {
    const { employeeId, role, name, department } = req.body || {};
    const trimmedEmp = typeof employeeId === 'string' ? employeeId.trim() : '';
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedEmp) return res.status(400).json({ error: 'employeeId is required' });
    if (!EMP_RE.test(trimmedEmp)) {
        return res.status(400).json({ error: 'employeeId must be 2–20 chars (letters/digits/hyphen)' });
    }
    if (!ROLES.includes(role)) {
        return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
    }
    if (!trimmedName) return res.status(400).json({ error: 'name is required' });

    // Reject if a user already exists with that employee_id.
    const dup = await query('SELECT id FROM users WHERE employee_id = $1', [trimmedEmp]);
    if (dup.rowCount > 0) {
        return res.status(409).json({ error: 'A user with this Employee ID already exists' });
    }

    try {
        const result = await query(
            `INSERT INTO staff_roster (employee_id, role, name, department, created_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, employee_id, role, name, department,
                       claimed_user_id, claimed_at, created_at`,
            [
                trimmedEmp,
                role,
                trimmedName,
                department?.trim() || null,
                req.user.id,
            ]
        );
        return res.status(201).json({ entry: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'This Employee ID is already on the staff enrollment list' });
        }
        throw err;
    }
}

function normalizeRole(raw) {
    const r = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (r === 'incharge' || r === 'course incharge' || r === 'ci') return 'incharge';
    if (r === 'ta' || r === 'technical assistant') return 'ta';
    return r;
}

async function bulkAddStaffRosterEntries(req, res) {
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
        const { employeeId, role, name, department } = entries[i] || {};
        const row = i + 1;
        const trimmedEmp = typeof employeeId === 'string' ? employeeId.trim() : '';
        const normalizedRole = normalizeRole(role);

        if (!trimmedEmp) {
            failed++;
            problems.push({ row, value: '', reason: 'Employee ID is required' });
            continue;
        }
        if (!EMP_RE.test(trimmedEmp)) {
            failed++;
            problems.push({ row, value: trimmedEmp, reason: 'Employee ID must be 2–20 chars (letters/digits/hyphen)' });
            continue;
        }
        if (!ROLES.includes(normalizedRole)) {
            failed++;
            problems.push({ row, value: trimmedEmp, reason: 'Role must be "incharge" or "ta"' });
            continue;
        }
        const trimmedName = typeof name === 'string' ? name.trim() : '';
        if (!trimmedName) {
            failed++;
            problems.push({ row, value: trimmedEmp, reason: 'Name is required' });
            continue;
        }

        try {
            // Upsert: insert a new Employee ID, or refresh an existing one.
            // The claim columns (claimed_user_id/claimed_at) are left untouched.
            const result = await query(
                `INSERT INTO staff_roster (employee_id, role, name, department, created_by)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (employee_id) DO UPDATE SET
                     role = EXCLUDED.role,
                     name = EXCLUDED.name,
                     department = EXCLUDED.department
                 RETURNING (xmax = 0) AS inserted`,
                [
                    trimmedEmp,
                    normalizedRole,
                    trimmedName,
                    typeof department === 'string' && department.trim() ? department.trim() : null,
                    req.user.id,
                ]
            );
            if (result.rows[0].inserted) added++;
            else updated++;
        } catch (err) {
            failed++;
            problems.push({ row, value: trimmedEmp, reason: 'Could not be saved' });
        }
    }

    return res.json({ total: entries.length, added, updated, failed, problems });
}

async function updateStaffRosterEntry(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const { role, name, department } = req.body || {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const normalizedRole = normalizeRole(role);
    if (!ROLES.includes(normalizedRole)) {
        return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
    }
    if (!trimmedName) return res.status(400).json({ error: 'name is required' });

    const result = await query(
        `UPDATE staff_roster SET role = $1, name = $2, department = $3
         WHERE id = $4
         RETURNING id, employee_id, role, name, department,
                   claimed_user_id, claimed_at, created_at`,
        [normalizedRole, trimmedName, department?.trim() || null, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    return res.json({ entry: result.rows[0] });
}

async function deleteStaffRosterEntry(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const entry = await query(
        'SELECT claimed_user_id FROM staff_roster WHERE id = $1',
        [id]
    );
    if (entry.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    if (entry.rows[0].claimed_user_id) {
        return res.status(409).json({
            error: 'This Employee ID has already been claimed by a registered staff member',
        });
    }

    await query('DELETE FROM staff_roster WHERE id = $1', [id]);
    return res.status(204).end();
}

module.exports = {
    listStaffRoster,
    addStaffRosterEntry,
    bulkAddStaffRosterEntries,
    updateStaffRosterEntry,
    deleteStaffRosterEntry,
};
