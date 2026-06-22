const { query } = require('../config/db');

// Returns the user row if id resolves to a TA, otherwise sets the response and returns null.
async function resolveTa(res, taId) {
    if (taId === null || taId === undefined || taId === '') return { id: null };
    const id = parseInt(taId, 10);
    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'taId must be a number' });
        return null;
    }
    const found = await query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (found.rowCount === 0) {
        res.status(404).json({ error: 'TA not found' });
        return null;
    }
    if (found.rows[0].role !== 'ta') {
        res.status(400).json({ error: 'Selected user is not a TA' });
        return null;
    }
    return { id: found.rows[0].id };
}

// A TA may be assigned to at most one lab. Returns the conflicting lab's name
// if this TA is already assigned to a different lab, otherwise null.
// Pass excludeLabId when editing so the lab being edited doesn't conflict with itself.
async function taAssignedElsewhere(taId, excludeLabId) {
    if (taId === null || taId === undefined) return null;
    const result = await query(
        'SELECT name FROM labs WHERE ta_id = $1 AND id <> $2 LIMIT 1',
        [taId, excludeLabId ?? 0]
    );
    return result.rowCount > 0 ? result.rows[0].name : null;
}

const SELECT_LAB_WITH_TA = `
    SELECT l.id, l.name, l.room_no, l.department, l.floor,
           l.pc_count, l.ta_id, l.created_at,
           u.name AS ta_name, u.email AS ta_email
      FROM labs l
      LEFT JOIN users u ON u.id = l.ta_id`;

async function createLab(req, res) {
    const { name, roomNo, department, floor, pcCount, taId } = req.body || {};
    if (!name || !roomNo) {
        return res.status(400).json({ error: 'name and roomNo are required' });
    }

    const ta = await resolveTa(res, taId);
    if (ta === null) return;

    if (ta.id !== null) {
        const conflict = await taAssignedElsewhere(ta.id, null);
        if (conflict) {
            return res.status(409).json({
                error: `This TA is already assigned to "${conflict}". A TA can only be assigned to one lab.`,
            });
        }
    }

    try {
        const insert = await query(
            `INSERT INTO labs (name, room_no, department, floor, pc_count, ta_id, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
                name,
                roomNo,
                department || null,
                floor || null,
                parseInt(pcCount ?? 0, 10),
                ta.id,
                req.user.id,
            ]
        );
        const row = await query(`${SELECT_LAB_WITH_TA} WHERE l.id = $1`, [insert.rows[0].id]);
        return res.status(201).json({ lab: row.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'A lab with this room number already exists' });
        }
        throw err;
    }
}

async function listLabs(req, res) {
    const result = await query(`${SELECT_LAB_WITH_TA} ORDER BY l.room_no`);
    return res.json({ labs: result.rows });
}

async function updateLab(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid lab id' });

    const { name, roomNo, department, floor, pcCount, taId } = req.body || {};

    // taId is allowed to be explicitly null (unassign). Only validate when a value is supplied.
    let taIdToSet;
    let touchTa = false;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'taId')) {
        touchTa = true;
        if (taId === null || taId === '') {
            taIdToSet = null;
        } else {
            const ta = await resolveTa(res, taId);
            if (ta === null) return;
            taIdToSet = ta.id;
        }
    }

    if (touchTa && taIdToSet !== null && taIdToSet !== undefined) {
        const conflict = await taAssignedElsewhere(taIdToSet, id);
        if (conflict) {
            return res.status(409).json({
                error: `This TA is already assigned to "${conflict}". A TA can only be assigned to one lab.`,
            });
        }
    }

    try {
        await query(
            `UPDATE labs SET
                name       = COALESCE($2, name),
                room_no    = COALESCE($3, room_no),
                department = COALESCE($4, department),
                floor      = COALESCE($5, floor),
                pc_count   = COALESCE($6, pc_count),
                ta_id      = CASE WHEN $8::bool THEN $7 ELSE ta_id END
             WHERE id = $1`,
            [
                id,
                name ?? null,
                roomNo ?? null,
                department ?? null,
                floor ?? null,
                pcCount == null ? null : parseInt(pcCount, 10),
                taIdToSet ?? null,
                touchTa,
            ]
        );
        const row = await query(`${SELECT_LAB_WITH_TA} WHERE l.id = $1`, [id]);
        if (row.rowCount === 0) return res.status(404).json({ error: 'Lab not found' });
        return res.json({ lab: row.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Another lab already uses that room number' });
        }
        throw err;
    }
}

async function deleteLab(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid lab id' });

    const del = await query('DELETE FROM labs WHERE id = $1', [id]);
    if (del.rowCount === 0) return res.status(404).json({ error: 'Lab not found' });
    return res.status(204).end();
}

module.exports = { createLab, listLabs, updateLab, deleteLab };
