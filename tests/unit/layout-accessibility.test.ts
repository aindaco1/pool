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

  it('keeps keyboard focus outlines black instead of the legacy yellow accent', () => {
    const variables = readRepoFile('assets', 'partials', '_variables.scss');
    const accessibility = readRepoFile('assets', 'partials', '_accessibility.scss');

    expect(variables).toContain('$focus--outline: $color--black;');
    expect(accessibility).toContain('outline: 2px solid $focus--outline;');
    expect(accessibility).toContain('outline: 3px solid $focus--outline;');
    expect(accessibility).toContain('box-shadow: 0 0 0 4px $focus--outline-shadow;');
    expect(accessibility).not.toContain('outline: 2px solid $goback--accent;');
    expect(accessibility).not.toContain('outline: 3px solid $goback--accent;');
    expect(accessibility).not.toContain('rgba($goback--accent');
  });
});
