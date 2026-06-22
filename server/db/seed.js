require('dotenv').config();
const bcrypt = require('bcryptjs');
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

// Department -> official course catalog. The registration form lets a Course
// Incharge pick a department and then check the courses (assigned by the
// college) they teach; that picker reads from `courses` filtered by
// department_id, so every course below is linked to its department here.
//
// Course codes are globally UNIQUE (see schema). The first two Computer
// Engineering codes are kept as CS-LAB-1/CS-LAB-2 so re-seeding updates the
// original demo rows (and back-fills their department_id) instead of orphaning
// them. The first of these stays assigned to Prof. Roy for the demo sessions.
const DEPARTMENTS = [
    {
        name: 'Computer Engineering',
        courses: [
            { code: 'CS-LAB-1', name: 'Data Structures Lab' },
            { code: 'CS-LAB-2', name: 'Operating Systems Lab' },
            { code: 'CO-DBL', name: 'Database Management Systems Lab' },
            { code: 'CO-CNL', name: 'Computer Networks Lab' },
            { code: 'CO-WTL', name: 'Web Technology Lab' },
            { code: 'CO-MLL', name: 'Machine Learning Lab' },
        ],
    },
    {
        name: 'Information Technology',
        courses: [
            { code: 'IT-PPL', name: 'Python Programming Lab' },
            { code: 'IT-DBL', name: 'Database Systems Lab' },
            { code: 'IT-SEL', name: 'Software Engineering Lab' },
            { code: 'IT-DSL', name: 'Data Science Lab' },
            { code: 'IT-CCL', name: 'Cloud Computing Lab' },
        ],
    },
    {
        name: 'Electronics & Telecommunication',
        courses: [
            { code: 'ET-DEL', name: 'Digital Electronics Lab' },
            { code: 'ET-MPL', name: 'Microprocessor Lab' },
            { code: 'ET-SPL', name: 'Signal Processing Lab' },
            { code: 'ET-VLL', name: 'VLSI Design Lab' },
            { code: 'ET-CSL', name: 'Communication Systems Lab' },
        ],
    },
    {
        name: 'Mechanical Engineering',
        courses: [
            { code: 'ME-TDL', name: 'Thermodynamics Lab' },
            { code: 'ME-CAD', name: 'CAD / CAM Lab' },
            { code: 'ME-MPL', name: 'Manufacturing Process Lab' },
            { code: 'ME-FML', name: 'Fluid Mechanics Lab' },
            { code: 'ME-TOM', name: 'Theory of Machines Lab' },
        ],
    },
    {
        name: 'Civil Engineering',
        courses: [
            { code: 'CE-SUL', name: 'Surveying Lab' },
            { code: 'CE-CTL', name: 'Concrete Technology Lab' },
            { code: 'CE-GTL', name: 'Geotechnical Engineering Lab' },
            { code: 'CE-EEL', name: 'Environmental Engineering Lab' },
            { code: 'CE-SAL', name: 'Structural Analysis Lab' },
        ],
    },
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

async function upsertDepartment(name) {
    const result = await pool.query(
        `INSERT INTO departments (name)
         VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name`,
        [name]
    );
    return result.rows[0];
}

async function upsertCourse(c, inchargeId, departmentId) {
    const result = await pool.query(
        `INSERT INTO courses (code, name, incharge_id, department_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE
            SET name = EXCLUDED.name,
                incharge_id = EXCLUDED.incharge_id,
                department_id = EXCLUDED.department_id
         RETURNING id, code, department_id`,
        [c.code, c.name, inchargeId, departmentId]
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

    // Seed each department and its official course catalog. Only the two
    // original Computer Engineering demo labs (CS-LAB-1/CS-LAB-2) get assigned
    // to Prof. Roy and have students enrolled; the rest of the catalog is left
    // unassigned so it appears in the registration picker for incharges to
    // claim, exactly as the college authority would have set it up.
    const DEMO_COURSE_CODES = new Set(['CS-LAB-1', 'CS-LAB-2']);
    const courses = [];
    const demoCourses = [];
    for (const dept of DEPARTMENTS) {
        const department = await upsertDepartment(dept.name);
        for (const c of dept.courses) {
            const isDemo = DEMO_COURSE_CODES.has(c.code);
            const course = await upsertCourse(c, isDemo ? incharge.id : null, department.id);
            courses.push({ ...course, department: department.name });
            if (isDemo) demoCourses.push(course);
        }
    }

    for (const c of demoCourses) {
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
        demoCourses[0].id, incharge.id, liveStart, liveEnd, 'Live demo session (seeded)'
    );
    const upSession = await scheduleSession(
        demoCourses[0].id, incharge.id, upStart, upEnd, 'Upcoming session (seeded)'
    );

    console.log('Seed complete. All passwords are:', PASSWORD);
    console.table(created.map((u) => ({ email: u.email, role: u.role })));
    console.table(courses.map((c) => ({ code: c.code, course: c.id, department: c.department })));
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
