const bcrypt = require('bcrypt');
const { pool, query } = require('../config/db');
const { signToken } = require('../utils/jwt');

const ROLES = ['student', 'incharge', 'ta'];
const SALT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

// Case/whitespace-insensitive name comparison so "Aqil  Ahmed" matches "aqil ahmed".
function normalizeName(n) {
    return typeof n === 'string' ? n.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

async function register(req, res) {
    const {
        name, email, password, role,
        rollNo, employeeId,
        department, className, div, prnNo,
        courses,
    } = req.body || {};

    if (!name || !email || !password || !role) {
        return res.status(400).json({ error: 'name, email, password, role are required' });
    }
    if (!ROLES.includes(role)) {
        return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
    }
    if (role === 'student') {
        if (!department || !className || !prnNo) {
            return res.status(400).json({
                error: 'department, className, prnNo are required for students',
            });
        }
    }
    if ((role === 'incharge' || role === 'ta') && !employeeId) {
        return res.status(400).json({ error: 'employeeId is required for staff roles' });
    }

    let normalizedCourses = null;
    if (role === 'incharge') {
        if (!department) {
            return res.status(400).json({ error: 'department is required for course incharges' });
        }
        if (!Array.isArray(courses) || courses.length === 0) {
            return res.status(400).json({
                error: 'courses is required for course incharges (at least one)',
            });
        }
        normalizedCourses = courses
            .map((c) => (typeof c === 'string' ? c.trim() : ''))
            .filter(Boolean);
        if (normalizedCourses.length === 0) {
            return res.status(400).json({
                error: 'courses must contain at least one non-empty value',
            });
        }
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rowCount > 0) {
        return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Gate 1: student PRN must be on the admin-managed roster (unclaimed).
        let rosterId = null;
        if (role === 'student') {
            const lock = await client.query(
                `SELECT id, name, claimed_user_id FROM student_roster
                 WHERE prn_no = $1 FOR UPDATE`,
                [String(prnNo).trim()]
            );
            if (lock.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    error: 'This PRN is not on the enrollment list. Please contact your admin.',
                });
            }
            const entry = lock.rows[0];
            if (entry.claimed_user_id) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error: 'This PRN has already been used to register an account.',
                });
            }
            if (entry.name && normalizeName(entry.name) !== normalizeName(name)) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    error: 'Name does not match the one on the enrollment list for this PRN. Please contact your admin.',
                });
            }
            rosterId = entry.id;
        }

        // Gate 2: incharge/TA Employee ID must be on the admin-managed staff roster
        // (unclaimed), and the role assigned by the admin must match the submitted role.
        let staffRosterId = null;
        if (role === 'incharge' || role === 'ta') {
            const lock = await client.query(
                `SELECT id, name, role, claimed_user_id FROM staff_roster
                 WHERE employee_id = $1 FOR UPDATE`,
                [String(employeeId).trim()]
            );
            if (lock.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    error: 'This Employee ID is not on the staff enrollment list. Please contact your admin.',
                });
            }
            const entry = lock.rows[0];
            if (entry.claimed_user_id) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error: 'This Employee ID has already been used to register an account.',
                });
            }
            if (entry.role !== role) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    error: `This Employee ID is registered as a ${entry.role}. Please select that role.`,
                });
            }
            if (entry.name && normalizeName(entry.name) !== normalizeName(name)) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    error: 'Name does not match the one on the staff enrollment list for this Employee ID. Please contact your admin.',
                });
            }
            staffRosterId = entry.id;
        }

        let user;
        try {
            const insert = await client.query(
                `INSERT INTO users
                    (name, email, password_hash, role, roll_no, employee_id,
                     department, class_name, div, prn_no, incharge_courses)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 RETURNING id, name, email, role, roll_no, employee_id,
                           department, class_name, div, prn_no, incharge_courses, created_at`,
                [
                    name, normalizedEmail, passwordHash, role,
                    rollNo || null, employeeId || null,
                    department || null, className || null, div || null, prnNo || null,
                    normalizedCourses,
                ]
            );
            user = insert.rows[0];
        } catch (err) {
            await client.query('ROLLBACK');
            if (err.code === '23505') {
                // Pinpoint which unique field collided so the message is actionable.
                const where = `${err.constraint || ''} ${err.detail || ''}`.toLowerCase();
                let field = 'One of the details you entered';
                if (where.includes('email')) field = 'This email';
                else if (where.includes('prn')) field = 'This PRN';
                else if (where.includes('roll')) field = 'This roll number';
                else if (where.includes('employee')) field = 'This employee ID';
                return res.status(409).json({
                    error: `${field} is already registered to another account.`,
                });
            }
            throw err;
        }

        // Auto-enroll a new student into every existing course of their department.
        // Mirrors createCourse's forward enrollment so the gap is closed both ways.
        // Student department is free text, so match the department name
        // case-insensitively. Idempotent via the (student_id, course_id) unique key.
        if (role === 'student' && department) {
            await client.query(
                `INSERT INTO enrollments (student_id, course_id)
                 SELECT $1, c.id
                 FROM courses c
                 JOIN departments d ON d.id = c.department_id
                 WHERE LOWER(TRIM(d.name)) = LOWER(TRIM($2))
                 ON CONFLICT (student_id, course_id) DO NOTHING`,
                [user.id, department]
            );
        }

        // Mark the student / staff roster entry as claimed.
        if (rosterId !== null) {
            await client.query(
                `UPDATE student_roster
                 SET claimed_user_id = $1, claimed_at = NOW()
                 WHERE id = $2`,
                [user.id, rosterId]
            );
        }
        if (staffRosterId !== null) {
            await client.query(
                `UPDATE staff_roster
                 SET claimed_user_id = $1, claimed_at = NOW()
                 WHERE id = $2`,
                [user.id, staffRosterId]
            );
        }

        await client.query('COMMIT');

        const token = signToken({ sub: user.id, role: user.role, email: user.email });
        return res.status(201).json({ token, user });
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        throw err;
    } finally {
        client.release();
    }
}

