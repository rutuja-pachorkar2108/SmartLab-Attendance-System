const express = require('express');
const {
    createLab,
    listLabs,
    updateLab,
    deleteLab,
} = require('../controllers/labController');
const {
    checkInToLab,
    listLabActivePresence,
    listLabPresenceHistory,
} = require('../controllers/labPresenceController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { requireCollegeNetwork } = require('../middleware/network');

const router = express.Router();
router.use(requireAuth);

// Anyone authenticated can list labs (students need to pick one to check in).
router.get('/', listLabs);

// Admin-only CRUD
router.post('/',         requireRole('admin'), createLab);
router.patch('/:id',     requireRole('admin'), updateLab);
router.delete('/:id',    requireRole('admin'), deleteLab);

// Student check-in. Check-out happens via lab-presence routes.
router.post(
    '/:id/check-in',
    requireRole('student'),
    requireCollegeNetwork,
    checkInToLab
);

// Anyone authenticated can see who is currently in a given lab.
router.get('/:id/presence/active', listLabActivePresence);

// Staff can see the full visit history (timings) for a lab.
router.get(
    '/:id/presence/history',
    requireRole('admin', 'incharge', 'ta'),
    listLabPresenceHistory
);

module.exports = router;
