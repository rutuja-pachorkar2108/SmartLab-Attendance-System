const { query } = require('../config/db');

async function listDepartments(req, res) {
    const result = await query(
        'SELECT id, name FROM departments ORDER BY name'
    );
    return res.json({ departments: result.rows });
}

async function createDepartment(req, res) {
    const { name } = req.body || {};
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) return res.status(400).json({ error: 'name is required' });
    if (trimmed.length > 150) {
        return res.status(400).json({ error: 'name must be at most 150 characters' });
    }
    try {
        const result = await query(
            `INSERT INTO departments (name) VALUES ($1)
             RETURNING id, name, created_at`,
            [trimmed]
        );
        return res.status(201).json({ department: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'A department with this name already exists' });
        }
        throw err;
    }
}

async function deleteDepartment(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid department id' });
    const del = await query('DELETE FROM departments WHERE id = $1', [id]);
    if (del.rowCount === 0) return res.status(404).json({ error: 'Department not found' });
    return res.status(204).end();
}

module.exports = { listDepartments, createDepartment, deleteDepartment };
