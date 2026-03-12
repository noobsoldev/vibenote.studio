const express = require('express');
const router = express.Router();
const SftpClient = require('ssh2-sftp-client');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a), transaction: (...a) => getDb().transaction(...a) };
const { requireAuth } = require('../middleware/auth');

function slugify(str) {
  return (str || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// POST /deploy/:id
router.post('/:id', requireAuth, async (req, res) => {
  const sftp = new SftpClient();
  try {
    const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.session.agencyId);
    if (!agency) return res.status(401).json({ error: 'Not authenticated.' });

    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND agency_id = ?')
      .get(req.params.id, req.session.agencyId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (!project.generated_html) return res.status(400).json({ error: 'No HTML generated yet.' });

    if (!agency.sftp_host || !agency.sftp_user || !agency.sftp_pass) {
      return res.status(400).json({ error: 'SFTP credentials not configured. Please update your profile.' });
    }

    const slug = slugify(project.client_name);
    const basePath = agency.sftp_base_path || '/public_html';
    const deployPath = `${basePath}/${slug}`;
    const filePath = `${deployPath}/index.html`;

    // Stream status updates via SSE not feasible in simple JSON — return steps
    const steps = [];

    steps.push({ step: 'Connecting to server...', status: 'ok' });
    await sftp.connect({
      host: agency.sftp_host,
      username: agency.sftp_user,
      password: agency.sftp_pass,
      readyTimeout: 15000
    });

    steps.push({ step: 'Creating directory...', status: 'ok' });
    // Ensure directory exists
    try {
      await sftp.mkdir(deployPath, true);
    } catch (e) {
      // Directory may already exist
    }

    steps.push({ step: 'Uploading index.html...', status: 'ok' });
    await sftp.put(Buffer.from(project.generated_html, 'utf8'), filePath);

    await sftp.end();

    // Determine public URL
    const domain = project.form_data ? (() => {
      try { return JSON.parse(project.form_data).domain || ''; } catch (e) { return ''; }
    })() : '';
    const deployUrl = domain ? `https://${domain}` : `sftp://${agency.sftp_host}${filePath}`;

    // Update project
    db.prepare(`
      UPDATE projects SET status = 'live', deployment_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(deployUrl, project.id);

    steps.push({ step: 'Site is Live!', status: 'ok' });

    res.json({ success: true, steps, deployUrl });
  } catch (err) {
    console.error('Deploy error:', err);
    try { await sftp.end(); } catch (e) {}
    res.status(500).json({ error: 'Deployment failed: ' + (err.message || 'Unknown error') });
  }
});

// POST /deploy/:id/download - download as HTML file
router.post('/:id/download', requireAuth, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND agency_id = ?')
      .get(req.params.id, req.session.agencyId);
    if (!project || !project.generated_html) {
      return res.status(404).json({ error: 'Project not found or no HTML generated.' });
    }
    const slug = slugify(project.client_name);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.html"`);
    res.send(project.generated_html);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to download.' });
  }
});

module.exports = router;
