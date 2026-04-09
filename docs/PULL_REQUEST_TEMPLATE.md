# Pull Request

## Purpose
<!-- What problem does this PR solve? -->

## Changes
<!-- List key changes with file paths when helpful -->
- 

## Screenshots / Demos
<!-- Add images or GIFs for UI changes. -->

## Test Plan
- [ ] `npm run test:premerge`
- [ ] `npm run podman:doctor` passes when validating Podman-backed local flows
- [ ] Same pre-merge gate run against `main` in a clean worktree when Worker or checkout logic changed
- [ ] Manual smoke checklist completed for changed checkout / Worker flows (staging when available, otherwise documented local smoke fallback)
- [ ] Local Jekyll build ok
- [ ] `./scripts/test-e2e.sh --podman` passes when browser checkout behavior changed
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

## Backward Compatibility
- [ ] No breaking content model changes
- [ ] If schema changes, updated `docs/DEV_NOTES.md` and sample campaigns

## Rollback Plan
<!-- How to revert safely if needed -->
