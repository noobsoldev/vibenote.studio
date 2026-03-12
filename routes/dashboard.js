const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a), transaction: (...a) => getDb().transaction(...a) };
const { requireAuth } = require('../middleware/auth');

// GET /dashboard
router.get('/', requireAuth, (req, res) => {
  try {
    const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.session.agencyId);
    if (!agency) {
      req.session.destroy();
      return res.redirect('/login');
    }

    const projects = db.prepare(`
      SELECT * FROM projects WHERE agency_id = ? ORDER BY updated_at DESC
    `).all(agency.id);

    const referrals = db.prepare(`
      SELECT r.*, a.name AS referred_name, a.email AS referred_email, a.plan AS referred_plan
      FROM referrals r
      JOIN agencies a ON a.id = r.referred_id
      WHERE r.referrer_id = ?
      ORDER BY r.created_at DESC
    `).all(agency.id);

    const creditsEarned = referrals.filter(r => r.credit_awarded).length;

    const planLimits = { free: 1, starter: 1, growth: 10, agency: 50 };
    const planLimit = planLimits[agency.plan] || 1;

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    res.render('dashboard', {
      agency,
      projects,
      referrals,
      creditsEarned,
      planLimit,
      baseUrl,
      plans: {
        starter: { name: 'Starter', price: '₹5,000', sites: 1 },
        growth: { name: 'Growth', price: '₹40,000', sites: 10 },
        agency: { name: 'Agency', price: '₹2,50,000', sites: 50 }
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).render('error', { message: 'Failed to load dashboard.' });
  }
});

// POST /dashboard/profile - update SFTP settings
router.post('/profile', requireAuth, (req, res) => {
  const { sftp_host, sftp_user, sftp_pass, sftp_base_path } = req.body;
  try {
    db.prepare(`
      UPDATE agencies SET sftp_host = ?, sftp_user = ?, sftp_pass = ?, sftp_base_path = ?
      WHERE id = ?
    `).run(sftp_host || null, sftp_user || null, sftp_pass || null, sftp_base_path || '/public_html', req.session.agencyId);
    res.json({ success: true });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

module.exports = router;
