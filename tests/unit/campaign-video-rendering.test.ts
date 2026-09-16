import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('campaign video source rendering', () => {
  it('renders matching source types for hero and content videos in both locales', () => {
    const script = String.raw`
require 'jekyll'
require 'fileutils'
require 'tmpdir'
require 'json'

root = Dir.pwd
fixtures = {
  'mp4' => ['/assets/videos/campaigns/example/upload.mp4', 'video/mp4'],
  'webm' => ['/assets/videos/campaigns/example/upload.webm', 'video/webm'],
  'mov' => ['/assets/videos/campaigns/example/upload.mov', 'video/quicktime'],
  'mixed-case' => ['/assets/videos/campaigns/example/upload.MP4?download=1&name=clip.webm#t=2', 'video/mp4'],
  'unknown' => ['/assets/videos/campaigns/example/stream?file=clip.mp4', nil]
}
Dir.mktmpdir('pool-video-source') do |source|
  %w(_plugins _layouts _includes _data).each do |directory|
    FileUtils.cp_r(File.join(root, directory), source)
  end
  FileUtils.mkdir_p(File.join(source, '_campaigns'))
  fixtures.each do |slug, (url, _type)|
    File.write(File.join(source, '_campaigns', "#{slug}.md"), <<~YAML)
      ---
      layout: campaign
      title: Video test
      slug: #{slug}
      state: upcoming
      goal_amount: 100
      start_date: 2099-01-01
      goal_deadline: 2099-02-01
      tiers: []
      hero_video: "#{url}"
      long_content:
        - type: video
          provider: local
          src: "#{url}"
      ---
    YAML
  end
  Dir.mktmpdir('pool-video-output') do |destination|
    site = Jekyll::Site.new(Jekyll.configuration({
      'config' => File.join(root, '_config.yml'),
      'source' => source,
      'destination' => destination,
      'disable_disk_cache' => true,
      'quiet' => true
    }))
    site.process
    rendered = fixtures.flat_map do |slug, (url, type)|
      ['', 'es/'].map do |locale|
        { slug: slug, locale: locale, url: url, type: type,
          html: File.read(File.join(destination, locale, 'campaigns', slug, 'index.html')) }
      end
    end
    puts "VIDEO_RESULTS:#{JSON.generate(rendered)}"
  end
end
`;
    const output = execFileSync('bundle', ['exec', 'ruby', '-e', script], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, JEKYLL_ENV: 'test', SKIP_TESTS: '1' }
    });
    const results = JSON.parse(output.split('VIDEO_RESULTS:')[1]);
    expect(results).toHaveLength(10);
    for (const result of results) {
      const document = new DOMParser().parseFromString(result.html, 'text/html');
      for (const selector of ['#hero-video source', '.content-block--video video source']) {
        const sources = document.querySelectorAll(selector);
        const context = `${result.locale}${result.slug}: ${selector}`;
        expect(sources, context).toHaveLength(1);
        expect(sources[0].getAttribute('src'), context).toBe(result.url);
        expect(sources[0].getAttribute('type'), context).toBe(result.type);
      }
    }
  }, 30_000);
});
