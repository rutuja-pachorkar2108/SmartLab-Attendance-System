const { query } = require('../config/db');

// Student clicks the "I'm here" button.
// Pre-checks already enforced by middleware: authenticated, role=student, on college network.
async function markAttendance(req, res) {
    const sid = parseInt(req.params.id, 10);
    if (Number.isNaN(sid)) return res.status(400).json({ error: 'Invalid session id' });

    const session = await query(
        `SELECT s.id, s.course_id, s.scheduled_start, s.scheduled_end
         FROM sessions s
         WHERE s.id = $1`,
        [sid]
    );
    if (session.rowCount === 0) return res.status(404).json({ error: 'Session not found' });
    const { course_id, scheduled_start, scheduled_end } = session.rows[0];

    const now = new Date();
    if (now < new Date(scheduled_start)) {
        return res.status(409).json({ error: 'Session has not started yet' });
    }
    if (now >= new Date(scheduled_end)) {
        return res.status(409).json({ error: 'Session has already ended' });
    }

    const enrolled = await query(
        'SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2',
        [req.user.id, course_id]
    );
    if (enrolled.rowCount === 0) {
        return res.status(403).json({ error: 'You are not enrolled in this course' });
    }

    try {
        const insert = await query(
            `INSERT INTO attendance (session_id, student_id, ip_address, status)
             VALUES ($1, $2, $3, 'present')
             RETURNING id, session_id, student_id, marked_at, ip_address, status`,
            [sid, req.user.id, req.ip]
        );
        return res.status(201).json({ attendance: insert.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'You have already marked attendance for this session' });
        }
        throw err;
    }
}

// Incharge of the course or any TA: see who's marked + who hasn't.
async function listSessionAttendance(req, res) {
    const sid = parseInt(req.params.id, 10);
    if (Number.isNaN(sid)) return res.status(400).json({ error: 'Invalid session id' });

    const session = await query(
        `SELECT s.id, s.course_id, s.scheduled_start, s.scheduled_end, c.incharge_id
         FROM sessions s
         JOIN courses c ON c.id = s.course_id
         WHERE s.id = $1`,
        [sid]
    );
    if (session.rowCount === 0) return res.status(404).json({ error: 'Session not found' });

    const s = session.rows[0];
    if (req.user.role === 'incharge' && s.incharge_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your course' });
    }

    const result = await query(
        `SELECT u.id        AS student_id,
                u.name      AS student_name,
                u.roll_no,
                a.id        AS attendance_id,
                a.marked_at,
                a.ip_address,
                COALESCE(a.status, 'absent') AS status
         FROM enrollments e
         JOIN users u  ON u.id = e.student_id
         LEFT JOIN attendance a
                ON a.session_id = $1 AND a.student_id = e.student_id
         WHERE e.course_id = $2
         ORDER BY u.roll_no NULLS LAST, u.name`,
        [sid, s.course_id]
    );

    const now = new Date();
    return res.json({
        session: {
            id: s.id,
            course_id: s.course_id,
            scheduled_start: s.scheduled_start,
            scheduled_end: s.scheduled_end,
            is_live: now >= new Date(s.scheduled_start) && now < new Date(s.scheduled_end),
            is_past: now >= new Date(s.scheduled_end),
        },
        roster: result.rows,
    });
}

// Student-only: own attendance summary across all enrolled courses.
// "total" counts sessions whose scheduled_end has passed (i.e. completed practicals).
async function myAttendance(req, res) {
    const studentId = req.user.id;

    const summary = await query(
        `SELECT c.id    AS course_id,
                c.code,
                c.name,
                COUNT(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL) AS total_sessions,
                COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'present') AS present_count
         FROM enrollments e
         JOIN courses  c ON c.id = e.course_id
         LEFT JOIN sessions s
                ON s.course_id = c.id AND s.scheduled_end <= NOW()
         LEFT JOIN attendance a
                ON a.session_id = s.id AND a.student_id = $1
         WHERE e.student_id = $1
         GROUP BY c.id, c.code, c.name
         ORDER BY c.code`,
        [studentId]
    );

    const records = await query(
        `SELECT a.id, a.session_id, a.marked_at, a.status,
                s.scheduled_start, s.scheduled_end,
                c.code, c.name
         FROM attendance a
         JOIN sessions s ON s.id = a.session_id
         JOIN courses  c ON c.id = s.course_id
         WHERE a.student_id = $1
         ORDER BY a.marked_at DESC`,
        [studentId]
    );

    const courses = summary.rows.map((row) => {
        const total = parseInt(row.total_sessions, 10) || 0;
        const present = parseInt(row.present_count, 10) || 0;
        const percentage = total === 0 ? null : Math.round((present / total) * 1000) / 10;
        return {
            course_id: row.course_id,
            code: row.code,
            name: row.name,
            total_sessions: total,
            present_count: present,
            percentage,
        };
    });

    return res.json({ courses, records: records.rows });
}

