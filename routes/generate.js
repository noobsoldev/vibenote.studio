const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a), transaction: (...a) => getDb().transaction(...a) };
const { requireAuth } = require('../middleware/auth');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildPrompt(formData) {
  const fd = formData;
  const sections = Array.isArray(fd.sections) ? fd.sections.join(', ') : (fd.sections || 'Hero, About, Services, Contact');
  const services = Array.isArray(fd.services) ? fd.services.join(', ') : (fd.services || '');
  const usps = Array.isArray(fd.usps) ? fd.usps.join(', ') : (fd.usps || '');
  const keywords = Array.isArray(fd.seo_keywords) ? fd.seo_keywords.join(', ') : (fd.seo_keywords || '');

  return `You are an expert web developer and designer. Generate a complete, production-ready, mobile-first single-page HTML website based on the following client brief. 

CRITICAL REQUIREMENTS:
- Return ONLY the complete HTML file. No explanation, no markdown, no code blocks.
- All CSS and JS must be embedded inside the HTML file (no external files except Google Fonts).
- The website must be fully responsive and mobile-first.
- Use modern CSS (Grid, Flexbox, CSS variables, animations).
- Make it look premium, professional and production-ready — not a template.
- Embed the logo image if provided as a base64 src attribute.
- Use placeholder gradient boxes for any gallery images not provided.

CLIENT BRIEF:
Business Name: ${fd.client_name || 'Business'}
Industry: ${fd.industry || 'General'}
Tagline: ${fd.tagline || ''}
Description: ${fd.description || ''}
Year Established: ${fd.year_established || ''}
Location: ${fd.location || ''}
Target Audience: ${fd.target_audience || ''}
USPs: ${usps}

SERVICES: ${services}
Price Range: ${fd.price_range || ''}
Special Offers: ${fd.special_offers || ''}

BRAND TONE: ${fd.tone || 'Professional'}
Primary Color: ${fd.color_primary || '#1a1a2e'}
Accent Color: ${fd.color_accent || '#c9a84c'}
Background Color: ${fd.color_bg || '#0a0a0a'}
Text Color: ${fd.color_text || '#e8e8e8'}
Font Preference: ${fd.font_preference || 'Poppins'}
Design Style: ${fd.design_style || 'Modern Minimal'}

WEBSITE SECTIONS TO INCLUDE: ${sections}

CONTACT INFO:
Phone: ${fd.phone || ''}
WhatsApp: ${fd.whatsapp || ''}
Email: ${fd.email || ''}
Domain: ${fd.domain || ''}
Address: ${fd.address || ''}
Google Maps: ${fd.maps_link || ''}
Business Hours: ${fd.business_hours || ''}
Primary CTA: ${fd.primary_cta || 'Contact Us'}

SEO:
Title Tag: ${fd.seo_title || fd.client_name + ' | ' + (fd.industry || 'Website')}
Meta Description: ${fd.seo_description || ''}
Keywords: ${keywords}
Language: ${fd.language || 'en'}
GA ID: ${fd.ga_id || ''}
Schema Type: ${fd.schema_type || 'LocalBusiness'}

SOCIAL MEDIA:
Instagram: ${fd.instagram || ''}
Facebook: ${fd.facebook || ''}
YouTube: ${fd.youtube || ''}
LinkedIn: ${fd.linkedin || ''}
Twitter: ${fd.twitter || ''}
Pinterest: ${fd.pinterest || ''}

TESTIMONIALS:
${fd.testimonials || ''}

FAQ:
${fd.faq || ''}

ADDITIONAL NOTES: ${fd.ai_notes || ''}

${fd.logo_base64 ? 'LOGO: Use this base64 image as the logo: ' + fd.logo_base64.substring(0, 100) + '...[base64 provided]' : 'LOGO: Create a text-based logo using the business name.'}

Generate the complete HTML website now. Return ONLY the HTML, nothing else.`;
}

