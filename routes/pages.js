const express = require('express');
const { generateSitemap } = require('../services/seo-generator');

const router = express.Router();
const baseUrl = (process.env.APP_URL || process.env.BASE_URL || 'https://vibenote.studio').replace(/\/$/, '');
const platformSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'VibeNote',
  url: baseUrl,
  logo: `${baseUrl}/logo.png`
};

function renderPage(view, seo) {
  return (req, res) => res.render(`pages/${view}`, { baseUrl, seo: { ...seo, schema: platformSchema } });
}

router.get('/docs', renderPage('docs', {
  title: 'VibeNote Docs – How Agencies Use the Platform',
  description: 'Learn how agencies use VibeNote to collect briefs, generate websites, edit content, and deploy static client sites.',
  path: '/docs'
}));

router.get('/privacy', renderPage('privacy', {
  title: 'Privacy Policy – VibeNote',
  description: 'Read how VibeNote handles account information, client brief data, generated websites, and third-party services.',
  path: '/privacy'
}));

router.get('/terms', renderPage('terms', {
  title: 'Terms of Service – VibeNote',
  description: 'Review acceptable usage, payment terms, subscription rules, ownership, and termination terms for VibeNote.',
  path: '/terms'
}));

router.get('/cookies', renderPage('cookies', {
  title: 'Cookie Policy – VibeNote',
  description: 'Understand how VibeNote uses session cookies, authentication cookies, and future analytics cookies.',
  path: '/cookies'
}));

router.get('/pricing', (req, res) => res.redirect(301, '/#pricing'));
router.get('/workflow', (req, res) => res.redirect(301, '/#workflow'));
router.get('/deploy', (req, res) => res.redirect(301, '/#deploy'));

router.get('/sitemap.xml', (req, res) => {
  const xml = generateSitemap([
    '/',
    '/docs',
    '/pricing',
    '/workflow',
    '/deploy',
    '/privacy',
    '/terms',
    '/cookies'
  ], baseUrl);

  res.type('application/xml');
  res.send(xml);
});

module.exports = router;
