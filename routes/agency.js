const express = require('express');
const multer = require('multer');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { sanitizeEmail, sanitizeText } = require('../utils/sanitize');
const { generateUniqueAgencySlug } = require('../utils/unique-slug');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

function isAgencyProfileIncomplete(agency) {
  return !agency || !agency.logo_url || !agency.brand_color || (agency.agency_name || '').trim() === 'New Agency';
}

function renderProfilePage(res, agency, options = {}) {
  return res.render('agency-profile', {
    agency,
    error: options.error || null,
    success: options.success || null,
    setupMode: Boolean(options.setupMode)
  });
}

router.get('/setup', requireAuth, async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  const { data: agency } = await db()
    .from('agencies')
    .select('*')
    .eq('auth_user_id', req.session.userId)
    .maybeSingle();

  if (!agency) return res.redirect('/login?error=auth_failed');
  if (!isAgencyProfileIncomplete(agency)) return res.redirect('/dashboard');

  return renderProfilePage(res, agency, { setupMode: true });
});

router.post('/setup', requireAuth, (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  upload.single('logo')(req, res, async (uploadErr) => {
    let agency = req.agency;

    try {
      const { data: ownedAgency } = await db()
        .from('agencies')
        .select('*')
        .eq('auth_user_id', req.session.userId)
        .maybeSingle();

      agency = ownedAgency || agency;
      if (!agency) return res.redirect('/login?error=auth_failed');

      if (uploadErr) {
        const message = uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'Agency logo must be 2MB or smaller.'
          : 'Logo upload failed.';
        return renderProfilePage(res.status(400), agency, { error: message, setupMode: true });
      }

      const agencyName = sanitizeText(req.body.agency_name, 120);
      const brandColor = sanitizeText(req.body.brand_color, 20);
      const contactEmail = sanitizeEmail(req.body.contact_email || agency.contact_email || agency.email);

      if (!agencyName) {
        return renderProfilePage(res.status(400), agency, { error: 'Agency name is required.', setupMode: true });
      }

      if (!brandColor) {
        return renderProfilePage(res.status(400), agency, { error: 'Brand color is required.', setupMode: true });
      }

      const slug = await generateUniqueAgencySlug(agencyName, agency.id);
      const updates = {
        agency_name: agencyName,
        name: agencyName,
        slug,
        brand_color: brandColor,
        contact_email: contactEmail
      };

      if (req.file) {
        updates.logo_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      }

      const { data: updated, error } = await db()
        .from('agencies')
        .update(updates)
        .eq('auth_user_id', req.session.userId)
        .select('*')
        .single();

      if (error) throw error;

      req.session.agencyId = updated.id;
      req.session.agencyName = updated.agency_name || updated.name;
      req.session.brandColor = updated.brand_color || null;
      return req.session.save(() => res.redirect('/dashboard'));
    } catch (err) {
      console.error('Agency setup save failed:', err);
      return renderProfilePage(res.status(500), agency, {
        error: 'Failed to save agency setup.',
        setupMode: true
      });
    }
  });
});

router.get('/profile', requireAuth, async (req, res) => {
  return renderProfilePage(res, req.agency, {
    success: req.query.saved ? 'Agency profile updated.' : null
  });
});

router.post('/profile', requireAuth, (req, res) => {
  upload.single('logo')(req, res, async (uploadErr) => {
    try {
      if (uploadErr) {
        const message = uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'Agency logo must be 2MB or smaller.'
          : 'Logo upload failed.';
        return renderProfilePage(res.status(400), req.agency, { error: message });
      }

      const agencyName = sanitizeText(req.body.agency_name, 120);
      const brandColor = sanitizeText(req.body.brand_color, 20);
      const contactEmail = sanitizeEmail(req.body.contact_email || req.agency.contact_email || req.agency.email);

      if (!agencyName) {
        return renderProfilePage(res.status(400), req.agency, { error: 'Agency name is required.' });
      }

      if (!brandColor) {
        return renderProfilePage(res.status(400), req.agency, { error: 'Brand color is required.' });
      }

      const slug = await generateUniqueAgencySlug(agencyName, req.agency.id);
      const updates = {
        agency_name: agencyName,
        name: agencyName,
        slug,
        brand_color: brandColor,
        contact_email: contactEmail,
        user_id: req.agency.user_id || req.agency.auth_user_id || null
      };

      if (req.file) {
        updates.logo_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      }

      const { data: updated, error } = await db()
        .from('agencies')
        .update(updates)
        .eq('auth_user_id', req.session.userId)
        .select('*')
        .single();

      if (error) throw error;

      req.session.agencyName = updated.agency_name || updated.name;
      req.session.brandColor = updated.brand_color || null;
      res.redirect('/agency/profile?saved=1');
    } catch (err) {
      console.error('Agency profile save failed:', err);
      renderProfilePage(res.status(500), req.agency, { error: 'Failed to save agency profile.' });
    }
  });
});

module.exports = router;
