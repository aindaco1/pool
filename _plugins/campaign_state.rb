# Automatically sets campaign state based on start_date and goal_deadline
# States: upcoming (before start_date), live (between dates), post (after goal_deadline)
# Uses Mountain Time (MST = UTC-7) so campaigns don't end early on UTC-based CI servers

Jekyll::Hooks.register :campaigns, :pre_render do |campaign|
  # Use Mountain Standard Time (UTC-7) for date comparison
  # This ensures the campaign stays "live" until the end of the deadline day in MT,
  # even when the build runs on a UTC-based server (e.g., GitHub Actions)
  utc_now = Time.now.utc
  mt_offset = -7 * 3600  # MST = UTC-7 (conservative; covers both MST and MDT)
  today = (utc_now + mt_offset).to_date

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