async function login(req, res) {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
    }

    const result = await query(
        `SELECT id, name, email, password_hash, role, roll_no, employee_id,
                department, class_name, div, prn_no, incharge_courses
         FROM users WHERE email = $1`,
        [email]
    );
    if (result.rowCount === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ sub: user.id, role: user.role, email: user.email });
    delete user.password_hash;
    return res.json({ token, user });
}

async function me(req, res) {
    const result = await query(
        `SELECT id, name, email, role, roll_no, employee_id,
                department, class_name, div, prn_no, incharge_courses, created_at
         FROM users WHERE id = $1`,
        [req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];

    // For course incharges the authoritative list of courses (and their
    // departments) lives in the courses table, not the users.incharge_courses
    // array — which is only filled in for self-registered incharges, leaving
    // seeded/admin-created ones blank. Derive both from courses so the profile
    // always reflects reality. Falls back to the stored values when the
    // incharge isn't linked to any course rows yet.
    if (user.role === 'incharge') {
        const courses = await query(
            `SELECT c.name, d.name AS department
             FROM courses c
             LEFT JOIN departments d ON d.id = c.department_id
             WHERE c.incharge_id = $1
             ORDER BY c.name`,
            [user.id]
        );
        if (courses.rowCount > 0) {
            user.incharge_courses = courses.rows.map((r) => r.name);
            if (!user.department) {
                const depts = [
                    ...new Set(courses.rows.map((r) => r.department).filter(Boolean)),
                ];
                if (depts.length) user.department = depts.join(', ');
            }
        }
    }
    return res.json({ user });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Self-service profile update. A user may edit only their own "soft" details:
// name, email, class/division/roll (students), and password. Identity-gated
// fields (role, PRN, employee ID, department, courses) are intentionally not
// editable here — those are set at registration via the admin rosters.
async function updateMe(req, res) {
    const {
        name, email, className, div, rollNo,
        currentPassword, newPassword,
    } = req.body || {};

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
        return res.status(400).json({ error: 'Name cannot be empty' });
    }
    if (email !== undefined && (typeof email !== 'string' || !EMAIL_RE.test(email.trim()))) {
        return res.status(400).json({ error: 'Enter a valid email address' });
    }

    // Password change is optional; when requested, verify the current password.
    let passwordHash = null;
    if (newPassword !== undefined && newPassword !== '') {
        if (typeof newPassword !== 'string' || newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }
        const cur = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        if (cur.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        const ok = await bcrypt.compare(currentPassword || '', cur.rows[0].password_hash);
        if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
        passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }

    const normalizedEmail = email !== undefined ? String(email).trim().toLowerCase() : null;
    const normalizedDiv =
        div !== undefined ? String(div).trim().toUpperCase() || null : null;
    const normalizedRoll =
        rollNo !== undefined ? String(rollNo).trim() || null : null;

    try {
        const result = await query(
            `UPDATE users SET
                name          = COALESCE($2, name),
                email         = COALESCE($3, email),
                class_name    = COALESCE($4, class_name),
                div           = COALESCE($5, div),
                roll_no       = COALESCE($6, roll_no),
                password_hash = COALESCE($7, password_hash)
             WHERE id = $1
             RETURNING id, name, email, role, roll_no, employee_id,
                       department, class_name, div, prn_no, incharge_courses, created_at`,
            [
                req.user.id,
                name !== undefined ? name.trim() : null,
                normalizedEmail,
                className ?? null,
                normalizedDiv,
                normalizedRoll,
                passwordHash,
            ]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        return res.json({ user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({
                error: 'That email or roll number is already in use',
            });
        }
        throw err;
    }
}

module.exports = { register, login, me, updateMe };