// POST /generate/:id - generate website
router.post('/:id', requireAuth, async (req, res) => {
  try {
    const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.session.agencyId);
    if (!agency) return res.status(401).json({ error: 'Not authenticated.' });
    if (agency.site_credits <= 0) return res.status(403).json({ error: 'No site credits remaining. Please upgrade your plan.' });

    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND agency_id = ?')
      .get(req.params.id, req.session.agencyId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    let formData = {};
    try { formData = JSON.parse(project.form_data || '{}'); } catch (e) {}

    const prompt = buildPrompt(formData);

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    });

    const generatedHtml = message.content[0].text;

    // Deduct credit
    db.prepare('UPDATE agencies SET site_credits = site_credits - 1 WHERE id = ?').run(agency.id);

    // Save to project
    db.prepare(`
      UPDATE projects SET generated_html = ?, status = 'generated', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(generatedHtml, project.id);

    // Save initial chat message
    db.prepare('INSERT INTO chat_history (project_id, role, message) VALUES (?, ?, ?)').run(
      project.id, 'assistant', 'Website generated successfully. You can now preview it and request changes.'
    );

    res.json({ success: true, projectId: project.id });
  } catch (err) {
    console.error('Generation error:', err);
    res.status(500).json({ error: 'Failed to generate website. ' + (err.message || '') });
  }
});

// GET /generate/:id/editor - preview + chat
router.get('/:id/editor', requireAuth, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND agency_id = ?')
      .get(req.params.id, req.session.agencyId);
    if (!project) return res.status(404).render('error', { message: 'Project not found.' });
    if (!project.generated_html) return res.redirect(`/projects/${project.id}/onboarding`);

    const chatHistory = db.prepare('SELECT * FROM chat_history WHERE project_id = ? ORDER BY created_at ASC').all(project.id);

    let formData = {};
    try { formData = JSON.parse(project.form_data || '{}'); } catch (e) {}

    res.render('editor', { project, chatHistory, formData });
  } catch (err) {
    console.error('Editor load error:', err);
    res.status(500).render('error', { message: 'Failed to load editor.' });
  }
});

// POST /generate/:id/chat - chat-based tweak
router.post('/:id/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });

    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND agency_id = ?')
      .get(req.params.id, req.session.agencyId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (!project.generated_html) return res.status(400).json({ error: 'No website generated yet.' });

    let formData = {};
    try { formData = JSON.parse(project.form_data || '{}'); } catch (e) {}

    const history = db.prepare('SELECT * FROM chat_history WHERE project_id = ? ORDER BY created_at ASC').all(project.id);

    // Save user message
    db.prepare('INSERT INTO chat_history (project_id, role, message) VALUES (?, ?, ?)').run(project.id, 'user', message.trim());

    // Build messages array for Claude
    const messages = [];

    // System context
    const systemPrompt = `You are an expert web developer editing a client website. 
The user will request changes to the website HTML. 
IMPORTANT RULES:
1. Make ONLY the requested changes.
2. Return the COMPLETE updated HTML file — no partial code, no explanations, no markdown.
3. After the HTML, on a new line starting with "---SUMMARY---", write a 1-2 sentence summary of what you changed.
4. Preserve all existing content, styles, and functionality unless specifically asked to change them.

Original client brief summary:
Business: ${formData.client_name || 'Unknown'} | Industry: ${formData.industry || ''} | Tone: ${formData.tone || 'Professional'}`;

    // Add history (limit to last 6 exchanges to manage tokens)
    const recentHistory = history.slice(-12);
    for (const h of recentHistory) {
      messages.push({ role: h.role, content: h.message });
    }

    // Add current request with HTML
    messages.push({
      role: 'user',
      content: `Here is the current website HTML:\n\n${project.generated_html}\n\nUser request: ${message.trim()}\n\nReturn the complete updated HTML followed by ---SUMMARY--- and a brief description of changes.`
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages
    });

    const fullResponse = response.content[0].text;

    // Split HTML and summary
    let updatedHtml = fullResponse;
    let summary = 'Website updated as requested.';

    const summaryIndex = fullResponse.lastIndexOf('---SUMMARY---');
    if (summaryIndex !== -1) {
      updatedHtml = fullResponse.substring(0, summaryIndex).trim();
      summary = fullResponse.substring(summaryIndex + 13).trim();
    }

    // Make sure we have valid HTML
    if (!updatedHtml.includes('<!DOCTYPE') && !updatedHtml.includes('<html')) {
      updatedHtml = project.generated_html;
      summary = 'Could not parse updated HTML. Please try again with a more specific request.';
    }

    // Save updated HTML and assistant message
    db.prepare('UPDATE projects SET generated_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(updatedHtml, project.id);
    db.prepare('INSERT INTO chat_history (project_id, role, message) VALUES (?, ?, ?)').run(project.id, 'assistant', summary);

    res.json({ success: true, html: updatedHtml, summary });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to process request. ' + (err.message || '') });
  }
});

// GET /generate/:id/html - serve raw generated HTML
router.get('/:id/html', requireAuth, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND agency_id = ?')
      .get(req.params.id, req.session.agencyId);
    if (!project || !project.generated_html) {
      return res.status(404).send('<h1>No HTML generated yet</h1>');
    }
    res.setHeader('Content-Type', 'text/html');
    res.send(project.generated_html);
  } catch (err) {
    res.status(500).send('<h1>Error loading preview</h1>');
  }
});

module.exports = router;
