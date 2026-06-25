const { randomUUID } = require('crypto');
const { query } = require('../config/db');

// A semester is ~15-16 weeks; cap weekly recurrence here so a bad input can't
// flood the table with hundreds of rows.
const MAX_REPEAT_WEEKS = 30;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Course Incharge schedules a practical session window. Practicals usually
// repeat weekly, so an optional `repeatWeeks` (>= 1) materialises one concrete
// session per week on the same weekday/time — each becomes live on its own day
// and students mark attendance for it independently.
async function scheduleSession(req, res) {
    const { courseId, scheduledStart, scheduledEnd, notes, repeatWeeks } = req.body || {};
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

    // Default to a single session; clamp the recurrence count to a sane range.
    let weeks = parseInt(repeatWeeks, 10);
    if (Number.isNaN(weeks) || weeks < 1) weeks = 1;
    if (weeks > MAX_REPEAT_WEEKS) weeks = MAX_REPEAT_WEEKS;

    const course = await query('SELECT id, incharge_id FROM courses WHERE id = $1', [cid]);
    if (course.rowCount === 0) return res.status(404).json({ error: 'Course not found' });
    if (course.rows[0].incharge_id !== req.user.id) {
        return res.status(403).json({ error: 'Only the course incharge can schedule sessions for this course' });
    }

    // Tag every occurrence of a recurring schedule with one shared series_id so
    // the incharge can later delete the whole series at once. One-off sessions
    // get no series id.
    const seriesId = weeks > 1 ? randomUUID() : null;

    // Create each weekly occurrence. India has no DST, so shifting by a fixed
    // 7-day offset keeps the same wall-clock time every week. Overlaps with an
    // existing session are skipped (not fatal) so the rest still get created.
    const created = [];
    let skipped = 0;
    for (let i = 0; i < weeks; i++) {
        const s = new Date(start.getTime() + i * WEEK_MS);
        const e = new Date(end.getTime() + i * WEEK_MS);
        try {
            const result = await query(
                `INSERT INTO sessions (course_id, created_by, scheduled_start, scheduled_end, notes, series_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, course_id, created_by, scheduled_start, scheduled_end, notes, series_id, created_at`,
                [cid, req.user.id, s.toISOString(), e.toISOString(), notes || null, seriesId]
            );
            created.push(result.rows[0]);
        } catch (err) {
            if (err.code === '23P01') { skipped += 1; continue; }
            throw err;
        }
    }

    if (created.length === 0) {
        return res.status(409).json({
            error: weeks === 1
                ? 'This time window overlaps an existing session for this course'
                : 'All of those weekly sessions overlap existing ones',
        });
    }

    return res.status(201).json({
        sessions: created,
        session: created[0],
        created: created.length,
        skipped,
    });
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

// Delete every session in a weekly series at once. Only the incharge who owns
// the course the series belongs to may do this. Marked attendance for those
// sessions is removed too (FK cascade), matching single-session delete.
async function deleteSessionSeries(req, res) {
    const seriesId = req.params.seriesId;
    // Basic UUID shape check so a malformed id fails fast as a 400, not a 500.
    if (!/^[0-9a-fA-F-]{36}$/.test(seriesId || '')) {
        return res.status(400).json({ error: 'Invalid series id' });
    }

    // Scope the delete to sessions in this series that belong to a course the
    // requesting incharge owns — so one incharge can't delete another's series.
    const result = await query(
        `DELETE FROM sessions s
         USING courses c
         WHERE s.course_id = c.id
           AND s.series_id = $1
           AND c.incharge_id = $2`,
        [seriesId, req.user.id]
    );

    if (result.rowCount === 0) {
        return res.status(404).json({ error: 'No sessions found for this series' });
    }
    return res.json({ deleted: result.rowCount });
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
        `SELECT id, course_id, created_by, scheduled_start, scheduled_end, notes, series_id, created_at,
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
    deleteSessionSeries,
    listActiveSessions,
    listUpcomingSessions,
    listCourseSessions,
};
