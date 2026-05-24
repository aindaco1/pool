import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

describe('layout accessibility scaffolding', () => {
  it('keeps skip links and main-content anchors on public interactive layouts', () => {
    const campaignLayout = readRepoFile('_layouts', 'campaign.html');
    const communityLayout = readRepoFile('_layouts', 'community.html');
    const embedLayout = readRepoFile('_layouts', 'campaign-embed.html');
    const adminLayout = readRepoFile('_layouts', 'admin.html');

    expect(campaignLayout).toContain('href="#main-content"');
    expect(campaignLayout).toContain('<main id="main-content"');
    expect(communityLayout).toContain('href="#main-content"');
    expect(communityLayout).toContain('<main id="main-content"');
    expect(embedLayout).toContain('href="#main-content"');
    expect(embedLayout).toContain('<main id="main-content"');
    expect(adminLayout).toContain('href="#main-content"');
    expect(adminLayout).toContain('<main id="main-content"');
  });
});
