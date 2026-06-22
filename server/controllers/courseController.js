const { query } = require('../config/db');

async function createCourse(req, res) {
    const { code, name, inchargeId, departmentId, labId } = req.body || {};
    if (!code || !name) {
        return res.status(400).json({ error: 'code and name are required' });
    }

    let resolvedInchargeId = null;
    if (inchargeId) {
        const incharge = await query(
            'SELECT id, role FROM users WHERE id = $1',
            [parseInt(inchargeId, 10)]
        );
        if (incharge.rowCount === 0) return res.status(404).json({ error: 'Incharge not found' });
        if (incharge.rows[0].role !== 'incharge') {
            return res.status(400).json({ error: 'Selected user is not a Course Incharge' });
        }
        resolvedInchargeId = incharge.rows[0].id;
    }

    let resolvedDepartmentId = null;
    if (departmentId) {
        const dept = await query(
            'SELECT id FROM departments WHERE id = $1',
            [parseInt(departmentId, 10)]
        );
        if (dept.rowCount === 0) return res.status(404).json({ error: 'Department not found' });
        resolvedDepartmentId = dept.rows[0].id;
    }

    let resolvedLabId = null;
    if (labId) {
        const lab = await query('SELECT id FROM labs WHERE id = $1', [parseInt(labId, 10)]);
        if (lab.rowCount === 0) return res.status(404).json({ error: 'Lab not found' });
        resolvedLabId = lab.rows[0].id;
    }

    const dup = await query('SELECT id FROM courses WHERE code = $1', [code]);
    if (dup.rowCount > 0) {
        return res.status(409).json({ error: 'A course with this code already exists' });
    }

    const result = await query(
        `INSERT INTO courses (code, name, incharge_id, department_id, lab_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, code, name, incharge_id, department_id, lab_id, created_at`,
        [code, name, resolvedInchargeId, resolvedDepartmentId, resolvedLabId]
    );
    const created = result.rows[0];

    // Auto-enroll every student whose department matches the course's department.
    // Student department is stored as free text, so match the department name
    // case-insensitively. Idempotent via the (student_id, course_id) unique key.
    let autoEnrolled = 0;
    if (resolvedDepartmentId) {
        const enroll = await query(
            `INSERT INTO enrollments (student_id, course_id)
             SELECT u.id, $1
             FROM users u
             JOIN departments d ON d.id = $2
             WHERE u.role = 'student'
               AND u.department IS NOT NULL
               AND LOWER(TRIM(u.department)) = LOWER(TRIM(d.name))
             ON CONFLICT (student_id, course_id) DO NOTHING`,
            [created.id, resolvedDepartmentId]
        );
        autoEnrolled = enroll.rowCount;
    }

    return res.status(201).json({ course: created, autoEnrolled });
}

