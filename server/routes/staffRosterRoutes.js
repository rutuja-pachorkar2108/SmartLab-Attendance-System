const express = require('express');
const {
    listStaffRoster,
    addStaffRosterEntry,
    bulkAddStaffRosterEntries,
    updateStaffRosterEntry,
    deleteStaffRosterEntry,
} = require('../controllers/staffRosterController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', listStaffRoster);
router.post('/', addStaffRosterEntry);
router.post('/bulk', bulkAddStaffRosterEntries);
router.patch('/:id', updateStaffRosterEntry);
router.delete('/:id', deleteStaffRosterEntry);

module.exports = router;
