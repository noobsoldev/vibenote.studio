const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateProjectWebsite } = require('../services/site-generator');

const router = express.Router();

// GET /briefs
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data: briefs } = await db()
      .from('projects')
      .select('*')
      .eq('agency_id', req.agency.id)
      .in('status', ['brief_saved', 'brief_submitted', 'generated', 'live'])
      .order('updated_at', { ascending: false });

    res.render('briefs', { agency: req.agency, briefs: briefs || [] });
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to load briefs.' });
  }
});

// POST /briefs/:id/generate
router.post('/:id/generate', requireAuth, async (req, res) => {
  try {
    const agency = req.agency;
    if (agency.site_credits <= 0) {
      return res.status(403).json({ error: 'No site credits remaining. Please upgrade your plan.' });
    }

    const { data: project } = await db()
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .eq('agency_id', agency.id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Client brief not found.' });
    }

    await generateProjectWebsite({ agency, project });

    res.json({ success: true, projectId: project.id });
  } catch (err) {
    console.error('Brief generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate website.' });
  }
});

module.exports = router;

