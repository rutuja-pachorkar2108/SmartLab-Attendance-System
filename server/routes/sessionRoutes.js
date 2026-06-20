const express = require('express');
const {
    scheduleSession,
    deleteSession,
    listActiveSessions,
    listUpcomingSessions,
} = require('../controllers/sessionController');
const {
    markAttendance,
    listSessionAttendance,
} = require('../controllers/attendanceController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { requireCollegeNetwork } = require('../middleware/network');

const router = express.Router();

router.use(requireAuth);

router.post('/',           requireRole('incharge'), scheduleSession);
router.delete('/:id',      requireRole('incharge'), deleteSession);

router.get('/active',      requireRole('student'), listActiveSessions);
router.get('/upcoming',    requireRole('student'), listUpcomingSessions);

router.post(
    '/:id/attendance',
    requireRole('student'),
    requireCollegeNetwork,
    markAttendance
);
router.get(
    '/:id/attendance',
    requireRole('incharge', 'ta'),
    listSessionAttendance
);

module.exports = router;
