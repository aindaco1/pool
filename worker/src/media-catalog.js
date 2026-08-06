import {
  MEDIA_MANIFEST_VERSION,
  MEDIA_RESPONSIVE_WIDTHS,
  createMediaCatalog,
  mediaPathExtension,
  mediaPathLabel,
  mediaPublicPath,
  normalizeMediaRepoPath,
  probableResponsiveImageSourcePaths,
  probableVideoSourcePaths,
  responsiveImageDerivativeInfo
} from '../../shared/dust-wave-platform/packages/media-core/src/site-catalog.js';

export {
  MEDIA_MANIFEST_VERSION,
  MEDIA_RESPONSIVE_WIDTHS,
  mediaPathExtension,
  mediaPathLabel,
  mediaPublicPath,
  normalizeMediaRepoPath,
  probableResponsiveImageSourcePaths,
  probableVideoSourcePaths,
  responsiveImageDerivativeInfo
};

export const MEDIA_MANIFEST_PATH = '_data/media-optimization-manifest.json';

export function mediaCampaignSlug(value = '') {
  const match = normalizeMediaRepoPath(value)
    .match(/^assets\/(?:images|videos|audio)\/campaigns\/([^/]+)\//);
  return match ? match[1] : '';
}

export function mediaScope(value = '') {
  const repoPath = normalizeMediaRepoPath(value);
  if (mediaCampaignSlug(repoPath)) return 'campaign';
  if (/^assets\/(?:images|videos|audio)\/defaults\//.test(repoPath)) return 'shared';
  return 'platform';
}

const catalog = createMediaCatalog({
  scopeForPath: mediaScope,
  entitySlugForPath: mediaCampaignSlug,
  entitySlugKey: 'campaignSlug',
  placementBudgets: {
    hero: { maxBytes: 2_000_000, recommendedRatio: '1:1', label: 'square hero' },
    hero_wide: { maxBytes: 2_500_000, recommendedRatio: '16:9', label: 'wide hero' },
    gallery: { maxBytes: 1_500_000, recommendedRatio: 'flexible', label: 'gallery image' },
    tier: { maxBytes: 1_000_000, recommendedRatio: '1:1', label: 'tier card' },
    blast: { maxBytes: 1_000_000, recommendedRatio: 'flexible', label: 'Blast image' },
    poster: { maxBytes: 1_000_000, recommendedRatio: '16:9', label: 'video poster' },
    social: { maxBytes: 1_500_000, recommendedRatio: '1.91:1', label: 'social preview' }
  },
  defaultPlacement: 'gallery',
  includeWebmAudio: true
});

export const classifyMediaPath = catalog.classifyMediaPath;
export const expectedMediaDerivativePaths = catalog.expectedMediaDerivativePaths;
export const normalizeMediaManifest = catalog.normalizeMediaManifest;
export const mediaPlacementBudget = catalog.mediaPlacementBudget;
