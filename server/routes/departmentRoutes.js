const express = require('express');
const {
    listDepartments,
    createDepartment,
    deleteDepartment,
} = require('../controllers/departmentController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

// Public — used by the registration form.
router.get('/', listDepartments);

// Admin only.
router.post('/', requireAuth, requireRole('admin'), createDepartment);
router.delete('/:id', requireAuth, requireRole('admin'), deleteDepartment);

module.exports = router;
