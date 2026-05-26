# Automatically sets campaign state based on start_date and goal_deadline
# States: upcoming (before start_date), live (between dates), post (after goal_deadline)
# Uses America/Denver so campaigns transition at midnight Mountain Time,
# including daylight saving time.

require 'date'

def pool_mountain_today
  original_tz = ENV['TZ']
  ENV['TZ'] = 'America/Denver'
  Time.now.to_date
ensure
  ENV['TZ'] = original_tz
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
  today = pool_mountain_today
  campaigns = site.collections['campaigns']
  next unless campaigns

  campaigns.docs.each do |campaign|
    pool_apply_campaign_state(campaign, today)
  end
end
