const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a), transaction: (...a) => getDb().transaction(...a) };
const { requireAdmin } = require('../middleware/auth');

// GET /admin/login
router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin', { view: 'login', error: null, data: {} });
});

// POST /admin/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      req.session.isAdmin = true;
      req.session.save(() => res.redirect('/admin'));
    } else {
      res.render('admin', { view: 'login', error: 'Invalid credentials.', data: {} });
    }
  } catch (err) {
    res.render('admin', { view: 'login', error: 'Error during login.', data: {} });
  }
});

// GET /admin/logout
router.get('/logout', (req, res) => {
  req.session.isAdmin = false;
  req.session.save(() => res.redirect('/admin/login'));
});

// GET /admin - dashboard
router.get('/', requireAdmin, (req, res) => {
  try {
    const agencies = db.prepare('SELECT * FROM agencies ORDER BY created_at DESC').all();
    const projects = db.prepare('SELECT p.*, a.name AS agency_name FROM projects p JOIN agencies a ON a.id = p.agency_id ORDER BY p.updated_at DESC').all();
    const referrals = db.prepare('SELECT r.*, a1.name AS referrer_name, a2.name AS referred_name FROM referrals r JOIN agencies a1 ON a1.id = r.referrer_id JOIN agencies a2 ON a2.id = r.referred_id ORDER BY r.created_at DESC').all();

    const stats = {
      totalAgencies: agencies.length,
      activeAgencies: agencies.filter(a => a.status === 'active').length,
      totalProjects: projects.length,
      generatedProjects: projects.filter(p => p.status === 'generated' || p.status === 'live').length,
      liveProjects: projects.filter(p => p.status === 'live').length,
      totalReferrals: referrals.length
    };

    res.render('admin', { view: 'dashboard', error: null, data: { agencies, projects, referrals, stats } });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).render('admin', { view: 'login', error: 'Failed to load admin dashboard.', data: {} });
  }
});

// POST /admin/agency/:id/status - approve or suspend
router.post('/agency/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  try {
    db.prepare('UPDATE agencies SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

// POST /admin/agency/:id/credits - manually add credits
router.post('/agency/:id/credits', requireAdmin, (req, res) => {
  const { credits } = req.body;
  try {
    db.prepare('UPDATE agencies SET site_credits = site_credits + ? WHERE id = ?').run(Number(credits) || 0, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update credits.' });
  }
});

// DELETE /admin/agency/:id
router.delete('/agency/:id', requireAdmin, (req, res) => {
  try {
    const agencyId = req.params.id;
    const projects = db.prepare('SELECT id FROM projects WHERE agency_id = ?').all(agencyId);
    for (const p of projects) {
      db.prepare('DELETE FROM chat_history WHERE project_id = ?').run(p.id);
    }
    db.prepare('DELETE FROM projects WHERE agency_id = ?').run(agencyId);
    db.prepare('DELETE FROM referrals WHERE referrer_id = ? OR referred_id = ?').run(agencyId, agencyId);
    db.prepare('DELETE FROM agencies WHERE id = ?').run(agencyId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete agency.' });
  }
});

module.exports = router;
