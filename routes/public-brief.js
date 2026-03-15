const express = require('express');
const multer = require('multer');
const { db } = require('../db/database');
const { generateProjectWebsite } = require('../services/site-generator');
const { sanitizeEmail, sanitizeList, sanitizeText, sanitizeUrl } = require('../utils/sanitize');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 7
  }
});

function mapBriefForm(body, files = {}) {
  const businessName = sanitizeText(body.business_name, 120);
  const services = sanitizeList(body.services, 12);
  const socialLinks = {
    instagram: sanitizeUrl(body.instagram),
    facebook: sanitizeUrl(body.facebook),
    linkedin: sanitizeUrl(body.linkedin),
    twitter: sanitizeUrl(body.twitter)
  };

  const logoFile = files.logo?.[0];
  const imageFiles = files.images || [];

  return {
    projectTitle: businessName ? `${businessName} Website` : 'Client Website',
    formData: {
      client_name: businessName,
      industry: 'Client Brief',
      services,
      description: sanitizeText(body.about_business, 4000),
      address: sanitizeText(body.address, 300),
      phone: sanitizeText(body.phone, 50),
      email: sanitizeEmail(body.email),
      contact_email: sanitizeEmail(body.email),
      instagram: socialLinks.instagram,
      facebook: socialLinks.facebook,
      linkedin: socialLinks.linkedin,
      twitter: socialLinks.twitter,
      primary_cta: 'Contact Us',
      sections: ['Hero', 'About', 'Services', 'Contact Form'],
      logo_base64: logoFile ? `data:${logoFile.mimetype};base64,${logoFile.buffer.toString('base64')}` : '',
      asset_images: imageFiles.map(file => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`)
    }
  };
}

async function loadAgencyBySlug(slug) {
  const { data: agency } = await db()
    .from('agencies')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  return agency;
}

function renderBrief(res, agency, overrides = {}) {
  return res.render('client-brief', {
    agency,
    error: overrides.error || null,
    success: overrides.success || null,
    values: overrides.values || {}
  });
}

function queueProjectGeneration(agency, project) {
  setImmediate(async () => {
    try {
      await generateProjectWebsite({ agency, project });
    } catch (generationError) {
      console.error('Public brief async generation failed:', generationError.message || generationError);
      await db().from('projects').update({ status: 'brief_submitted' }).eq('id', project.id);
    }
  });
}

router.get('/:agencySlug', async (req, res) => {
  try {
    const agency = await loadAgencyBySlug(req.params.agencySlug);
    if (!agency) {
      return res.status(404).render('error', { message: 'Agency brief link not found.' });
    }

    renderBrief(res, agency, {
      success: req.query.submitted ? 'Your website details were submitted successfully.' : null
    });
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to load brief form.' });
  }
});

router.post('/:agencySlug', (req, res) => {
  upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'images', maxCount: 6 }])(req, res, async (uploadErr) => {
    const agency = await loadAgencyBySlug(req.params.agencySlug).catch(() => null);
    if (!agency) {
      return res.status(404).render('error', { message: 'Agency brief link not found.' });
    }

    try {
      if (uploadErr) {
        let message = 'Upload failed. Please try again.';
        if (uploadErr.code === 'LIMIT_FILE_SIZE') {
          message = 'Each image must be 5MB or smaller, and the logo must be 2MB or smaller.';
        } else if (uploadErr.code === 'LIMIT_FILE_COUNT' || uploadErr.code === 'LIMIT_UNEXPECTED_FILE') {
          message = 'You can upload 1 logo and up to 6 images.';
        }
        return renderBrief(res.status(400), agency, { error: message, values: req.body });
      }

      const logoFile = req.files?.logo?.[0];
      const imageFiles = req.files?.images || [];
      if (logoFile && logoFile.size > 2 * 1024 * 1024) {
        return renderBrief(res.status(400), agency, {
          error: 'Logo must be 2MB or smaller.',
          values: req.body
        });
      }
      if (imageFiles.length > 6) {
        return renderBrief(res.status(400), agency, {
          error: 'You can upload up to 6 images.',
          values: req.body
        });
      }

      const businessName = sanitizeText(req.body.business_name, 120);
      if (!businessName) {
        return renderBrief(res.status(400), agency, {
          error: 'Business name is required.',
          values: req.body
        });
      }

      const mapped = mapBriefForm(req.body, req.files || {});
      const { data: project, error: insertError } = await db()
        .from('projects')
        .insert({
          agency_id: agency.id,
          client_name: mapped.projectTitle,
          industry: mapped.formData.industry,
          status: 'brief_submitted',
          form_data: mapped.formData
        })
        .select('*')
        .single();

      if (insertError || !project) {
        throw insertError || new Error('Failed to create project.');
      }

      queueProjectGeneration(agency, { ...project, form_data: mapped.formData });
      return res.redirect(`/brief/${agency.slug}?submitted=1`);
    } catch (err) {
      console.error('Public brief submit failed:', err);
      return renderBrief(res.status(500), agency, {
        error: 'Failed to submit the brief. Please try again.',
        values: req.body
      });
    }
  });
});

module.exports = router;
