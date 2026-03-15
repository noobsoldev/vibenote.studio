const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateProjectWebsite } = require('../services/site-generator');

const router = express.Router();

// GET /generate/:id/editor
router.get('/:id/editor', requireAuth, async (req, res) => {
  try {
    const { data: project } = await db()
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .eq('agency_id', req.agency.id)
      .single();

    if (!project) {
      return res.status(404).render('error', { message: 'Project not found.' });
    }

    const { data: history } = await db()
      .from('chat_history')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true });

    res.render('editor', {
      project,
      chatHistory: history || [],
      agency: req.agency,
      formData: project.form_data || {}
    });
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to load editor.' });
  }
});

// GET /generate/:id/html
router.get('/:id/html', requireAuth, async (req, res) => {
  try {
    const { data: project } = await db()
      .from('projects')
      .select('generated_html')
      .eq('id', req.params.id)
      .eq('agency_id', req.agency.id)
      .single();

    if (!project?.generated_html) {
      return res.status(404).send('No generated website found.');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(project.generated_html);
  } catch (err) {
    res.status(500).send('Failed to load generated website.');
  }
});

// POST /generate/:id
router.post('/:id', requireAuth, async (req, res) => {
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
      return res.status(404).json({ error: 'Project not found.' });
    }

    await generateProjectWebsite({ agency, project });

    res.json({ success: true, projectId: project.id });
  } catch (err) {
    console.error('Generation error:', err);
    res.status(500).json({ error: err.message || 'Generation failed.' });
  }
});

// POST /generate/:id/chat
router.post('/:id/chat', requireAuth, async (req, res) => {
  try {
    const { message: userMsg } = req.body;
    const { data: project } = await db()
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .eq('agency_id', req.agency.id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Not found' });
    }

    await db().from('chat_history').insert({
      project_id: project.id,
      role: 'user',
      message: userMsg
    });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = `You are editing a client website for a web agency.

Current website HTML:
${project.generated_html}

User request:
${userMsg}

Rules:
- Return ONLY the full updated HTML
- Keep the site static and deployable as plain HTML, CSS, and JS
- Preserve responsive behavior unless the request explicitly changes it
- Do not convert the website into an ecommerce system, database app, or SaaS product`;

    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    });

    const newHtml = resp.content?.[0]?.text || '';
    await db().from('projects').update({ generated_html: newHtml }).eq('id', project.id);
    await db().from('chat_history').insert({
      project_id: project.id,
      role: 'assistant',
      message: 'Client website updated.'
    });

    res.json({ success: true, html: newHtml, summary: 'Client website updated.' });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message || 'Chat failed.' });
  }
});

module.exports = router;
