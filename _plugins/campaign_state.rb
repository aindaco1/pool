# Automatically sets campaign state based on start_date and goal_deadline.
# States: upcoming (before start_date), live (between dates), post (after goal_deadline).

require 'date'

module PoolPlatformTime
  DEFAULT_TIMEZONE = 'America/Denver'

  def self.timezone_for_site(site)
    configured = site.config.dig('platform', 'timezone').to_s.strip
    configured.empty? ? DEFAULT_TIMEZONE : configured
  end

  def self.with_timezone(timezone)
    original_tz = ENV['TZ']
    ENV['TZ'] = timezone.to_s.strip.empty? ? DEFAULT_TIMEZONE : timezone
    yield
  ensure
    ENV['TZ'] = original_tz
  end

  def self.today(site)
    with_timezone(timezone_for_site(site)) { Time.now.to_date }
  end

  def self.local_epoch(date_value, site, hour, minute, second)
    return 0 if date_value.nil? || date_value.to_s.strip.empty?

    date = Date.parse(date_value.to_s)
    with_timezone(timezone_for_site(site)) do
      Time.local(date.year, date.month, date.day, hour, minute, second).to_i
    end
  rescue ArgumentError
    0
  end
end

module PoolPlatformTimeFilters
  def pool_platform_start_epoch(input)
    PoolPlatformTime.local_epoch(input, @context.registers[:site], 0, 0, 0)
  end

  def pool_platform_deadline_epoch(input)
    PoolPlatformTime.local_epoch(input, @context.registers[:site], 23, 59, 59)
  end
end

Liquid::Template.register_filter(PoolPlatformTimeFilters)

def pool_platform_today(site)
  PoolPlatformTime.today(site)
end

def pool_apply_campaign_state(campaign, today)
  start_date = campaign.data['start_date']
  goal_deadline = campaign.data['goal_deadline']

  # Parse dates if they're strings
  start_date = Date.parse(start_date.to_s) if start_date
  goal_deadline = Date.parse(goal_deadline.to_s) if goal_deadline

  # Determine state based on dates
  if start_date && today < start_date
    campaign.data['state'] = 'upcoming'
  elsif goal_deadline && today > goal_deadline
    campaign.data['state'] = 'post'
  elsif start_date && goal_deadline && today >= start_date && today <= goal_deadline
    campaign.data['state'] = 'live'
  end
  # If dates are missing, leave state as manually set in front matter
end

Jekyll::Hooks.register :site, :post_read do |site|
  today = pool_platform_today(site)
  campaigns = site.collections['campaigns']
  next unless campaigns

  campaigns.docs.each do |campaign|
    campaign.data['published'] = false if campaign.data['preview_only'] == true
    pool_apply_campaign_state(campaign, today)
  end
end
