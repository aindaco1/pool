import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  auditCampaignContent,
  allowedEmbedProviders,
  spotifyEmbedPrefix,
  youtubeEmbedPrefixes,
  vimeoEmbedPrefix,
} from '../../scripts/audit-campaign-content.mjs';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('campaign content security audit', () => {
  it('accepts the current campaign content set', () => {
    expect(auditCampaignContent(repoRoot)).toEqual([]);
  });

  it('keeps stretch goal titles escaped in the shared progress include', () => {
    const progressTemplate = fs.readFileSync(path.join(repoRoot, '_includes', 'progress.html'), 'utf8');
    expect(progressTemplate).toContain('{{ s.title | escape }}');
  });

  it('keeps the approved structured embed allowlist narrow', () => {
    expect(Array.from(allowedEmbedProviders).sort()).toEqual(['spotify', 'vimeo', 'youtube']);
    expect(spotifyEmbedPrefix).toBe('https://open.spotify.com/embed/');
    expect(youtubeEmbedPrefixes).toEqual([
      'https://www.youtube.com/embed/',
      'https://www.youtube-nocookie.com/embed/'
    ]);
    expect(vimeoEmbedPrefix).toBe('https://player.vimeo.com/video/');
  });

  it('rejects raw iframe html and inline styles in campaign content', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-campaign-audit-'));
    const campaignsDir = path.join(tempRoot, '_campaigns');
    fs.mkdirSync(campaignsDir, { recursive: true });
    fs.writeFileSync(
      path.join(campaignsDir, 'bad.md'),
      `---
layout: campaign
title: "Bad"
slug: bad
long_content:
  - type: embed
    html: '<iframe style="border-radius:12px" src="https://open.spotify.com/embed/playlist/abc"></iframe>'
---
`,
      'utf8'
    );

    const failures = auditCampaignContent(tempRoot);
    expect(failures).toEqual(
      expect.arrayContaining([
        '_campaigns/bad.md: inline style attributes are not allowed in campaign content.',
        '_campaigns/bad.md: raw <iframe> HTML is not allowed in campaign content.',
        '_campaigns/bad.md: raw html embed fields are not allowed in campaign content.',
      ])
    );

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('rejects unapproved structured embed providers', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-campaign-audit-'));
    const campaignsDir = path.join(tempRoot, '_campaigns');
    fs.mkdirSync(campaignsDir, { recursive: true });
    fs.writeFileSync(
      path.join(campaignsDir, 'bad-provider.md'),
      `---
layout: campaign
title: "Bad Provider"
slug: bad-provider
long_content:
  - type: embed
    provider: loom
    src: https://www.loom.com/embed/123456
---
`,
      'utf8'
    );

    const failures = auditCampaignContent(tempRoot);
    expect(failures).toContain('_campaigns/bad-provider.md: embed provider "loom" is not approved.');

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('accepts approved youtube and vimeo structured embeds', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-campaign-audit-'));
    const campaignsDir = path.join(tempRoot, '_campaigns');
    fs.mkdirSync(campaignsDir, { recursive: true });
    fs.writeFileSync(
      path.join(campaignsDir, 'good-provider.md'),
      `---
layout: campaign
title: "Good Provider"
slug: good-provider
long_content:
  - type: embed
    provider: youtube
    src: https://www.youtube-nocookie.com/embed/abc123
  - type: embed
    provider: vimeo
    src: https://player.vimeo.com/video/123456
---
`,
      'utf8'
    );

    expect(auditCampaignContent(tempRoot)).toEqual([]);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
});
