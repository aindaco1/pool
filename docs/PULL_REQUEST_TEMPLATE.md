# Pull Request

## Purpose
<!-- What problem does this PR solve? -->

## Changes
<!-- List key changes with file paths when helpful -->
- 

## Screenshots / Demos
<!-- Add images or GIFs for UI changes. -->
<!-- For admin dashboard UI changes, include desktop, tablet, and mobile screenshots. Include `/es/admin/` when strings or responsive menus changed. -->

## Test Plan
- [ ] `npm run test:premerge`
- [ ] `npm run podman:doctor` passes when validating Podman-backed local flows
- [ ] Same pre-merge gate run against `main` in a clean worktree when Worker or checkout logic changed
- [ ] Manual smoke checklist completed for changed checkout / Worker flows (staging when available, otherwise documented local smoke fallback)
- [ ] Local Jekyll build ok
- [ ] `./scripts/test-e2e.sh --podman` passes when browser checkout behavior changed
- [ ] `npx playwright test tests/e2e/admin-dashboard.spec.ts --project=chromium` passes when admin dashboard UI, i18n, accessibility, responsive behavior, or admin Worker contracts changed
- [ ] `node --check assets/js/admin-dashboard.js` passes when dashboard JavaScript changed
- [ ] First-party cart opens, no console errors
- [ ] Worker `/checkout-intent/start` returns the expected on-site custom-session bootstrap or hosted fallback response (test mode)
- [ ] Pledge persistence stores tiers, support items, custom amount, and live totals refresh correctly
- [ ] Update Card flow still succeeds for active and `payment_failed` pledges when touched
- [ ] Countdown timers show correct values on page load (no "00 00 00 00" flash)
- [ ] Cron `workflow_dispatch` charges test pledges off‑session
- [ ] Docs updated (if behavior or setup changed)

## Security / Secrets
- [ ] No secrets committed
- [ ] Uses repo/Worker secrets only
- [ ] Admin dashboard changes do not expose/edit secret values; **Secrets & credentials** remains status-only
- [ ] Admin mutations preserve the intended storage path: GitHub-backed publish, KV-only Users save, KV-only saved referral codes, or read-only browse/export

## Ethical Risk Review
- [ ] Reviewed `docs/ETHICAL_RISK.md` if this changes money, supporter data, messaging, analytics, automation, public sharing, or admin power
- [ ] No new hidden data collection, tracking, public indexing, or private/tokenized prefetch behavior
- [ ] Consent, opt-out, suppression, dry-run, or recourse behavior is preserved where the change touches email, reminders, previews, marketing, or pledge management
- [ ] Abuse or misuse cases were considered for public pages, embeds, QR/referral links, Blast, admin roles, checkout, and reports when touched
- [ ] User-facing claims about campaign state, scarcity, tax, shipping, fees, tips, or totals still match Worker-canonical truth

## Backward Compatibility
- [ ] No breaking content model changes
- [ ] If schema changes, updated `docs/DEV_NOTES.md` and sample campaigns
- [ ] Existing campaign/add-on/tier/variant IDs are preserved unless the migration intentionally changes them

## Rollback Plan
<!-- How to revert safely if needed -->
