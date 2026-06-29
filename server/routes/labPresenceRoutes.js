const express = require('express');
const {
    checkOut,
    myCurrent,
    myHistory,
} = require('../controllers/labPresenceController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { requireCollegeNetwork } = require('../middleware/network');

const router = express.Router();
router.use(requireAuth);

router.get('/me/current',  requireRole('student'), myCurrent);
router.get('/me/history',  requireRole('student'), myHistory);
router.post('/:id/check-out', requireRole('student'), requireCollegeNetwork, checkOut);

module.exports = router;
