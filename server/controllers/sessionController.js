const { query } = require('../config/db');

// Course Incharge schedules a session window.
async function scheduleSession(req, res) {
    const { courseId, scheduledStart, scheduledEnd, notes } = req.body || {};
    const cid = parseInt(courseId, 10);
    if (Number.isNaN(cid)) return res.status(400).json({ error: 'courseId is required' });
    if (!scheduledStart || !scheduledEnd) {
        return res.status(400).json({ error: 'scheduledStart and scheduledEnd are required (ISO timestamps)' });
    }

    const start = new Date(scheduledStart);
    const end   = new Date(scheduledEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid timestamp format' });
    }
    if (end <= start) {
        return res.status(400).json({ error: 'scheduledEnd must be after scheduledStart' });
    }

    const course = await query('SELECT id, incharge_id FROM courses WHERE id = $1', [cid]);
    if (course.rowCount === 0) return res.status(404).json({ error: 'Course not found' });
    if (course.rows[0].incharge_id !== req.user.id) {
        return res.status(403).json({ error: 'Only the course incharge can schedule sessions for this course' });
    }

    try {
        const result = await query(
            `INSERT INTO sessions (course_id, created_by, scheduled_start, scheduled_end, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, course_id, created_by, scheduled_start, scheduled_end, notes, created_at`,
            [cid, req.user.id, start.toISOString(), end.toISOString(), notes || null]
        );
        return res.status(201).json({ session: result.rows[0] });
    } catch (err) {
        if (err.code === '23P01') {
            return res.status(409).json({ error: 'This time window overlaps an existing session for this course' });
        }
        throw err;
    }
}

async function deleteSession(req, res) {
    const sid = parseInt(req.params.id, 10);
    if (Number.isNaN(sid)) return res.status(400).json({ error: 'Invalid session id' });

    const session = await query(
        `SELECT s.id, c.incharge_id
         FROM sessions s
         JOIN courses c ON c.id = s.course_id
         WHERE s.id = $1`,
        [sid]
    );
    if (session.rowCount === 0) return res.status(404).json({ error: 'Session not found' });
    if (session.rows[0].incharge_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your course' });
    }

    await query('DELETE FROM sessions WHERE id = $1', [sid]);
    return res.status(204).end();
}

// Students: list sessions currently in their scheduled window for their enrolled courses.
async function listActiveSessions(req, res) {
    const result = await query(
        `SELECT s.id, s.course_id, s.scheduled_start, s.scheduled_end, c.code, c.name
         FROM sessions s
         JOIN courses c     ON c.id = s.course_id
         JOIN enrollments e ON e.course_id = c.id
         WHERE e.student_id = $1
           AND NOW() >= s.scheduled_start
           AND NOW() <  s.scheduled_end
         ORDER BY s.scheduled_start`,
        [req.user.id]
    );
    return res.json({ sessions: result.rows });
}

// Students: list upcoming sessions for their enrolled courses (next 7 days).
async function listUpcomingSessions(req, res) {
    const result = await query(
        `SELECT s.id, s.course_id, s.scheduled_start, s.scheduled_end, c.code, c.name
         FROM sessions s
         JOIN courses c     ON c.id = s.course_id
         JOIN enrollments e ON e.course_id = c.id
         WHERE e.student_id = $1
           AND s.scheduled_start > NOW()
           AND s.scheduled_start <= NOW() + INTERVAL '7 days'
         ORDER BY s.scheduled_start`,
        [req.user.id]
    );
    return res.json({ sessions: result.rows });
}

async function listCourseSessions(req, res) {
    const cid = parseInt(req.params.id, 10);
    if (Number.isNaN(cid)) return res.status(400).json({ error: 'Invalid course id' });

    const course = await query('SELECT id, incharge_id FROM courses WHERE id = $1', [cid]);
    if (course.rowCount === 0) return res.status(404).json({ error: 'Course not found' });

    const { id: userId, role } = req.user;
    if (role === 'incharge' && course.rows[0].incharge_id !== userId) {
        return res.status(403).json({ error: 'Not your course' });
    }
    if (role === 'student') {
        const enrolled = await query(
            'SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2',
            [userId, cid]
        );
        if (enrolled.rowCount === 0) {
            return res.status(403).json({ error: 'You are not enrolled in this course' });
        }
    }

    const result = await query(
        `SELECT id, course_id, created_by, scheduled_start, scheduled_end, notes, created_at,
                (NOW() >= scheduled_start AND NOW() < scheduled_end) AS is_live,
                (scheduled_end <= NOW()) AS is_past
         FROM sessions
         WHERE course_id = $1
         ORDER BY scheduled_start DESC`,
        [cid]
    );
    return res.json({ sessions: result.rows });
}

module.exports = {
    scheduleSession,
    deleteSession,
    listActiveSessions,
    listUpcomingSessions,
    listCourseSessions,
};
