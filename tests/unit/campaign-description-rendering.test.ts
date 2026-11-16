import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('campaign search and social descriptions', () => {
  it('uses the synopsis for short opening headings while preserving substantive excerpts in both locales', () => {
    const script = String.raw`
require 'jekyll'
require 'fileutils'
require 'tmpdir'
require 'json'

root = Dir.pwd
synopsis = 'A filmmaker prepares for fatherhood while questioning the freedom he is about to lose.'
excerpt = 'A complete opening paragraph gives readers enough context to understand and support this film.'
fixtures = {
  'heading' => ['#### Writer/Director', synopsis],
  'paragraph' => [excerpt, excerpt],
  'no-content' => [nil, synopsis]
}
Dir.mktmpdir('pool-description-source') do |source|
  %w(_plugins _layouts _includes _data).each { |directory| FileUtils.cp_r(File.join(root, directory), source) }
  FileUtils.mkdir_p(File.join(source, '_campaigns'))
  fixtures.each do |slug, (body, _expected)|
    data = {
      'layout' => 'campaign', 'title' => 'Description test', 'slug' => slug,
      'state' => 'upcoming', 'goal_amount' => 100, 'tiers' => [],
      'short_blurb' => synopsis,
      'long_content' => body ? [{'type' => 'text', 'body' => body}] : []
    }
    File.write(File.join(source, '_campaigns', "#{slug}.md"), YAML.dump(data) + "---\n")
  end
  # Exercise the published content that originally broke the production SEO audit.
  FileUtils.cp(File.join(root, '_campaigns', 'you-re-only-young-once.md'), File.join(source, '_campaigns'))
  Dir.mktmpdir('pool-description-output') do |destination|
    site = Jekyll::Site.new(Jekyll.configuration({
      'config' => File.join(root, '_config.yml'), 'source' => source,
      'destination' => destination, 'disable_disk_cache' => true, 'quiet' => true
    }))
    site.process
    rendered = (fixtures.keys + ['you-re-only-young-once']).flat_map do |slug|
      ['', 'es/'].map do |locale|
        { slug: slug, locale: locale, expected: fixtures[slug]&.last,
          html: File.read(File.join(destination, locale, 'campaigns', slug, 'index.html')) }
      end
    end
    puts "DESCRIPTION_RESULTS:#{JSON.generate(rendered)}"
  end
end
`;
    const output = execFileSync('bundle', ['exec', 'ruby', '-e', script], {
      cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, JEKYLL_ENV: 'test', SKIP_TESTS: '1' }
    });
    const results = JSON.parse(output.split('DESCRIPTION_RESULTS:')[1]);
    expect(results).toHaveLength(8);
    for (const result of results) {
      const document = new DOMParser().parseFromString(result.html, 'text/html');
      for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
        const description = document.querySelector(selector)?.getAttribute('content');
        expect(description?.length, `${result.locale}${result.slug}: ${selector}`).toBeGreaterThanOrEqual(40);
        if (result.expected) expect(description).toBe(result.expected);
        else expect(description).not.toContain('Joey Greenberg- Writer/Director');
      }
      if (result.slug === 'heading') expect(document.body.textContent).toContain('Writer/Director');
      if (result.slug === 'you-re-only-young-once') expect(document.body.textContent).toContain('Joey Greenberg- Writer/Director');
    }
  }, 30_000);
});
