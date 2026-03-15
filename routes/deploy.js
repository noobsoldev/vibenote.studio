const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { buildStaticSiteBundle, deployStaticSite } = require('../services/deployment-service');

const router = express.Router();

async function loadProject(req) {
  const { data: project } = await db()
    .from('projects')
    .select('*')
    .eq('id', req.params.id)
    .eq('agency_id', req.agency.id)
    .single();

  return project;
}

router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const project = await loadProject(req);
    if (!project) {
      return res.status(404).send('Project not found.');
    }

    const bundle = buildStaticSiteBundle(project);
    const htmlFile = bundle.files.find(file => file.path === 'index.html');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${bundle.slug}.html"`);
    res.send(htmlFile.content);
  } catch (err) {
    res.status(400).send(err.message || 'Export failed.');
  }
});

router.post('/:id', requireAuth, async (req, res) => {
  try {
    const project = await loadProject(req);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const provider = req.body?.provider || 'sftp';
    if (provider === 'export_html') {
      return res.json({
        success: true,
        provider: 'export_html',
        providerLabel: 'Export HTML',
        exportUrl: `/deploy/${project.id}/download`
      });
    }

    const result = await deployStaticSite({
      agency: req.agency,
      project,
      provider
    });

    if (result.status === 'pending_configuration') {
      return res.status(400).json({
        error: result.message,
        provider: result.provider,
        providerLabel: result.providerLabel,
        steps: result.steps
      });
    }

    await db().from('projects').update({
      status: 'live',
      deployment_url: result.url
    }).eq('id', project.id);

    res.json({
      success: true,
      status: result.status || 'deployed',
      provider: result.provider,
      providerLabel: result.providerLabel,
      deployUrl: result.url,
      steps: result.steps
    });
  } catch (err) {
    console.error('Deploy error:', err);
    res.status(500).json({ error: err.message || 'Deploy failed.' });
  }
});

module.exports = router;
