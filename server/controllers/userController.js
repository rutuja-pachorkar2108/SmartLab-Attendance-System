const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

const ROLES = ['student', 'incharge', 'ta', 'admin'];
const SALT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

async function listUsers(req, res) {
    const { role, q } = req.query;
    const params = [];
    const where = [];

    if (role) {
        if (!ROLES.includes(role)) {
            return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
        }
        params.push(role);
        where.push(`role = $${params.length}`);
    }
    if (q) {
        params.push(`%${q}%`);
        where.push(
            `(name ILIKE $${params.length} OR email ILIKE $${params.length} OR roll_no ILIKE $${params.length} OR employee_id ILIKE $${params.length} OR prn_no ILIKE $${params.length})`
        );
    }

    const sql = `SELECT id, name, email, role, roll_no, employee_id,
                        department, class_name, div, prn_no, created_at
                 FROM users
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY role, name`;
    const result = await query(sql, params);
    return res.json({ users: result.rows });
}

async function resetPassword(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id' });

    const { password } = req.body || {};
    if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'password is required and must be at least 6 characters' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query(
        'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
        [hash, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ ok: true });
}

async function updateUser(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id' });

    const {
        name, email, role, rollNo, employeeId,
        department, className, div, prnNo,
    } = req.body || {};
    if (role && !ROLES.includes(role)) {
        return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
    }

    try {
        const result = await query(
            `UPDATE users SET
                name        = COALESCE($2, name),
                email       = COALESCE($3, email),
                role        = COALESCE($4, role),
                roll_no     = COALESCE($5, roll_no),
                employee_id = COALESCE($6, employee_id),
                department  = COALESCE($7, department),
                class_name  = COALESCE($8, class_name),
                div         = COALESCE($9, div),
                prn_no      = COALESCE($10, prn_no)
             WHERE id = $1
             RETURNING id, name, email, role, roll_no, employee_id,
                       department, class_name, div, prn_no, created_at`,
            [
                id,
                name ?? null, email ?? null, role ?? null,
                rollNo ?? null, employeeId ?? null,
                department ?? null, className ?? null, div ?? null, prnNo ?? null,
            ]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        return res.json({ user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({
                error: 'Email, roll number, employee ID, or PRN is already taken',
            });
        }
        throw err;
    }
}

async function deleteUser(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id' });
    if (id === req.user.id) {
        return res.status(400).json({ error: 'You cannot delete your own admin account' });
    }

    try {
        const del = await query('DELETE FROM users WHERE id = $1', [id]);
        if (del.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        return res.status(204).end();
    } catch (err) {
        if (err.code === '23503') {
            return res.status(409).json({
                error: 'This user owns courses or labs and cannot be deleted. Reassign first.',
            });
        }
        throw err;
    }
}

module.exports = { listUsers, resetPassword, updateUser, deleteUser };