// Incharge (own course) / TA / admin: aggregated attendance for visualization.
// Returns per-session present counts and per-student attendance across past sessions.
async function courseAttendanceSummary(req, res) {
    const courseId = parseInt(req.params.id, 10);
    if (Number.isNaN(courseId)) return res.status(400).json({ error: 'Invalid course id' });

    const course = await query('SELECT incharge_id FROM courses WHERE id = $1', [courseId]);
    if (course.rowCount === 0) return res.status(404).json({ error: 'Course not found' });

    const { id: userId, role } = req.user;
    if (role === 'student') return res.status(403).json({ error: 'Forbidden' });
    if (role === 'incharge' && course.rows[0].incharge_id !== userId) {
        return res.status(403).json({ error: 'Not your course' });
    }

    const totalsRow = await query(
        `SELECT
            (SELECT COUNT(*)::int FROM enrollments WHERE course_id = $1) AS students,
            (SELECT COUNT(*)::int FROM sessions WHERE course_id = $1) AS sessions,
            (SELECT COUNT(*)::int FROM sessions WHERE course_id = $1 AND scheduled_end <= NOW()) AS past_sessions,
            (SELECT COUNT(*)::int FROM sessions WHERE course_id = $1 AND NOW() >= scheduled_start AND NOW() < scheduled_end) AS live_sessions,
            (SELECT COUNT(*)::int FROM sessions WHERE course_id = $1 AND scheduled_start > NOW()) AS upcoming_sessions`,
        [courseId]
    );
    const totals = totalsRow.rows[0];

    const sessions = await query(
        `SELECT s.id, s.scheduled_start, s.scheduled_end, s.notes,
                (NOW() >= s.scheduled_start AND NOW() < s.scheduled_end) AS is_live,
                (s.scheduled_end <= NOW()) AS is_past,
                COUNT(a.id) FILTER (WHERE a.status = 'present')::int AS present_count
         FROM sessions s
         LEFT JOIN attendance a ON a.session_id = s.id
         WHERE s.course_id = $1
         GROUP BY s.id
         ORDER BY s.scheduled_start`,
        [courseId]
    );

    const students = await query(
        `SELECT u.id AS student_id, u.name, u.roll_no, u.class_name, u.div,
                COUNT(DISTINCT a.session_id)::int AS present_count
         FROM enrollments e
         JOIN users u ON u.id = e.student_id
         LEFT JOIN sessions s
                ON s.course_id = e.course_id AND s.scheduled_end <= NOW()
         LEFT JOIN attendance a
                ON a.session_id = s.id AND a.student_id = u.id AND a.status = 'present'
         WHERE e.course_id = $1
         GROUP BY u.id, u.name, u.roll_no, u.class_name, u.div
         ORDER BY u.class_name NULLS LAST, u.div NULLS LAST, u.roll_no NULLS LAST, u.name`,
        [courseId]
    );

    // Per-student-per-session presence for past sessions, so the client can plot
    // an individual student's attendance progress over time (present/absent per
    // session) rather than only the class aggregate.
    const records = await query(
        `SELECT a.student_id, a.session_id
         FROM attendance a
         JOIN sessions s ON s.id = a.session_id
         WHERE s.course_id = $1 AND s.scheduled_end <= NOW() AND a.status = 'present'`,
        [courseId]
    );

    const pct = (num, den) => (den === 0 ? null : Math.round((num / den) * 1000) / 10);

    return res.json({
        totals,
        sessions: sessions.rows.map((s) => ({
            ...s,
            total_students: totals.students,
            percentage: pct(s.present_count, totals.students),
        })),
        students: students.rows.map((r) => ({
            ...r,
            total_sessions: totals.past_sessions,
            percentage: pct(r.present_count, totals.past_sessions),
        })),
        records: records.rows,
    });
}

module.exports = { markAttendance, listSessionAttendance, myAttendance, courseAttendanceSummary };
