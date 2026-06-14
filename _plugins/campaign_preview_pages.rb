module Jekyll
  class CampaignPreviewPage < PageWithoutAFile
    def initialize(site, base, campaign, lang:, localized_paths:, translation_key:)
      slug = campaign.data['slug']
      dir = lang.to_s == default_lang(site).to_s ? File.join('campaigns', slug.to_s, 'preview') : File.join(lang.to_s, 'campaigns', slug.to_s, 'preview')
      super(site, base, dir, 'index.html')

      self.content = ''
      self.data = {
        'layout' => 'campaign-preview',
        'lang' => lang,
        'campaign_slug' => slug,
        'indexable' => false,
        'localized_paths' => localized_paths,
        'translation_key' => translation_key
      }
    end

    private

    def default_lang(site)
      site.config.dig('i18n', 'default_lang') || site.config['lang'] || 'en'
    end
  end

  class CampaignPreviewPageGenerator < Generator
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

        translation_key = "campaign_preview_#{slug}"
        localized_paths = build_localized_paths(slug, supported_langs, default_lang.to_s)

        supported_langs.each do |lang|
          target_url = localized_paths[lang]
          next if preview_page_exists?(site, target_url)

          site.pages << CampaignPreviewPage.new(
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
        base_path = "/campaigns/#{slug}/preview/"
        paths[lang] = lang == default_lang ? base_path : "/#{lang}#{base_path}"
      end
    end

    def preview_page_exists?(site, target_url)
      site.pages.any? { |page| page.url == target_url || page.dir == target_url }
    end
  end
end
