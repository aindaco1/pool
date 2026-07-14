import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('campaign Shopping product generator', () => {
  it('renders localized featured-tier products and fails closed on incomplete dates', () => {
    const script = String.raw`
require 'jekyll'
require 'json'
require 'tmpdir'

root = Dir.pwd
Dir.mktmpdir do |destination|
  site = Jekyll::Site.new(Jekyll.configuration({
    'source' => root,
    'destination' => destination,
    'quiet' => true
  }))
  site.read
  campaign = site.collections['campaigns'].docs.find { |doc| doc.data['slug'] == 'their-love' }
  abort 'Their Love fixture missing' unless campaign

  campaign.data['shopping'] = {
    'enabled' => true,
    'availability_date' => '2027-01-31'
  }
  Jekyll::LocalizedCampaignPageGenerator.new.generate(site)
  Jekyll::CampaignShoppingProductPageGenerator.new.generate(site)
  site.render

  pages = site.pages.select { |page| page.data['shopping_product'] == true }
  expected_urls = [
    '/campaigns/their-love/rewards/ill-never-forget-you/',
    '/es/campaigns/their-love/rewards/ill-never-forget-you/'
  ]
  abort "unexpected product URLs: #{pages.map(&:url).inspect}" unless pages.map(&:url).sort == expected_urls.sort
  abort 'product page did not reuse featured tier SKU' unless pages.all? { |page| page.data['product_sku'] == 'their-love-ill-never-forget-you' }
  abort 'live product did not use preorder availability' unless pages.all? { |page| page.data['product_offer_availability'] == 'https://schema.org/PreOrder' }
  abort 'rendered product facts missing' unless pages.all? { |page| page.output.include?('2027') && page.output.include?('Product') && page.output.include?('returns-refunds') }
  pages.each do |page|
    payload = page.output.match(%r{<script type="application/ld\+json">([\s\S]*?)</script>})&.captures&.first
    abort "#{page.url} JSON-LD missing" unless payload
    graph = JSON.parse(payload).fetch('@graph')
    organization = graph.find { |node| node['@type'] == 'Organization' }
    product = graph.find { |node| node['@type'] == 'Product' }
    abort "#{page.url} language metadata drifted" unless organization.dig('contactPoint', 'availableLanguage') == ['en', 'es']
    abort "#{page.url} Product schema missing" unless product
    abort "#{page.url} Offer schema drifted" unless product.dig('offers', 'availability') == 'https://schema.org/PreOrder'
    abort "#{page.url} return policy reference missing" unless product.dig('offers', 'hasMerchantReturnPolicy', '@id')&.end_with?('/terms/#returns-refunds')
  end

  campaign.data['shopping']['availability_date'] = ''
  begin
    Jekyll::CampaignShoppingProductPageGenerator.new.generate(site)
    abort 'incomplete Shopping product did not fail closed'
  rescue Jekyll::Errors::FatalException => error
    abort 'unexpected validation error' unless error.message.include?('must have a valid availability_date')
  end

  puts 'localized Shopping product generation passed'
end
`;

    const output = execFileSync('bundle', ['exec', 'ruby', '-e', script], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, JEKYLL_ENV: 'test' }
    });

    expect(output).toContain('localized Shopping product generation passed');
  }, 30_000);
});
