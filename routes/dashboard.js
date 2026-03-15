const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateUniqueAgencySlug } = require('../utils/unique-slug');

const planLimits = { free: 1, starter: 1, growth: 10, agency: 50 };
const appUrl = (process.env.APP_URL || process.env.BASE_URL || 'https://adswala.store').replace(/\/$/, '');

router.get('/', requireAuth, async (req, res) => {
  try {
    const agency = req.agency;
    const displayName = agency.agency_name || agency.name;
    const effectiveSlug = agency.slug || await generateUniqueAgencySlug(displayName, agency.id);

    if (!agency.slug || !agency.agency_name || !agency.contact_email || !agency.user_id) {
      await db().from('agencies').update({
        slug: effectiveSlug,
        agency_name: displayName,
        contact_email: agency.contact_email || agency.email,
        user_id: agency.user_id || agency.auth_user_id || null
      }).eq('id', agency.id);
    }

    const { data: projects } = await db()
      .from('projects')
      .select('*')
      .eq('agency_id', agency.id)
      .order('updated_at', { ascending: false });

    const { data: referrals } = await db()
      .from('referrals')
      .select('converted, referred:agencies!referrals_referred_id_fkey(name, email)')
      .eq('referrer_id', agency.id)
      .order('created_at', { ascending: false });

    const referralRows = (referrals || []).map((row) => ({
      converted: Boolean(row.converted),
      referred_name: row.referred?.name || 'New signup',
      referred_email: row.referred?.email || 'No email available'
    }));

    res.render('dashboard', {
      agency: { ...agency, slug: effectiveSlug, agency_name: displayName },
      projects: projects || [],
      planLimit: planLimits[agency.plan] || 1,
      referrals: referralRows,
      baseUrl: appUrl,
      clientBriefLink: `${appUrl}/brief/${effectiveSlug}`
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).render('error', { message: 'Failed to load dashboard.' });
  }
});

router.post('/profile', requireAuth, async (req, res) => {
  try {
    const { sftp_host, sftp_user, sftp_pass, sftp_base_path, country, currency } = req.body;
    const { error } = await db()
      .from('agencies')
      .update({ sftp_host, sftp_user, sftp_pass, sftp_base_path, country, currency })
      .eq('id', req.session.agencyId);

    if (error) {
      console.error('Dashboard profile save failed:', error);
      return res.status(500).json({ error: 'Failed to save settings.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Dashboard profile fatal:', err);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

module.exports = router;
