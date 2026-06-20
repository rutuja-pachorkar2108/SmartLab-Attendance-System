const express = require('express');
const {
    listUsers,
    resetPassword,
    updateUser,
    deleteUser,
} = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', listUsers);
router.patch('/:id', updateUser);
router.patch('/:id/password', resetPassword);
router.delete('/:id', deleteUser);

module.exports = router;
