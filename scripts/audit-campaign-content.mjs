#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const allowedEmbedProviders = new Set(['spotify', 'youtube', 'vimeo']);
export const spotifyEmbedPrefix = 'https://open.spotify.com/embed/';
export const youtubeEmbedPrefixes = [
  'https://www.youtube.com/embed/',
  'https://www.youtube-nocookie.com/embed/'
];
export const vimeoEmbedPrefix = 'https://player.vimeo.com/video/';

export function listCampaignFiles(repoRoot) {
  const campaignsDir = path.join(repoRoot, '_campaigns');
  if (!fs.existsSync(campaignsDir)) {
    return [];
  }

  return fs.readdirSync(campaignsDir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => path.join(campaignsDir, file));
}

export function auditCampaignContent(repoRoot) {
  const failures = [];
  const campaignFiles = listCampaignFiles(repoRoot);

  for (const campaignFile of campaignFiles) {
    const relPath = path.relative(repoRoot, campaignFile);
    const content = fs.readFileSync(campaignFile, 'utf8');

    if (/\bstyle\s*=\s*["']/i.test(content)) {
      failures.push(`${relPath}: inline style attributes are not allowed in campaign content.`);
    }

    if (/<script\b/i.test(content)) {
      failures.push(`${relPath}: raw <script> tags are not allowed in campaign content.`);
    }

    const inlineEventMatches = content.match(/\son[a-z]+\s*=\s*["']/ig) || [];
    for (const match of inlineEventMatches) {
      failures.push(`${relPath}: inline event handler found (${match.trim()}).`);
    }

    if (/<iframe\b/i.test(content)) {
      failures.push(`${relPath}: raw <iframe> HTML is not allowed in campaign content.`);
    }

    if (/^\s+html:\s+/m.test(content)) {
      failures.push(`${relPath}: raw html embed fields are not allowed in campaign content.`);
    }

    const embedBlockPattern = /-\s*type:\s*embed\b([\s\S]*?)(?=\n\s*-\s*type:|\n[a-zA-Z_][\w-]*:|\n---|$)/g;
    for (const embedMatch of content.matchAll(embedBlockPattern)) {
      const blockText = embedMatch[1];
      const providerMatch = blockText.match(/^\s+provider:\s*([a-z0-9_-]+)/im);
      const provider = providerMatch ? providerMatch[1].toLowerCase() : null;

      if (!provider) {
        failures.push(`${relPath}: embed blocks must declare a provider.`);
        continue;
      }

      if (!allowedEmbedProviders.has(provider)) {
        failures.push(`${relPath}: embed provider "${provider}" is not approved.`);
        continue;
      }

      const srcMatch = blockText.match(/^\s+src:\s*(.+)$/im);
      const src = srcMatch ? srcMatch[1].trim() : '';

      if (provider === 'spotify' && !src.startsWith(spotifyEmbedPrefix)) {
        failures.push(
          `${relPath}: spotify embeds must use a src under ${spotifyEmbedPrefix}.`
        );
      }

      if (provider === 'youtube' && !youtubeEmbedPrefixes.some((prefix) => src.startsWith(prefix))) {
        failures.push(`${relPath}: youtube embeds must use an approved embed src.`);
      }

      if (provider === 'vimeo' && !src.startsWith(vimeoEmbedPrefix)) {
        failures.push(`${relPath}: vimeo embeds must use a src under ${vimeoEmbedPrefix}.`);
      }
    }
  }

  return failures;
}

export function main() {
  const repoRoot = process.cwd();
  const failures = auditCampaignContent(repoRoot);

  if (failures.length > 0) {
    console.error('Campaign content audit failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Campaign content audit passed.');
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentPath = fileURLToPath(import.meta.url);

if (executedPath === currentPath) {
  main();
}
