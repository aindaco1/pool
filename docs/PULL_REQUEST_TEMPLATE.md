# Pull Request

## Purpose
<!-- What problem does this PR solve? -->

## Changes
<!-- List key changes with file paths when helpful -->
- 

## Screenshots / Demos
<!-- Add images or GIFs for UI changes. -->

## Test Plan
- [ ] Local Jekyll build ok
- [ ] Snipcart cart opens, no console errors
- [ ] Worker `/start` returns Stripe Checkout URL (test mode)
- [ ] Webhook stores pledge with tiers, support items, custom amount
- [ ] Live stats update correctly (`/stats/:slug`)
- [ ] Countdown timers show correct values on page load (no "00 00 00 00" flash)
- [ ] Cron `workflow_dispatch` charges test pledges off‑session
- [ ] Docs updated (if behavior or setup changed)

## Security / Secrets
- [ ] No secrets committed
- [ ] Uses repo/Worker secrets only

## Backward Compatibility
- [ ] No breaking content model changes
- [ ] If schema changes, updated `docs/DEV_NOTES.md` and sample campaigns

## Rollback Plan
<!-- How to revert safely if needed -->
