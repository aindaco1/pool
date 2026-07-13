const IMAGE_EXTENSIONS = new Set(['gif', 'jpg', 'jpeg', 'png', 'webp', 'avif']);
const RESPONSIVE_IMAGE_EXTENSIONS = new Set(['gif', 'jpg', 'jpeg', 'png']);
const VIDEO_EXTENSIONS = new Set(['m4v', 'mov', 'mp4', 'webm']);
const SOURCE_VIDEO_EXTENSIONS = new Set(['m4v', 'mov', 'mp4']);
const AUDIO_EXTENSIONS = new Set(['aac', 'm4a', 'mp3', 'ogg', 'wav']);
export const MEDIA_RESPONSIVE_WIDTHS = Object.freeze([320, 480, 640, 960, 1600]);
export const MEDIA_MANIFEST_PATH = '_data/media-optimization-manifest.json';
export const MEDIA_MANIFEST_VERSION = 1;

export function normalizeMediaRepoPath(value = '') {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

export function mediaPublicPath(value = '') {
  const repoPath = normalizeMediaRepoPath(value);
  return repoPath.startsWith('assets/') ? `/${repoPath}` : '';
}

export function mediaPathExtension(value = '') {
  const repoPath = normalizeMediaRepoPath(value);
  const filename = repoPath.split('/').pop() || '';
  const index = filename.lastIndexOf('.');
  return index >= 0 ? filename.slice(index + 1).toLowerCase() : '';
}

export function mediaPathLabel(value = '') {
  const filename = normalizeMediaRepoPath(value).split('/').pop() || '';
  return filename
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/-\d+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mediaCampaignSlug(value = '') {
  const match = normalizeMediaRepoPath(value).match(/^assets\/(?:images|videos|audio)\/campaigns\/([^/]+)\//);
  return match ? match[1] : '';
}

export function mediaScope(value = '') {
  const repoPath = normalizeMediaRepoPath(value);
  if (mediaCampaignSlug(repoPath)) return 'campaign';
  if (/^assets\/(?:images|videos|audio)\/defaults\//.test(repoPath)) return 'shared';
  return 'platform';
}

export function responsiveImageDerivativeInfo(value = '') {
  const repoPath = normalizeMediaRepoPath(value);
  const match = repoPath.match(/^(.*)-(\d+)\.webp$/i);
  if (!match) return null;
  const width = Number(match[2]);
  if (!MEDIA_RESPONSIVE_WIDTHS.includes(width)) return null;
  return { basePath: match[1], width };
}

export function probableResponsiveImageSourcePaths(value = '') {
  const info = responsiveImageDerivativeInfo(value);
  if (!info) return [];
  return ['png', 'jpg', 'jpeg', 'gif'].map((extension) => `${info.basePath}.${extension}`);
}

export function probableVideoSourcePaths(value = '') {
  const repoPath = normalizeMediaRepoPath(value);
  if (mediaPathExtension(repoPath) !== 'webm' || !repoPath.startsWith('assets/videos/')) return [];
  const base = repoPath.slice(0, -'.webm'.length);
  return ['mp4', 'mov', 'm4v'].map((extension) => `${base}.${extension}`);
}

export function classifyMediaPath(value = '', knownPaths = null) {
  const repoPath = normalizeMediaRepoPath(value);
  const extension = mediaPathExtension(repoPath);
  let type = '';
  if (IMAGE_EXTENSIONS.has(extension) && repoPath.startsWith('assets/images/')) type = 'image';
  else if (VIDEO_EXTENSIONS.has(extension) && repoPath.startsWith('assets/videos/')) type = 'video';
  else if ((AUDIO_EXTENSIONS.has(extension) || (extension === 'webm' && repoPath.startsWith('assets/audio/'))) && repoPath.startsWith('assets/audio/')) type = 'audio';
  if (!type) return null;

  const pathSet = knownPaths instanceof Set ? knownPaths : new Set(knownPaths || []);
  const responsive = type === 'image' ? responsiveImageDerivativeInfo(repoPath) : null;
  const imageSourcePath = responsive
    ? probableResponsiveImageSourcePaths(repoPath).find((candidate) => pathSet.has(candidate)) || ''
    : '';
  const videoSourcePath = type === 'video' && extension === 'webm'
    ? probableVideoSourcePaths(repoPath).find((candidate) => pathSet.has(candidate)) || ''
    : '';
  const derivative = Boolean(responsive && imageSourcePath) || Boolean(videoSourcePath);

  return {
    path: repoPath,
    publicPath: mediaPublicPath(repoPath),
    name: repoPath.split('/').pop() || '',
    label: mediaPathLabel(repoPath),
    extension,
    type,
    role: derivative ? 'derived' : 'source',
    sourcePath: imageSourcePath || videoSourcePath,
    derivativeWidth: responsive?.width || null,
    scope: mediaScope(repoPath),
    campaignSlug: mediaCampaignSlug(repoPath)
  };
}

export function expectedMediaDerivativePaths(value = '', metadata = {}) {
  const classified = classifyMediaPath(value);
  if (!classified || classified.role !== 'source') return [];
  if (classified.type === 'image' && RESPONSIVE_IMAGE_EXTENSIONS.has(classified.extension)) {
    const width = Math.max(0, Number(metadata.width || 0) || 0);
    const base = classified.path.slice(0, -(classified.extension.length + 1));
    return MEDIA_RESPONSIVE_WIDTHS
      .filter((targetWidth) => !width || width > targetWidth)
      .map((targetWidth) => `${base}-${targetWidth}.webp`);
  }
  if (classified.type === 'video' && SOURCE_VIDEO_EXTENSIONS.has(classified.extension)) {
    return [`${classified.path.slice(0, -(classified.extension.length + 1))}.webm`];
  }
  return [];
}

export function normalizeMediaManifest(value = {}) {
  if (!value || Number(value.version) !== MEDIA_MANIFEST_VERSION || !Array.isArray(value.assets)) {
    return { version: MEDIA_MANIFEST_VERSION, assets: [] };
  }
  return {
    version: MEDIA_MANIFEST_VERSION,
    policy: value.policy && typeof value.policy === 'object' ? value.policy : {},
    assets: value.assets.filter((asset) => asset && typeof asset === 'object' && asset.path)
  };
}

export function mediaPlacementBudget(placement = '') {
  const budgets = {
    hero: { maxBytes: 2_000_000, recommendedRatio: '1:1', label: 'square hero' },
    hero_wide: { maxBytes: 2_500_000, recommendedRatio: '16:9', label: 'wide hero' },
    gallery: { maxBytes: 1_500_000, recommendedRatio: 'flexible', label: 'gallery image' },
    tier: { maxBytes: 1_000_000, recommendedRatio: '1:1', label: 'tier card' },
    blast: { maxBytes: 1_000_000, recommendedRatio: 'flexible', label: 'Blast image' },
    poster: { maxBytes: 1_000_000, recommendedRatio: '16:9', label: 'video poster' },
    social: { maxBytes: 1_500_000, recommendedRatio: '1.91:1', label: 'social preview' }
  };
  return budgets[String(placement || '').trim().toLowerCase()] || budgets.gallery;
}
