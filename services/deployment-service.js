const path = require('path');
const SftpClient = require('ssh2-sftp-client');
const { deployToCloudflarePages } = require('./providers/cloudflare-pages');
const { slugifyProject } = require('../utils/slug');
const { buildClientSiteFiles } = require('./seo-generator');

function slugify(value) {
  return slugifyProject(value);
}

function buildStaticSiteBundle(project) {
  if (!project?.generated_html) {
    throw new Error('No generated website files are available to deploy.');
  }

  const slug = slugifyProject(project.client_name || project.name || 'client-website');

  return {
    slug,
    projectName: slug,
    files: buildClientSiteFiles({
      ...(project.form_data || {}),
      client_name: project.form_data?.client_name || project.client_name || project.name,
      business_name: project.form_data?.client_name || project.client_name || project.name,
      website_url: project.deployment_url || project.form_data?.domain || ''
    }, project.generated_html)
  };
}

async function deployViaSftp({ agency, bundle }) {
  if (!agency?.sftp_host || !agency?.sftp_user || !agency?.sftp_pass) {
    throw new Error('SFTP hosting is not configured yet.');
  }

  const client = new SftpClient();
  const basePath = agency.sftp_base_path || '/public_html';
  const deployPath = path.posix.join(basePath, bundle.slug);

  await client.connect({
    host: agency.sftp_host,
    port: 22,
    username: agency.sftp_user,
    password: agency.sftp_pass
  });

  try {
    await client.mkdir(deployPath, true);

    for (const file of bundle.files) {
      const targetPath = path.posix.join(deployPath, file.path);
      await client.put(Buffer.from(file.content, 'utf8'), targetPath);
    }
  } finally {
    await client.end();
  }

  const publicHost = (agency.sftp_public_host || agency.sftp_host || '').replace(/^https?:\/\//, '');
  const url = `https://${publicHost}/${bundle.slug}`;

  return {
    provider: 'sftp',
    providerLabel: 'Client FTP',
    url,
    status: 'deployed',
    steps: [
      'Connecting to client hosting',
      'Creating website folder',
      'Uploading static website files',
      'Publishing live URL'
    ]
  };
}

async function deployPlaceholder(provider) {
  const labels = {
    netlify: 'Netlify',
    vibenote_hosting: 'VibeNote Hosting'
  };

  return {
    provider,
    providerLabel: labels[provider] || provider,
    status: 'pending_configuration',
    steps: [
      'Preparing static site bundle',
      'Authenticating hosting provider',
      'Uploading files',
      'Assigning live URL'
    ],
    message: `${labels[provider] || 'This hosting provider'} is prepared in the deployment architecture but not configured in this environment yet.`
  };
}

async function deployStaticSite({ agency, project, provider = 'sftp' }) {
  const bundle = buildStaticSiteBundle(project);
  const normalizedProvider = provider === 'cloudflare_pages' ? 'cloudflare' : provider;

  if (normalizedProvider === 'sftp') {
    return {
      ...await deployViaSftp({ agency, bundle }),
      bundle
    };
  }

  if (normalizedProvider === 'cloudflare') {
    return {
      ...await deployToCloudflarePages(bundle),
      bundle
    };
  }

  return {
    ...await deployPlaceholder(normalizedProvider),
    bundle
  };
}

module.exports = {
  buildStaticSiteBundle,
  deployStaticSite,
  slugify
};

