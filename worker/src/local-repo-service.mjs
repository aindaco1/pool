import http from 'node:http';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PORT = 8799;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function parseDevVars(filePath) {
  const values = {};
  let source = '';
  try {
    source = readFileSync(filePath, 'utf8');
  } catch (_error) {
    return values;
  }
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2];
  }
  return values;
}

const workerDir = process.cwd();
const devVars = parseDevVars(path.join(workerDir, '.dev.vars'));
const repoRoot = path.resolve(process.env.ADMIN_LOCAL_REPO_ROOT || devVars.ADMIN_LOCAL_REPO_ROOT || path.join(workerDir, '..'));
const token = String(process.env.ADMIN_LOCAL_REPO_TOKEN || devVars.ADMIN_LOCAL_REPO_TOKEN || process.env.ADMIN_SECRET || devVars.ADMIN_SECRET || '').trim();
const port = Number(process.env.ADMIN_LOCAL_REPO_SERVICE_PORT || devVars.ADMIN_LOCAL_REPO_SERVICE_PORT || DEFAULT_PORT) || DEFAULT_PORT;

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(`${JSON.stringify(payload)}\n`);
}

function authorize(req, res) {
  if (!token) {
    jsonResponse(res, 503, { ok: false, error: 'Local repo token is not configured.' });
    return false;
  }
  const auth = String(req.headers.authorization || '');
  if (auth !== `Bearer ${token}`) {
    jsonResponse(res, 403, { ok: false, error: 'Forbidden' });
    return false;
  }
  return true;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function normalizeRepoPath(value = '') {
  const normalized = String(value || '').replace(/^\/+/, '').split(/[?#]/)[0];
  if (!normalized || normalized.includes('\\') || normalized.split('/').some((part) => part === '..')) return '';
  return normalized;
}

function absolute(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized || path.isAbsolute(normalized)) return '';
  const absolutePath = path.resolve(repoRoot, normalized);
  const rootWithSeparator = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  if (absolutePath !== repoRoot && !absolutePath.startsWith(rootWithSeparator)) return '';
  return absolutePath;
}

async function exists(repoPath) {
  const filePath = absolute(repoPath);
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function walkFiles(repoDirectory) {
  const directoryPath = absolute(repoDirectory);
  if (!directoryPath) return [];
  let entries = [];
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (_error) {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const childRepoPath = `${repoDirectory.replace(/\/$/, '')}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await walkFiles(childRepoPath));
    } else if (entry.isFile()) {
      files.push(childRepoPath);
    }
  }
  return files;
}

function normalizeArchiveMediaReference(value = '') {
  const text = String(value || '').replace(/^\/+/, '').split(/[?#]/)[0];
  if (!text || text.includes('..') || text.includes('\\')) return '';
  if (!/^assets\/(?:images|videos|audio)\//.test(text)) return '';
  return text;
}

function campaignArchiveMediaReferences(source = '') {
  const refs = new Set();
  const matches = String(source || '').match(/\/?assets\/(?:images|videos|audio)\/[^\s"'<>),\]}]+/g) || [];
  matches.forEach((match) => {
    const normalized = normalizeArchiveMediaReference(match);
    if (normalized) refs.add(normalized);
  });
  return refs;
}

function isArchiveableCampaignMediaReference(reference, campaignSlug) {
  const slug = String(campaignSlug || '').trim();
  return reference.startsWith(`assets/images/campaigns/${slug}/`) ||
    reference.startsWith(`assets/videos/campaigns/${slug}/`) ||
    reference.startsWith(`assets/audio/campaigns/${slug}/`) ||
    reference.startsWith('assets/images/campaign-add-ons/');
}

async function archiveCampaign({ campaignSlug = '', requestedBy = '' } = {}) {
  const slug = String(campaignSlug || '').trim();
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) {
    throw Object.assign(new Error('Invalid campaign slug.'), { status: 400, code: 'invalid_campaign_slug' });
  }

  const archiveRoot = `archive/campaigns/${slug}`;
  const campaignPath = `_campaigns/${slug}.md`;
  const archivedCampaignPath = `${archiveRoot}/_campaigns/${slug}.md`;
  const campaignAbsolutePath = absolute(campaignPath);
  const archiveRootAbsolutePath = absolute(archiveRoot);
  if (!campaignAbsolutePath || !archiveRootAbsolutePath) {
    throw Object.assign(new Error('Invalid local campaign archive path.'), { status: 400, code: 'invalid_local_archive_path' });
  }
  if (!await exists(campaignPath)) {
    throw Object.assign(new Error('Local campaign source was not found. If this campaign was created on GitHub, pull the branch before archiving it locally.'), {
      status: 404,
      code: 'local_campaign_source_not_found'
    });
  }
  if (await exists(archiveRoot)) {
    throw Object.assign(new Error('This campaign already has a local archive.'), { status: 409, code: 'local_campaign_archive_exists' });
  }

  const campaignSource = await fs.readFile(campaignAbsolutePath, 'utf8');
  const referencedMedia = Array.from(campaignArchiveMediaReferences(campaignSource))
    .filter((reference) => isArchiveableCampaignMediaReference(reference, slug));
  const candidateMedia = new Set(referencedMedia);
  for (const directory of [
    `assets/images/campaigns/${slug}`,
    `assets/videos/campaigns/${slug}`,
    `assets/audio/campaigns/${slug}`
  ]) {
    const files = await walkFiles(directory);
    files.forEach((filePath) => candidateMedia.add(filePath));
  }

  const otherCampaignReferences = new Set();
  for (const filePath of await walkFiles('_campaigns')) {
    if (filePath === campaignPath || !filePath.endsWith('.md')) continue;
    try {
      const source = await fs.readFile(absolute(filePath), 'utf8');
      campaignArchiveMediaReferences(source).forEach((reference) => otherCampaignReferences.add(reference));
    } catch (_error) {
    }
  }

  const movedMedia = [];
  const skippedSharedMedia = [];
  for (const sourcePath of Array.from(candidateMedia).sort()) {
    if (!await exists(sourcePath)) continue;
    if (otherCampaignReferences.has(sourcePath)) {
      skippedSharedMedia.push(sourcePath);
      continue;
    }
    const targetPath = `${archiveRoot}/${sourcePath}`;
    const sourceAbsolutePath = absolute(sourcePath);
    const targetAbsolutePath = absolute(targetPath);
    if (!sourceAbsolutePath || !targetAbsolutePath) continue;
    await fs.mkdir(path.dirname(targetAbsolutePath), { recursive: true });
    await fs.rename(sourceAbsolutePath, targetAbsolutePath);
    movedMedia.push({ sourcePath, archivePath: targetPath });
  }

  let archivedSource = campaignSource;
  movedMedia.forEach((item, index) => {
    const placeholder = `__POOL_ARCHIVE_MEDIA_${index}__`;
    archivedSource = archivedSource.split(`/${item.sourcePath}`).join(`/${placeholder}`);
    archivedSource = archivedSource.split(item.sourcePath).join(placeholder);
    archivedSource = archivedSource.split(placeholder).join(item.archivePath);
  });

  const archivedCampaignAbsolutePath = absolute(archivedCampaignPath);
  await fs.mkdir(path.dirname(archivedCampaignAbsolutePath), { recursive: true });
  await fs.rename(campaignAbsolutePath, archivedCampaignAbsolutePath);
  await fs.writeFile(archivedCampaignAbsolutePath, archivedSource, 'utf8');
  await fs.writeFile(absolute(`${archiveRoot}/archive-manifest.json`), `${JSON.stringify({
    campaignSlug: slug,
    requestedBy: String(requestedBy || ''),
    archivedAt: new Date().toISOString(),
    sourceCampaignPath: campaignPath,
    archivedCampaignPath,
    movedMedia,
    skippedSharedMedia
  }, null, 2)}\n`, 'utf8');

  return {
    ok: true,
    mode: 'local',
    archivePath: `${archiveRoot}/`,
    movedMedia,
    skippedSharedMedia
  };
}

async function handleRequest(req, res) {
  if (req.method === 'GET' && req.url === '/health') {
    jsonResponse(res, 200, { ok: true, repoRoot });
    return;
  }
  if (req.method !== 'POST') {
    jsonResponse(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }
  if (!authorize(req, res)) return;

  const body = await readJsonBody(req);
  if (req.url === '/read') {
    const repoPath = normalizeRepoPath(body.path);
    const filePath = absolute(repoPath);
    if (!filePath) throw Object.assign(new Error('Invalid local repository path.'), { status: 400, code: 'invalid_local_repo_path' });
    const content = await fs.readFile(filePath, 'utf8');
    jsonResponse(res, 200, { ok: true, path: repoPath, content });
    return;
  }
  if (req.url === '/write') {
    const repoPath = normalizeRepoPath(body.path);
    const filePath = absolute(repoPath);
    if (!filePath) throw Object.assign(new Error('Invalid local repository path.'), { status: 400, code: 'invalid_local_repo_path' });
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, String(body.content || ''), { encoding: 'utf8', flag: body.overwrite ? 'w' : 'wx' });
    jsonResponse(res, 200, { ok: true, path: repoPath, commitSha: 'local', commitUrl: '' });
    return;
  }
  if (req.url === '/campaign-files') {
    const files = [];
    for (const filePath of await walkFiles('_campaigns')) {
      if (!filePath.endsWith('.md')) continue;
      files.push({
        name: path.basename(filePath),
        path: filePath,
        content: await fs.readFile(absolute(filePath), 'utf8')
      });
    }
    jsonResponse(res, 200, { ok: true, files });
    return;
  }
  if (req.url === '/archive') {
    jsonResponse(res, 200, await archiveCampaign(body));
    return;
  }

  jsonResponse(res, 404, { ok: false, error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    jsonResponse(res, error?.status || (error?.code === 'EEXIST' ? 409 : error?.code === 'ENOENT' ? 404 : 500), {
      ok: false,
      error: error?.message || 'Local repository operation failed.',
      code: error?.code || 'local_repo_operation_failed'
    });
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local repo service listening on 127.0.0.1:${port} for ${repoRoot}`);
});
