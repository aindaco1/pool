import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('campaign preview page generation', () => {
  it('builds localized shells for unpublished sources without publishing their content', () => {
    const script = String.raw`
require 'jekyll'
require 'fileutils'
require 'tmpdir'

root = Dir.pwd
Dir.mktmpdir('pool-preview-source') do |source|
  %w(_plugins _layouts _includes _data).each do |directory|
    FileUtils.cp_r(File.join(root, directory), source)
  end
  %w(index.html sitemap.xml sitemap.txt robots.txt api/campaigns.json api/add-ons.json community/index.html embed/campaign/index.html).each do |relative|
    target = File.join(source, relative)
    FileUtils.mkdir_p(File.dirname(target))
    FileUtils.cp(File.join(root, relative), target)
  end
  FileUtils.mkdir_p(File.join(source, '_campaigns'))
  fixtures = {
    'public' => '',
    'draft' => 'published: false',
    'unpublished' => "published: false\npreview_only: true\npreview_enabled: false",
    'preview-published' => "published: false\npreview_only: true\npreview_enabled: true",
    'hidden' => 'preview_only: true',
    'excluded' => 'published: false'
  }
  fixtures.each do |slug, flags|
    File.write(File.join(source, '_campaigns', "source-#{slug}.md"), <<~YAML)
      ---
      layout: campaign
      title: "CONFIDENTIAL_TITLE_#{slug}"
      slug: #{slug}
      #{flags}
      state: upcoming
      goal_amount: 100
      start_date: 2099-01-01
      goal_deadline: 2099-02-01
      tiers: []
      ---
      CONFIDENTIAL_BODY_#{slug}
    YAML
  end
  File.write(File.join(source, '_campaigns', 'readme.txt'), 'Not a campaign')
  FileUtils.mkdir_p(File.join(source, '_campaign_drafts'))
  File.write(File.join(source, '_campaign_drafts', 'public.md'), "---\nlayout: campaign\nslug: public\ntitle: UNPUBLISHED_REVISION_SENTINEL\npublished: true\n---\nDraft story\n")

  Dir.mktmpdir('pool-preview-output') do |destination|
    site = Jekyll::Site.new(Jekyll.configuration({
      'config' => File.join(root, '_config.yml'),
      'source' => source,
      'destination' => destination,
      'exclude' => ['_campaigns/source-excluded.md'],
      'quiet' => true
    }))
    abort 'unpublished output must remain disabled' if site.unpublished
    site.read
    collection_slugs = site.collections['campaigns'].docs.map { |doc| doc.data['slug'] }
    abort 'fixture did not exercise Jekyll unpublished filtering' if collection_slugs.include?('unpublished')
    site.generate
    Jekyll::CampaignPreviewPageGenerator.new.generate(site)
    abort 'preview generator changed the public collection' unless site.collections['campaigns'].docs.map { |doc| doc.data['slug'] } == collection_slugs

    expected_urls = (fixtures.keys - ['excluded']).flat_map do |slug|
      ["/campaigns/#{slug}/preview/", "/es/campaigns/#{slug}/preview/"]
    end
    previews = site.pages.select { |page| page.data['layout'] == 'campaign-preview' }
    abort "preview URLs missing or duplicated: #{previews.map(&:url).inspect}" unless previews.map(&:url).sort == expected_urls.sort
    site.render
    site.write

    expected_urls.each do |url|
      html = File.read(File.join(destination, url, 'index.html'))
      abort "#{url}: missing protected shell" unless html.include?('data-campaign-preview-slug=')
      abort "#{url}: missing noindex" unless html.include?('noindex,nofollow,noarchive')
      abort "#{url}: draft content leaked" if html.include?('CONFIDENTIAL_')
      abort "#{url}: social metadata leaked" if html.include?('property="og:') || html.include?('application/ld+json')
      abort "#{url}: wrong locale" unless html.include?(url.start_with?('/es/') ? '<html lang="es">' : '<html lang="en">')
    end
    (fixtures.keys - ['public']).each do |slug|
      %W(campaigns/#{slug}/index.html es/campaigns/#{slug}/index.html community/#{slug}/index.html es/community/#{slug}/index.html).each do |relative|
        abort "private route published: #{relative}" if File.exist?(File.join(destination, relative))
      end
      %w(index.html api/campaigns.json api/add-ons.json community/index.html sitemap.xml sitemap.txt).each do |relative|
        output = File.read(File.join(destination, relative))
        abort "#{relative}: private campaign exposed" if output.include?("CONFIDENTIAL_TITLE_#{slug}") || output.include?("/campaigns/#{slug}/")
      end
    end
    abort 'public campaign route lost' unless File.exist?(File.join(destination, 'campaigns/public/index.html'))
    abort 'localized public campaign route lost' unless File.exist?(File.join(destination, 'es/campaigns/public/index.html'))
    Dir.glob(File.join(destination, '**', '*')).select { |file| File.file?(file) }.each do |file|
      abort "working copy leaked: #{file}" if File.read(file).include?('UNPUBLISHED_REVISION_SENTINEL')
    end
    puts 'unpublished preview shells and public privacy boundaries passed'
  end
end
`;

    const output = execFileSync('bundle', ['exec', 'ruby', '-e', script], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, JEKYLL_ENV: 'test', SKIP_TESTS: '1' }
    });

    expect(output).toContain('unpublished preview shells and public privacy boundaries passed');
  }, 30_000);
});
