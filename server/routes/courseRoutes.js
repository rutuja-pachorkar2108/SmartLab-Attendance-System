const express = require('express');
const {
    createCourse,
    updateCourse,
    deleteCourse,
    listCourses,
    getCourse,
    enrollStudent,
    unenrollStudent,
    listCourseStudents,
    listCourseCatalog,
} = require('../controllers/courseController');
const { listCourseSessions } = require('../controllers/sessionController');
const { courseAttendanceSummary } = require('../controllers/attendanceController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

// Public catalog — used by the registration form. Must be declared before
// the requireAuth gate below.
router.get('/catalog', listCourseCatalog);

router.use(requireAuth);

router.get('/', listCourses);
router.post('/', requireRole('admin'), createCourse);
router.get('/:id', getCourse);
router.patch('/:id', requireRole('admin'), updateCourse);
router.delete('/:id', requireRole('admin'), deleteCourse);

router.get('/:id/students', listCourseStudents);
router.get('/:id/sessions', listCourseSessions);
router.get('/:id/attendance-summary', courseAttendanceSummary);
router.post('/:id/enrollments', requireRole('incharge'), enrollStudent);
router.delete('/:id/enrollments/:studentId', requireRole('incharge'), unenrollStudent);

module.exports = router;
