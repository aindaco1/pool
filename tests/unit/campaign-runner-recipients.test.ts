import { describe, expect, it } from 'vitest';
import { assignedCampaignRunnerUsers, campaignRunnerReportRecipients } from '../../worker/src/campaign-runner-recipients.js';

const users = [
  { name: 'Runner', email: 'RUNNER@example.com', role: 'campaign_user', campaignSlugs: ['film'] },
  { email: 'other@example.com', role: 'campaign_user', campaignSlugs: ['other-film'] },
  { email: 'admin@example.com', role: 'super_admin', campaignSlugs: [] }
];

describe('campaign runner recipients', () => {
  it('defaults only explicitly assigned campaign users to reports', () => {
    expect(campaignRunnerReportRecipients({ slug: 'film', runner_report_emails: [] }, users)).toEqual(['runner@example.com']);
    expect(assignedCampaignRunnerUsers({ slug: 'film' }, users)).toEqual([{ name: 'Runner', email: 'runner@example.com' }]);
    expect(campaignRunnerReportRecipients({ slug: 'unassigned' }, users)).toEqual([]);
  });

  it('deduplicates assigned and additional recipients and rejects invalid addresses', () => {
    expect(campaignRunnerReportRecipients({ slug: 'film', runner_report_emails: [' Runner@example.com ', 'extra@example.com', 'extra@example.com', 'invalid'] }, users)).toEqual(['runner@example.com', 'extra@example.com']);
  });

  it('applies saved opt-outs even when an assigned address was explicitly configured', () => {
    expect(campaignRunnerReportRecipients({ slug: 'film', runner_report_emails: ['runner@example.com', 'extra@example.com'], runner_report_excluded_emails: [' RUNNER@example.com '] }, users)).toEqual(['extra@example.com']);
  });

  it('reflects reassignment without persisting inferred recipients in the campaign', () => {
    const campaign = { slug: 'film', runner_report_excluded_emails: ['runner@example.com'] };
    const reassigned = [{ email: 'new@example.com', role: 'campaign_user', campaignSlugs: ['film'] }];
    expect(campaignRunnerReportRecipients(campaign, reassigned)).toEqual(['new@example.com']);
    expect(campaignRunnerReportRecipients(campaign, users)).toEqual([]);
    expect(campaignRunnerReportRecipients({ ...campaign, runner_report_excluded_emails: [] }, users)).toEqual(['runner@example.com']);
  });
});