async function updateCourse(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid course id' });

    const { code, name, inchargeId, departmentId, labId } = req.body || {};

    const touchIncharge = Object.prototype.hasOwnProperty.call(req.body || {}, 'inchargeId');
    let resolvedInchargeId = null;
    if (touchIncharge && inchargeId) {
        const incharge = await query(
            'SELECT id, role FROM users WHERE id = $1',
            [parseInt(inchargeId, 10)]
        );
        if (incharge.rowCount === 0) return res.status(404).json({ error: 'Incharge not found' });
        if (incharge.rows[0].role !== 'incharge') {
            return res.status(400).json({ error: 'Selected user is not a Course Incharge' });
        }
        resolvedInchargeId = incharge.rows[0].id;
    }

    const touchDept = Object.prototype.hasOwnProperty.call(req.body || {}, 'departmentId');
    let resolvedDeptId = null;
    if (touchDept && departmentId) {
        const dept = await query(
            'SELECT id FROM departments WHERE id = $1',
            [parseInt(departmentId, 10)]
        );
        if (dept.rowCount === 0) return res.status(404).json({ error: 'Department not found' });
        resolvedDeptId = dept.rows[0].id;
    }

    const touchLab = Object.prototype.hasOwnProperty.call(req.body || {}, 'labId');
    let resolvedLabId = null;
    if (touchLab && labId) {
        const lab = await query('SELECT id FROM labs WHERE id = $1', [parseInt(labId, 10)]);
        if (lab.rowCount === 0) return res.status(404).json({ error: 'Lab not found' });
        resolvedLabId = lab.rows[0].id;
    }

    try {
        const result = await query(
            `UPDATE courses SET
                code          = COALESCE($2, code),
                name          = COALESCE($3, name),
                incharge_id   = CASE WHEN $5::bool THEN $4 ELSE incharge_id END,
                department_id = CASE WHEN $7::bool THEN $6 ELSE department_id END,
                lab_id        = CASE WHEN $9::bool THEN $8 ELSE lab_id END
             WHERE id = $1
             RETURNING id, code, name, incharge_id, department_id, lab_id, created_at`,
            [
                id,
                code ?? null, name ?? null,
                resolvedInchargeId, touchIncharge,
                resolvedDeptId, touchDept,
                resolvedLabId, touchLab,
            ]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Course not found' });
        return res.json({ course: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Another course already uses that code' });
        }
        throw err;
    }
}

async function deleteCourse(req, res) {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid course id' });

    const del = await query('DELETE FROM courses WHERE id = $1', [id]);
    if (del.rowCount === 0) return res.status(404).json({ error: 'Course not found' });
    return res.status(204).end();
}

// Visibility:
//   admin    -> all courses (with incharge name)
//   incharge -> their own courses
//   ta       -> all courses
//   student  -> courses they're enrolled in
async function listCourses(req, res) {
    const { id, role } = req.user;
    let sql;
    let params;

    if (role === 'admin') {
        sql = `SELECT c.id, c.code, c.name, c.incharge_id, c.department_id, c.lab_id, c.created_at,
                      u.name AS incharge_name, u.email AS incharge_email,
                      d.name AS department_name,
                      l.name AS lab_name, l.room_no AS lab_room_no
               FROM courses c
               LEFT JOIN users u       ON u.id = c.incharge_id
               LEFT JOIN departments d ON d.id = c.department_id
               LEFT JOIN labs l        ON l.id = c.lab_id
               ORDER BY c.created_at DESC`;
        params = [];
    } else if (role === 'incharge') {
        sql = `SELECT c.id, c.code, c.name, c.incharge_id, c.created_at
               FROM courses c
               WHERE c.incharge_id = $1
               ORDER BY c.created_at DESC`;
        params = [id];
    } else if (role === 'ta') {
        sql = `SELECT c.id, c.code, c.name, c.incharge_id, c.created_at
               FROM courses c
               ORDER BY c.created_at DESC`;
        params = [];
    } else {
        sql = `SELECT c.id, c.code, c.name, c.incharge_id, c.created_at
               FROM courses c
               JOIN enrollments e ON e.course_id = c.id
               WHERE e.student_id = $1
               ORDER BY c.created_at DESC`;
        params = [id];
    }

    const result = await query(sql, params);
    return res.json({ courses: result.rows });
}

async function getCourse(req, res) {
    const courseId = parseInt(req.params.id, 10);
    if (Number.isNaN(courseId)) return res.status(400).json({ error: 'Invalid course id' });

    const course = await query(
        `SELECT c.id, c.code, c.name, c.incharge_id, c.department_id, c.lab_id, c.created_at,
                u.name AS incharge_name, u.email AS incharge_email,
                d.name AS department_name,
                l.name AS lab_name, l.room_no AS lab_room_no
         FROM courses c
         LEFT JOIN users u       ON u.id = c.incharge_id
         LEFT JOIN departments d ON d.id = c.department_id
         LEFT JOIN labs l        ON l.id = c.lab_id
         WHERE c.id = $1`,
        [courseId]
    );
    if (course.rowCount === 0) return res.status(404).json({ error: 'Course not found' });

    const { id, role } = req.user;
    const c = course.rows[0];
    if (role === 'incharge' && c.incharge_id !== id) {
        return res.status(403).json({ error: 'Not your course' });
    }
    if (role === 'student') {
        const enrolled = await query(
            'SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2',
            [id, courseId]
        );
        if (enrolled.rowCount === 0) {
            return res.status(403).json({ error: 'You are not enrolled in this course' });
        }
    }

    return res.json({ course: c });
}

// Helper: is the requester allowed to manage this course's roster?
async function assertCourseManager(req, res, courseId) {
    const result = await query('SELECT incharge_id FROM courses WHERE id = $1', [courseId]);
    if (result.rowCount === 0) {
        res.status(404).json({ error: 'Course not found' });
        return null;
    }
    const inchargeId = result.rows[0].incharge_id;
    if (req.user.role !== 'incharge' || inchargeId !== req.user.id) {
        res.status(403).json({ error: 'Only this course\'s incharge can manage enrollments' });
        return null;
    }
    return inchargeId;
}

async function enrollStudent(req, res) {
    const courseId = parseInt(req.params.id, 10);
    if (Number.isNaN(courseId)) return res.status(400).json({ error: 'Invalid course id' });

    const owner = await assertCourseManager(req, res, courseId);
    if (owner === null) return;

    const { studentId, email, rollNo } = req.body || {};
    if (!studentId && !email && !rollNo) {
        return res.status(400).json({ error: 'Provide studentId, email, or rollNo' });
    }

    let lookup;
    if (studentId) {
        lookup = await query(
            'SELECT id, role FROM users WHERE id = $1',
            [parseInt(studentId, 10)]
        );
    } else if (email) {
        lookup = await query('SELECT id, role FROM users WHERE email = $1', [email]);
    } else {
        lookup = await query('SELECT id, role FROM users WHERE roll_no = $1', [rollNo]);
    }

    if (lookup.rowCount === 0) return res.status(404).json({ error: 'Student not found' });
    const student = lookup.rows[0];
    if (student.role !== 'student') {
        return res.status(400).json({ error: 'Target user is not a student' });
    }

    try {
        const insert = await query(
            `INSERT INTO enrollments (student_id, course_id)
             VALUES ($1, $2)
             RETURNING id, student_id, course_id`,
            [student.id, courseId]
        );
        return res.status(201).json({ enrollment: insert.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Student is already enrolled' });
        }
        throw err;
    }
}

async function unenrollStudent(req, res) {
    const courseId = parseInt(req.params.id, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (Number.isNaN(courseId) || Number.isNaN(studentId)) {
        return res.status(400).json({ error: 'Invalid id' });
    }

    const owner = await assertCourseManager(req, res, courseId);
    if (owner === null) return;

    const del = await query(
        'DELETE FROM enrollments WHERE course_id = $1 AND student_id = $2',
        [courseId, studentId]
    );
    if (del.rowCount === 0) return res.status(404).json({ error: 'Enrollment not found' });
    return res.status(204).end();
}

async function listCourseStudents(req, res) {
    const courseId = parseInt(req.params.id, 10);
    if (Number.isNaN(courseId)) return res.status(400).json({ error: 'Invalid course id' });

    const course = await query('SELECT incharge_id FROM courses WHERE id = $1', [courseId]);
    if (course.rowCount === 0) return res.status(404).json({ error: 'Course not found' });

    const { id, role } = req.user;
    if (role === 'incharge' && course.rows[0].incharge_id !== id) {
        return res.status(403).json({ error: 'Not your course' });
    }
    // TA can view any course's roster; student cannot.
    if (role === 'student') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await query(
        `SELECT u.id, u.name, u.email, u.roll_no, u.class_name, u.div
         FROM enrollments e
         JOIN users u ON u.id = e.student_id
         WHERE e.course_id = $1
         ORDER BY u.class_name NULLS LAST, u.div NULLS LAST,
                  u.roll_no NULLS LAST, u.name`,
        [courseId]
    );
    return res.json({ students: result.rows });
}

// Public — used by the registration form. Returns id, code, name, department_id
// only, with optional ?department=<name|id> filter. No auth required.
async function listCourseCatalog(req, res) {
    const { department } = req.query;
    const params = [];
    const where = [];

    if (department) {
        // accept both numeric id and department name for convenience
        const asInt = parseInt(String(department), 10);
        if (!Number.isNaN(asInt) && String(asInt) === String(department)) {
            params.push(asInt);
            where.push(`c.department_id = $${params.length}`);
        } else {
            params.push(String(department));
            where.push(
                `c.department_id = (SELECT id FROM departments WHERE name = $${params.length})`
            );
        }
    }

    const sql = `SELECT c.id, c.code, c.name, c.department_id,
                        d.name AS department_name
                 FROM courses c
                 LEFT JOIN departments d ON d.id = c.department_id
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY c.name`;
    const result = await query(sql, params);
    return res.json({ courses: result.rows });
}

module.exports = {
    createCourse,
    updateCourse,
    deleteCourse,
    listCourses,
    getCourse,
    enrollStudent,
    unenrollStudent,
    listCourseStudents,
    listCourseCatalog,
};
