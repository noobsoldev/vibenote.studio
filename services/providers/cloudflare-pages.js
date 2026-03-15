const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const API_BASE = 'https://api.cloudflare.com/client/v4';
const DEFAULT_BRANCH = 'main';

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Cloudflare Pages deployments.`);
  }
  return value;
}

function getHeaders() {
  return {
    Authorization: `Bearer ${getRequiredEnv('CLOUDFLARE_API_TOKEN')}`,
    'Content-Type': 'application/json'
  };
}

async function readJson(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    const message = data?.errors?.map(err => err.message).join(', ') || data?.message || response.statusText;
    const error = new Error(message || 'Cloudflare API request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function getProjectName(bundle) {
  return bundle.projectName || bundle.slug;
}

async function getProject(projectName) {
  const accountId = getRequiredEnv('CLOUDFLARE_ACCOUNT_ID');
  const response = await fetch(`${API_BASE}/accounts/${accountId}/pages/projects/${projectName}`, {
    method: 'GET',
    headers: getHeaders()
  });

  if (response.status === 404) {
    return null;
  }

  const data = await readJson(response);
  return data.result || null;
}

async function createProject(projectName) {
  const accountId = getRequiredEnv('CLOUDFLARE_ACCOUNT_ID');
  const response = await fetch(`${API_BASE}/accounts/${accountId}/pages/projects`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      name: projectName,
      production_branch: DEFAULT_BRANCH
    })
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Cloudflare authentication failed. Check CLOUDFLARE_API_TOKEN permissions.');
  }

  const data = await readJson(response);
  return data.result;
}

async function createOrReuseProject(bundle) {
  const projectName = getProjectName(bundle);
  const existing = await getProject(projectName);
  if (existing) {
    return existing;
  }
  return createProject(projectName);
}

async function ensureBundleHasFiles(bundle) {
  if (!bundle?.files?.length) {
    throw new Error('The deployment bundle is empty.');
  }

  const indexFile = bundle.files.find(file => file.path === 'index.html');
  if (!indexFile) {
    throw new Error('The deployment bundle must include index.html.');
  }
}

async function writeBundleToTemp(bundle) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vibenote-cf-pages-'));

  for (const file of bundle.files) {
    const fullPath = path.join(tempRoot, file.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content, 'utf8');
  }

  return tempRoot;
}

async function removeTempDir(tempRoot) {
  if (!tempRoot) return;
  await fs.rm(tempRoot, { recursive: true, force: true });
}

function runWranglerDeploy({ directory, projectName }) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: getRequiredEnv('CLOUDFLARE_ACCOUNT_ID'),
      CLOUDFLARE_API_TOKEN: getRequiredEnv('CLOUDFLARE_API_TOKEN')
    };

    const args = [
      '--yes',
      'wrangler',
      'pages',
      'deploy',
      directory,
      '--project-name',
      projectName,
      '--branch',
      DEFAULT_BRANCH
    ];

    const child = spawn('npx', args, {
      env,
      shell: true,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || 'Cloudflare deployment failed.'));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parsePagesUrl(output, project) {
  const combined = `${output.stdout}\n${output.stderr}`;
  const match = combined.match(/https?:\/\/[a-z0-9.-]+\.pages\.dev/gi);
  if (match?.length) {
    return match[match.length - 1];
  }

  if (project?.subdomain) {
    return `https://${project.subdomain}`;
  }

  if (project?.name) {
    return `https://${project.name}.pages.dev`;
  }

  throw new Error('Cloudflare deployment completed but no pages.dev URL was returned.');
}

async function deployToCloudflarePages(bundle) {
  await ensureBundleHasFiles(bundle);

  let tempRoot;
  try {
    const project = await createOrReuseProject(bundle);
    tempRoot = await writeBundleToTemp(bundle);
    const output = await runWranglerDeploy({
      directory: tempRoot,
      projectName: project.name || getProjectName(bundle)
    });
    const url = parsePagesUrl(output, project);

    return {
      status: 'deployed',
      provider: 'cloudflare',
      providerLabel: 'Cloudflare Pages',
      url,
      steps: [
        'Authenticating with Cloudflare Pages',
        'Creating or reusing Pages project',
        'Uploading static assets',
        'Returning pages.dev URL'
      ]
    };
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      throw new Error('Cloudflare authentication failed. Check CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.');
    }
    throw error;
  } finally {
    await removeTempDir(tempRoot);
  }
}

module.exports = {
  deployToCloudflarePages
};

