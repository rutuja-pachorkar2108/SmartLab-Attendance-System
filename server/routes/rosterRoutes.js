const express = require('express');
const {
    listRoster,
    addRosterEntry,
    bulkAddRosterEntries,
    updateRosterEntry,
    deleteRosterEntry,
} = require('../controllers/rosterController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', listRoster);
router.post('/', addRosterEntry);
router.post('/bulk', bulkAddRosterEntries);
router.patch('/:id', updateRosterEntry);
router.delete('/:id', deleteRosterEntry);

module.exports = router;
