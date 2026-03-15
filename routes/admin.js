const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin-login', { error: null });
});

router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  const { email, password } = req.body;
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    req.session.save(() => res.redirect('/admin'));
  } else {
    res.render('admin-login', { error: 'Invalid credentials.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.isAdmin = false;
  req.session.save(() => res.redirect('/admin/login'));
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const client = db(); // service role — bypasses RLS

    const { data: agencies, error: ae } = await client
      .from('admin_agency_stats')
      .select('*')
      .order('created_at', { ascending: false });

    if (ae) console.error('Admin agencies error:', ae);

    const { data: recentProjects, error: pe } = await client
      .from('projects')
      .select('id, client_name, industry, status, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (pe) console.error('Admin projects error:', pe);

    const allAgencies = agencies || [];
    const summary = {
      total: allAgencies.length,
      active: allAgencies.filter(a => a.status === 'active').length,
      byPlan: { free: 0, starter: 0, growth: 0, agency: 0 },
      totalSites: 0,
      topIndustries: {}
    };

    for (const a of allAgencies) {
      summary.byPlan[a.plan] = (summary.byPlan[a.plan] || 0) + 1;
      summary.totalSites += Number(a.sites_generated || 0);
      for (const ind of (a.industries || [])) {
        if (ind) summary.topIndustries[ind] = (summary.topIndustries[ind] || 0) + 1;
      }
    }

    res.render('admin', {
      agencies: allAgencies,
      recentProjects: recentProjects || [],
      summary
    });
  } catch (err) {
    console.error('Admin error:', err);
    res.status(500).render('error', { message: 'Admin load failed: ' + err.message });
  }
});

module.exports = router;
