require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const courseRoutes = require('./routes/courseRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const rosterRoutes = require('./routes/rosterRoutes');
const staffRosterRoutes = require('./routes/staffRosterRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const labRoutes = require('./routes/labRoutes');
const labPresenceRoutes = require('./routes/labPresenceRoutes');

const app = express();

if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', true);
}

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({ ok: true, ip: req.ip });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/staff-roster', staffRosterRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/labs', labRoutes);
app.use('/api/lab-presence', labPresenceRoutes);

// Unknown route → JSON 404 instead of Express's default HTML error page, so the
// client always receives a parseable { error } shape it can show to the user.
app.use((req, res) => {
    res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

const port = parseInt(process.env.PORT || '4000', 10);
app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});

// - Server: npm run dev in server/
//     - Client: npm run dev in client/
//   - PostgreSQL now auto-starts as a Windows service (postgresql-x64-18), so the database will be up automatically — you
//   don't need to re-run the db:init/migrate/seed steps unless you want to reset the data.
