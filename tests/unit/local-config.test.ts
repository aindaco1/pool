import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

describe('local config overrides', () => {
  it('blanks public Turnstile keys for local-only widget suppression when the ignored local config exists', () => {
    const localConfigPath = path.join(repoRoot, '_config.local.yml');
    if (!fs.existsSync(localConfigPath)) return;

    const localConfig = fs.readFileSync(localConfigPath, 'utf8');

    expect(localConfig).toMatch(/admin:\s*\n\s+turnstile_site_key:\s*""/);
    expect(localConfig).toMatch(/launch_reminders:\s*\n\s+turnstile_site_key:\s*""/);
  });

  it('renders launch reminder Turnstile only when a public key is present', () => {
    const launchReminderForm = readRepoFile('_includes', 'launch-reminder-form.html');

    expect(launchReminderForm).toContain('{% if launch_reminder_turnstile_site_key != "" %} data-turnstile-site-key=');
    expect(launchReminderForm).toContain('{% if launch_reminder_turnstile_site_key != "" %}');
    expect(launchReminderForm).toContain('data-launch-reminder-turnstile');
  });
});
