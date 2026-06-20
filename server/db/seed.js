require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

const PASSWORD = 'password123';

const USERS = [
    { name: 'Admin User',  email: 'admin@col.edu',   role: 'admin',    employee_id: 'A001' },
    { name: 'Prof. Roy',   email: 'roy@col.edu',     role: 'incharge', employee_id: 'E101' },
    { name: 'Asst. Khan',  email: 'khan@col.edu',    role: 'ta',       employee_id: 'E202' },
    { name: 'Aqil Ahmed',  email: 's1@col.edu',      role: 'student',  roll_no: '22BCE001' },
    { name: 'Bina Patel',  email: 's2@col.edu',      role: 'student',  roll_no: '22BCE002' },
    { name: 'Chetan Rao',  email: 's3@col.edu',      role: 'student',  roll_no: '22BCE003' },
    { name: 'Diya Singh',  email: 's4@col.edu',      role: 'student',  roll_no: '22BCE004' },
    { name: 'Esha Iyer',   email: 's5@col.edu',      role: 'student',  roll_no: '22BCE005' },
];

const COURSES = [
    { code: 'CS-LAB-1', name: 'Data Structures Lab' },
    { code: 'CS-LAB-2', name: 'Operating Systems Lab' },
];

const LABS = [
    {
        name: 'Computer Lab 1',
        room_no: '301',
        department: 'Computer Engineering',
        floor: '3rd',
        pc_count: 30,
    },
    {
        name: 'Computer Lab 2',
        room_no: '302',
        department: 'Computer Engineering',
        floor: '3rd',
        pc_count: 30,
    },
];

async function upsertUser(u, hash) {
    const result = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, roll_no, employee_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE
            SET name = EXCLUDED.name,
                role = EXCLUDED.role,
                roll_no = EXCLUDED.roll_no,
                employee_id = EXCLUDED.employee_id
         RETURNING id, email, role`,
        [u.name, u.email, hash, u.role, u.roll_no || null, u.employee_id || null]
    );
    return result.rows[0];
}

async function upsertCourse(c, inchargeId) {
    const result = await pool.query(
        `INSERT INTO courses (code, name, incharge_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE
            SET name = EXCLUDED.name,
                incharge_id = EXCLUDED.incharge_id
         RETURNING id, code`,
        [c.code, c.name, inchargeId]
    );
    return result.rows[0];
}

async function upsertLab(l, adminId, taId) {
    const result = await pool.query(
        `INSERT INTO labs (name, room_no, department, floor, pc_count, ta_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (room_no) DO UPDATE
            SET name = EXCLUDED.name,
                department = EXCLUDED.department,
                floor = EXCLUDED.floor,
                pc_count = EXCLUDED.pc_count,
                ta_id = EXCLUDED.ta_id
         RETURNING id, name, room_no`,
        [l.name, l.room_no, l.department, l.floor, l.pc_count, taId, adminId]
    );
    return result.rows[0];
}

async function enroll(studentId, courseId) {
    await pool.query(
        `INSERT INTO enrollments (student_id, course_id)
         VALUES ($1, $2)
         ON CONFLICT (student_id, course_id) DO NOTHING`,
        [studentId, courseId]
    );
}

async function scheduleSession(courseId, inchargeId, start, end, notes) {
    // Idempotent: skip if a session with the exact same start already exists.
    const existing = await pool.query(
        'SELECT id FROM sessions WHERE course_id = $1 AND scheduled_start = $2',
        [courseId, start]
    );
    if (existing.rowCount > 0) return existing.rows[0];
    const result = await pool.query(
        `INSERT INTO sessions (course_id, created_by, scheduled_start, scheduled_end, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, scheduled_start, scheduled_end`,
        [courseId, inchargeId, start, end, notes]
    );
    return result.rows[0];
}

async function main() {
    const hash = await bcrypt.hash(PASSWORD, parseInt(process.env.BCRYPT_ROUNDS || '10', 10));

    const created = [];
    for (const u of USERS) created.push(await upsertUser(u, hash));

    const admin = created.find((u) => u.role === 'admin');
    const incharge = created.find((u) => u.role === 'incharge');
    const ta = created.find((u) => u.role === 'ta');
    const students = created.filter((u) => u.role === 'student');

    const courses = [];
    for (const c of COURSES) courses.push(await upsertCourse(c, incharge.id));

    for (const c of courses) {
        for (const s of students) await enroll(s.id, c.id);
    }

    // Seed assigns the only TA to the first lab; second lab is left unassigned
    // so admins can see both states in the dashboard.
    const labs = [];
    for (let i = 0; i < LABS.length; i++) {
        const assignedTa = i === 0 ? ta.id : null;
        labs.push(await upsertLab(LABS[i], admin.id, assignedTa));
    }

    // Schedule one currently-active session and one upcoming session for the first course.
    const now = new Date();
    const liveStart = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
    const liveEnd   = new Date(now.getTime() + 60 * 60 * 1000); // 60 min from now
    const upStart   = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow
    const upEnd     = new Date(upStart.getTime() + 2 * 60 * 60 * 1000);

    const liveSession = await scheduleSession(
        courses[0].id, incharge.id, liveStart, liveEnd, 'Live demo session (seeded)'
    );
    const upSession = await scheduleSession(
        courses[0].id, incharge.id, upStart, upEnd, 'Upcoming session (seeded)'
    );

    console.log('Seed complete. All passwords are:', PASSWORD);
    console.table(created.map((u) => ({ email: u.email, role: u.role })));
    console.table(courses.map((c) => ({ code: c.code, id: c.id })));
    console.table(labs.map((l) => ({ room: l.room_no, name: l.name, id: l.id })));
    console.table([
        { kind: 'live',     id: liveSession.id, start: liveSession.scheduled_start, end: liveSession.scheduled_end },
        { kind: 'upcoming', id: upSession.id,   start: upSession.scheduled_start,   end: upSession.scheduled_end   },
    ]);

    await pool.end();
}

main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
