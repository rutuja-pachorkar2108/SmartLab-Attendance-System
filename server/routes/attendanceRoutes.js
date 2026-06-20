const express = require('express');
const { myAttendance } = require('../controllers/attendanceController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(requireAuth);

router.get('/me', requireRole('student'), myAttendance);

module.exports = router;
