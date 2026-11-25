# Render the real campaign layout for cart tests without publishing fixture campaigns.
Jekyll::Hooks.register :site, :post_read do |site|
  next if Jekyll.env == 'production' || !site.config['show_test_campaigns']

  %w[cart-single cart-other].each do |slug|
    page = Jekyll::Page.new(site, site.source, 'tests/fixtures', 'cart-campaign.html')
    page.data.merge!('slug' => slug, 'title' => slug, 'permalink' => "/campaigns/#{slug}/",
                     'single_tier_only' => slug == 'cart-single')
    site.pages << page
  end
end
