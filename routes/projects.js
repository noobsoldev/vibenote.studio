const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /projects/new
router.get('/new', requireAuth, async (req, res) => {
  try {
    const agency = req.agency;
    const defaultFormData = {
      client_name: 'New Client',
      sections: ['Hero', 'About', 'Services', 'Testimonials', 'Contact Form']
    };

    const { data: project, error } = await db()
      .from('projects')
      .insert({
        agency_id: agency.id,
        client_name: 'New Client',
        industry: 'Client website',
        status: 'draft',
        form_data: defaultFormData
      })
      .select('*')
      .single();

    if (error || !project) {
      throw error || new Error('Project creation returned no row.');
    }

    res.redirect(`/projects/${project.id}/onboarding`);
  } catch (err) {
    console.error('New project error:', err);
    res.status(500).render('error', { message: 'Failed to create project.' });
  }
});

// GET /projects/:id/onboarding
router.get('/:id/onboarding', requireAuth, async (req, res) => {
  try {
    const { data: project } = await db()
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .eq('agency_id', req.agency.id)
      .single();
    if (!project) return res.status(404).render('error', { message: 'Project not found.' });
    const formData = project.form_data || {};
    res.render('onboarding', { project, formData, agency: req.agency });
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to load project.' });
  }
});

// POST /projects/:id/save — autosave form data
const saveProjectDraft = async (req, res) => {
  try {
    const { data: project } = await db()
      .from('projects')
      .select('id, form_data')
      .eq('id', req.params.id)
      .eq('agency_id', req.agency.id)
      .single();
    if (!project) return res.status(404).json({ error: 'Not found' });

    const existing = project.form_data || {};
    const merged = { ...existing, ...req.body };
    const clientName = merged.client_name || project.client_name || 'New Client';

    await db().from('projects').update({
      form_data: merged,
      client_name: clientName,
      industry: merged.industry || null
    }).eq('id', req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save.' });
  }
};

router.post('/:id/save', requireAuth, saveProjectDraft);
router.post('/:id/save-draft', requireAuth, saveProjectDraft);

// POST /projects/:id/save-brief
router.post('/:id/save-brief', requireAuth, async (req, res) => {
  try {
    const { data: project } = await db()
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .eq('agency_id', req.agency.id)
      .single();
    if (!project) return res.status(404).json({ error: 'Not found' });

    const fd = project.form_data || {};
    await db().from('projects').update({
      status: 'brief_saved',
      client_name: fd.client_name || project.client_name,
      industry: fd.industry || project.industry
    }).eq('id', req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save brief.' });
  }
});

// POST /projects/:id/upload - asset upload
router.post('/:id/upload', requireAuth, upload.any(), async (req, res) => {
  try {
    const { data: project } = await db()
      .from('projects')
      .select('id, form_data')
      .eq('id', req.params.id)
      .eq('agency_id', req.agency.id)
      .single();
    if (!project) return res.status(404).json({ error: 'Not found' });

    const type = req.query.type || 'assets';
    const existing = project.form_data || {};

    const files = req.files || [];

    if (type === 'logo' && files[0]) {
      const file = files[0];
      const b64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      existing.logo_base64 = b64;
    } else if (files.length) {
      const imgs = files.map(f => `data:${f.mimetype};base64,${f.buffer.toString('base64')}`);
      existing.asset_images = [...(existing.asset_images || []), ...imgs];
    }

    await db().from('projects').update({ form_data: existing }).eq('id', req.params.id);
    res.json({ success: true, assetCount: files.length || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// DELETE /projects/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { data: project } = await db()
      .from('projects')
      .select('id')
      .eq('id', req.params.id)
      .eq('agency_id', req.agency.id)
      .single();
    if (!project) return res.status(404).json({ error: 'Not found' });
    await db().from('projects').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete.' });
  }
});

module.exports = router;
