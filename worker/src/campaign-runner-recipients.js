import { isValidEmail } from './validation.js';

function normalizeEmails(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim().toLowerCase())
    .filter(isValidEmail))];
}

export function assignedCampaignRunnerUsers(campaign = {}, users = []) {
  const slug = String(campaign.slug || '').trim();
  if (!slug) return [];
  const seen = new Set();
  return users.flatMap(user => {
    const email = String(user?.email || '').trim().toLowerCase();
    if (user?.role !== 'campaign_user' || !user.campaignSlugs?.includes(slug) ||
        !isValidEmail(email) || seen.has(email)) return [];
    seen.add(email);
    return [{ name: String(user.name || '').trim(), email }];
  });
}

export function campaignRunnerReportRecipients(campaign = {}, users = []) {
  const excluded = new Set(normalizeEmails(campaign.runner_report_excluded_emails));
  return normalizeEmails([
    ...(Array.isArray(campaign.runner_report_emails) ? campaign.runner_report_emails : []),
    ...assignedCampaignRunnerUsers(campaign, users).map(user => user.email)
  ]).filter(email => !excluded.has(email));
}
