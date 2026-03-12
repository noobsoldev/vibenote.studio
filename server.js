require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs');
const { initDb, getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// VIEW ENGINE
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

// Raw body for Razorpay webhook
app.use('/plans/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Sessions — using in-memory store (works on all hosts, no native deps)
app.use(session({
  secret: process.env.SESSION_SECRET || 'vibenote-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: false
  }
}));

// ==========================================
// ROUTES
// ==========================================
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const projectRoutes = require('./routes/projects');
const generateRoutes = require('./routes/generate');
const deployRoutes = require('./routes/deploy');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');

app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/projects', projectRoutes);
app.use('/generate', generateRoutes);
app.use('/deploy', deployRoutes);
app.use('/plans', paymentRoutes);
app.use('/admin', adminRoutes);

// Root redirect
app.get('/', (req, res) => {
  if (req.session.agencyId) return res.redirect('/dashboard');
  res.redirect('/login');
});

// Join with referral shortlink
app.get('/join', (req, res) => {
  const ref = req.query.ref || '';
  res.redirect(`/signup?ref=${ref}`);
});

// ==========================================
// ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (req.xhr || req.path.startsWith('/generate') || req.path.startsWith('/deploy')) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  res.status(500).render('error', { message: err.message || 'An unexpected error occurred.' });
});

app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found.' });
});

// ==========================================
// BOOTSTRAP
// ==========================================
async function bootstrap() {
  const db = getDb();
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM agencies').get();
    if (count && count.c === 0) {
      const bcrypt = require('bcrypt');
      const seedCode = 'VIBENOTE2024';
      const seedHash = bcrypt.hashSync('seedpassword', 10);
      db.prepare(`
        INSERT OR IGNORE INTO agencies (name, email, password_hash, referral_code, plan, site_credits, status)
        VALUES (?, ?, ?, ?, 'agency', 999, 'active')
      `).run('Vibenote Seed', 'seed@vibenote.studio', seedHash, seedCode);
      console.log('[BOOTSTRAP] Seed created. Referral code: VIBENOTE2024');
    }
  } catch (e) {
    console.error('[BOOTSTRAP] Failed:', e.message);
  }
}

// ==========================================
// CRON — Monthly credit reset
// ==========================================
function setupCron() {
  cron.schedule('0 0 1 * *', () => {
    console.log('[CRON] Resetting monthly site credits...');
    const db = getDb();
    const planCredits = { free: 1, starter: 1, growth: 10, agency: 50 };
    try {
      const agencies = db.prepare("SELECT id, plan FROM agencies WHERE status = 'active'").all();
      for (const a of agencies) {
        const credits = planCredits[a.plan] || 1;
        db.prepare('UPDATE agencies SET site_credits = ? WHERE id = ?').run(credits, a.id);
      }
      console.log(`[CRON] Reset credits for ${agencies.length} agencies.`);
    } catch (err) {
      console.error('[CRON] Credit reset failed:', err);
    }
  });
}

// ==========================================
// START
// ==========================================
initDb().then(async () => {
  await bootstrap();
  setupCron();
  app.listen(PORT, () => {
    console.log(`\n✦ Vibenote.studio running on http://localhost:${PORT}`);
    console.log(`  Admin: http://localhost:${PORT}/admin`);
    console.log(`  First signup referral code: VIBENOTE2024\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

module.exports = app;
