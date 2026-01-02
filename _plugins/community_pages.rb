module Jekyll
  class CommunityPage < Page
    def initialize(site, base, campaign)
      @site = site
      @base = base
      @dir = "community/#{campaign.data['slug']}"
      @name = 'index.html'

      self.process(@name)
      self.read_yaml(File.join(base, '_layouts'), 'community.html')
      self.data['layout'] = 'community'
      self.data['campaign_slug'] = campaign.data['slug']
      self.data['title'] = "Community · #{campaign.data['title']}"
    end
  end

  class CommunityPageGenerator < Generator
    safe true
    priority :low

    def generate(site)
      campaigns = site.collections['campaigns']&.docs || []
      
      campaigns.each do |campaign|
        slug = campaign.data['slug']
        next unless slug
        
        # Check if a manual community page already exists
        existing = site.pages.find { |p| p.dir == "/community/#{slug}/" || p.url == "/community/#{slug}/" }
        next if existing
        
        site.pages << CommunityPage.new(site, site.source, campaign)
      end
    end
  end
end
