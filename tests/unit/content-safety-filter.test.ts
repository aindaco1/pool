import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function renderFilter(method: 'safe_markdownify' | 'approved_embed_src', input: string, provider = '') {
  const script = `
require 'jekyll'
require 'liquid'
require '${repoRoot}/_plugins/content_safety_filter'
site = Jekyll::Site.new(Jekyll.configuration({
  'source' => '${repoRoot}',
  'destination' => '/tmp/pool-filter-dest',
  'url' => 'https://pool.dustwave.xyz',
  'quiet' => true
}))
filter = Object.new
filter.extend(Jekyll::ContentSafetyFilter)
result = if '${method}' == 'approved_embed_src'
  filter.approved_embed_src(ARGV[0], ARGV[1])
else
  filter.safe_markdownify(ARGV[0], site.config['url'])
end
puts result
`;

  return execFileSync('bundle', ['exec', 'ruby', '-e', script, input, provider], {
    cwd: repoRoot,
    encoding: 'utf8'
  }).trim();
}

describe('content safety filter', () => {
  it('neutralizes javascript markdown links', () => {
    const rendered = renderFilter('safe_markdownify', '[x](javascript:alert(1))');
    expect(rendered).not.toContain('href="javascript:alert(1)"');
    expect(rendered).toContain('href="#"');
  });

  it('neutralizes data markdown links', () => {
    const rendered = renderFilter('safe_markdownify', '[x](data:text/html,boom)');
    expect(rendered).not.toContain('href="data:text/html,boom"');
    expect(rendered).toContain('href="#"');
  });

  it('keeps external https markdown links opening in a new tab', () => {
    const rendered = renderFilter('safe_markdownify', '[Dust Wave](https://dustwave.xyz)');
    expect(rendered).toContain('href="https://dustwave.xyz"');
    expect(rendered).toContain('target="_blank"');
    expect(rendered).toContain('rel="noopener noreferrer"');
  });

  it('keeps internal markdown links in the same tab', () => {
    const rendered = renderFilter('safe_markdownify', '[Terms](/terms/)');
    expect(rendered).toContain('href="/terms/"');
    expect(rendered).not.toContain('target="_blank"');
  });

  it('rejects javascript structured embed urls even when they contain an approved substring', () => {
    const rendered = renderFilter(
      'approved_embed_src',
      'javascript:alert(1)//https://www.youtube.com/embed/abc',
      'youtube'
    );
    expect(rendered).toBe('');
  });

  it('allows approved structured embed urls', () => {
    const rendered = renderFilter(
      'approved_embed_src',
      'https://www.youtube-nocookie.com/embed/abc123',
      'youtube'
    );
    expect(rendered).toBe('https://www.youtube-nocookie.com/embed/abc123');
  });
});
