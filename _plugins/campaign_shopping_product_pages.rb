require 'date'

module Jekyll
  class CampaignShoppingProductPage < PageWithoutAFile
    def initialize(site, base, campaign, tier, shopping, lang:, localized_paths:, translation_key:, campaign_state:, offer_availability:)
      slug = campaign.data['slug'].to_s
      tier_id = tier['id'].to_s
      default_lang = site.config.dig('i18n', 'default_lang') || site.config['lang'] || 'en'
      dir = lang.to_s == default_lang.to_s ?
        File.join('campaigns', slug, 'rewards', tier_id) :
        File.join(lang.to_s, 'campaigns', slug, 'rewards', tier_id)

      super(site, base, dir, 'index.html')

      campaign_data = campaign.data.dup
      campaign_data['url'] = campaign.url

      self.content = '{% include campaign-shopping-product.html %}'
      self.data = {
        'layout' => 'default',
        'lang' => lang,
        'title' => "#{tier['name']} — #{campaign.data['title']}",
        'description' => tier['description'],
        'hero_image' => tier['image'],
        'campaign' => campaign_data,
        'product_tier' => tier,
        'product_shopping' => shopping,
        'product_sku' => "#{slug}-#{tier_id}",
        'product_campaign_state' => campaign_state,
        'product_offer_availability' => offer_availability,
        'shopping_product' => true,
        'last_modified_at' => campaign.data['last_modified_at'] || campaign.data['date'],
        'localized_paths' => localized_paths,
        'translation_key' => translation_key
      }
    end
  end

  class CampaignShoppingProductPageGenerator < Generator
    safe true
    priority :lowest

    def generate(site)
      default_lang = site.config.dig('i18n', 'default_lang') || site.config['lang'] || 'en'
      supported_langs = Array(site.config.dig('i18n', 'supported_langs')).map(&:to_s)
      supported_langs = [default_lang.to_s] if supported_langs.empty?
      campaigns = site.collections['campaigns']&.docs || []

      campaigns.each do |campaign|
        next unless public_campaign?(campaign)

        featured_tier = find_featured_tier(campaign)
        next unless featured_tier

        shopping = campaign.data['shopping']
        next unless shopping.is_a?(Hash) && shopping['enabled'] == true

        validate_shopping_product!(site, campaign, featured_tier, shopping)

        slug = campaign.data['slug'].to_s
        tier_id = featured_tier['id'].to_s
        translation_key = "campaign_reward_#{slug}_#{tier_id}"
        localized_paths = build_localized_paths(slug, tier_id, supported_langs, default_lang.to_s)
        campaign_state = campaign_state(site, campaign)
        offer_availability = campaign_state == 'live' ?
          'https://schema.org/PreOrder' :
          'https://schema.org/OutOfStock'

        supported_langs.each do |lang|
          target_url = localized_paths[lang]
          next if product_page_exists?(site, target_url)

          site.pages << CampaignShoppingProductPage.new(
            site,
            site.source,
            campaign,
            featured_tier,
            shopping,
            lang: lang,
            localized_paths: localized_paths,
            translation_key: translation_key,
            campaign_state: campaign_state,
            offer_availability: offer_availability
          )
        end
      end
    end

    private

    def public_campaign?(campaign)
      campaign.data['slug'] &&
        campaign.data['preview_only'] != true &&
        campaign.data['published'] != false &&
        campaign.data['test_only'] != true
    end

    def find_featured_tier(campaign)
      featured_tier_id = campaign.data['featured_tier_id'].to_s
      return nil if featured_tier_id.empty?

      Array(campaign.data['tiers']).find { |tier| tier['id'].to_s == featured_tier_id }
    end

    def validate_shopping_product!(site, campaign, tier, shopping)
      label = "#{campaign.data['slug']}/#{tier['id']}"
      errors = []
      errors << 'must be a physical reward' unless tier['category'].to_s == 'physical'
      errors << 'must have a positive price' unless tier['price'].is_a?(Numeric) && tier['price'].positive?
      errors << 'must have an image' if tier['image'].to_s.strip.empty?
      errors << 'must have a description' if tier['description'].to_s.strip.empty?
      availability_date = parse_date(shopping['availability_date'])
      errors << 'must have a valid availability_date' unless availability_date

      deadline = parse_date(campaign.data['goal_deadline'])
      if availability_date && deadline && availability_date < deadline
        errors << 'availability_date must not precede the campaign deadline'
      end

      build_date = site.time.to_date
      if availability_date && availability_date > build_date.next_year
        errors << 'availability_date must be within one year of the build date'
      end

      return if errors.empty?

      raise Errors::FatalException, "Shopping product #{label} #{errors.join('; ')}"
    end

    def campaign_state(site, campaign)
      build_date = site.time.to_date
      start_date = parse_date(campaign.data['start_date'])
      deadline = parse_date(campaign.data['goal_deadline'])
      return 'unknown' unless start_date && deadline
      return 'upcoming' if build_date < start_date
      return 'post' if build_date > deadline

      'live'
    end

    def parse_date(value)
      return value.to_date if value.respond_to?(:to_date)
      Date.iso8601(value.to_s)
    rescue Date::Error
      nil
    end

    def build_localized_paths(slug, tier_id, supported_langs, default_lang)
      supported_langs.each_with_object({}) do |lang, paths|
        base_path = "/campaigns/#{slug}/rewards/#{tier_id}/"
        paths[lang] = lang == default_lang ? base_path : "/#{lang}#{base_path}"
      end
    end

    def product_page_exists?(site, target_url)
      site.pages.any? { |page| page.url == target_url || page.dir == target_url }
    end
  end
end
