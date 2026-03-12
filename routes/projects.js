const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a), transaction: (...a) => getDb().transaction(...a) };
const { requireAuth } = require('../middleware/auth');

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// GET /projects/new - start new project (check credits)
router.get('/new', requireAuth, (req, res) => {
  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.session.agencyId);
  if (!agency) return res.redirect('/login');

  if (agency.site_credits <= 0) {
    return res.redirect('/plans?reason=nocredits');
  }

  // Create a draft project
  const result = db.prepare(`
    INSERT INTO projects (agency_id, client_name, status, form_data)
    VALUES (?, 'New Client', 'draft', '{}')
  `).run(agency.id);

  res.redirect(`/projects/${result.lastInsertRowid}/onboarding`);
});

// GET /projects/:id/onboarding
router.get('/:id/onboarding', requireAuth, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND agency_id = ?')
      .get(req.params.id, req.session.agencyId);
    if (!project) return res.status(404).render('error', { message: 'Project not found.' });

    let formData = {};
    try { formData = JSON.parse(project.form_data || '{}'); } catch (e) {}

    res.render('onboarding', { project, formData });
  } catch (err) {
    console.error('Onboarding load error:', err);
    res.status(500).render('error', { message: 'Failed to load onboarding form.' });
  }
});

// POST /projects/:id/save-draft - auto-save form data
router.post('/:id/save-draft', requireAuth, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND agency_id = ?')
      .get(req.params.id, req.session.agencyId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const existing = JSON.parse(project.form_data || '{}');
    const merged = { ...existing, ...req.body };

    if (merged.client_name) {
      db.prepare('UPDATE projects SET client_name = ?, industry = ?, form_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(merged.client_name || project.client_name, merged.industry || project.industry, JSON.stringify(merged), project.id);
    } else {
      db.prepare('UPDATE projects SET form_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(JSON.stringify(merged), project.id);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Save draft error:', err);
    res.status(500).json({ error: 'Failed to save draft.' });
  }
});

// POST /projects/:id/upload-assets - handle image uploads
router.post('/:id/upload-assets', requireAuth, upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'assets', maxCount: 50 }
]), (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND agency_id = ?')
      .get(req.params.id, req.session.agencyId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const result = { logo: null, assets: [] };

    if (req.files.logo && req.files.logo[0]) {
      const logoPath = req.files.logo[0].path;
      const logoData = fs.readFileSync(logoPath);
      const logoExt = path.extname(req.files.logo[0].originalname).slice(1) || 'png';
      result.logo = `data:image/${logoExt};base64,${logoData.toString('base64')}`;
      fs.unlinkSync(logoPath);
    }

    if (req.files.assets) {
      for (const file of req.files.assets) {
        const data = fs.readFileSync(file.path);
        const ext = path.extname(file.originalname).slice(1) || 'jpeg';
        result.assets.push(`data:image/${ext};base64,${data.toString('base64')}`);
        fs.unlinkSync(file.path);
      }
    }

    // Merge into form_data
    const existing = JSON.parse(project.form_data || '{}');
    if (result.logo) existing.logo_base64 = result.logo;
    if (result.assets.length) existing.asset_images = [...(existing.asset_images || []), ...result.assets];

    db.prepare('UPDATE projects SET form_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(existing), project.id);

    res.json({ success: true, logo: result.logo, assetCount: result.assets.length });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload assets.' });
  }
});

// DELETE /projects/:id - delete project
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND agency_id = ?')
      .get(req.params.id, req.session.agencyId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    db.prepare('DELETE FROM chat_history WHERE project_id = ?').run(project.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Failed to delete project.' });
  }
});

module.exports = router;
