module Jekyll
  class LocalizedCampaignPage < PageWithoutAFile
    def initialize(site, base, campaign, lang:, localized_paths:, translation_key:)
      slug = campaign.data['slug']
      super(site, base, File.join(lang.to_s, 'campaigns', slug.to_s), 'index.html')

      self.content = campaign.content
      self.data = campaign.data.dup
      self.data['layout'] = campaign.data['layout'] || 'campaign'
      self.data['lang'] = lang
      self.data['localized_paths'] = localized_paths
      self.data['translation_key'] = translation_key
    end
  end

  class LocalizedCampaignPageGenerator < Generator
    safe true
    priority :low

    def generate(site)
      default_lang = site.config.dig('i18n', 'default_lang') || site.config['lang'] || 'en'
      supported_langs = Array(site.config.dig('i18n', 'supported_langs')).map(&:to_s)
      supported_langs = [default_lang.to_s] if supported_langs.empty?
      campaigns = site.collections['campaigns']&.docs || []

      campaigns.each do |campaign|
        slug = campaign.data['slug']
        next unless slug

        translation_key = "campaign_#{slug}"
        localized_paths = build_localized_paths(slug, supported_langs, default_lang.to_s)

        campaign.data['lang'] ||= default_lang
        campaign.data['localized_paths'] = localized_paths
        campaign.data['translation_key'] = translation_key

        supported_langs.each do |lang|
          next if lang == default_lang.to_s
          next if localized_campaign_page_exists?(site, localized_paths[lang])

          site.pages << LocalizedCampaignPage.new(
            site,
            site.source,
            campaign,
            lang: lang,
            localized_paths: localized_paths,
            translation_key: translation_key
          )
        end
      end
    end

    private

    def build_localized_paths(slug, supported_langs, default_lang)
      supported_langs.each_with_object({}) do |lang, paths|
        base_path = "/campaigns/#{slug}/"
        paths[lang] = lang == default_lang ? base_path : "/#{lang}#{base_path}"
      end
    end

    def localized_campaign_page_exists?(site, target_url)
      site.pages.any? { |page| page.url == target_url || page.dir == target_url }
    end
  end
end
