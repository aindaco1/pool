# Protected preview inline video — 2026-10-05

## Behavior

YouTube Play replaces the thumbnail visually in its original campaign position,
matching the published project's inline playback. There is no modal, dimming,
close button, or focus trap. Hero, content, and diary videos keep their original
size and remain aligned as the campaign scrolls, resizes, or changes layout.
Each player starts only after Play; layout updates do not restart playback.

This supersedes the dialog interaction recorded in
[the initial video fix](2026-10-05-protected-preview-video.md).

## Security and implementation

The existing external preview runtime measures the clicked media slot inside
the opaque campaign iframe. A shell-owned player occupies that exact rectangle
in a layer clipped to the campaign viewport. This gives the provider its own
origin/storage without giving campaign HTML access to the parent or removing
any sandbox restriction. See the [iframe sandbox reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox).

The parent verifies the current source frame, opaque origin, request-specific
slot allowlist, action, and finite bounded dimensions. It constructs the fixed
YouTube privacy-enhanced URL from the authorized payload, never from a message.
Access reload removes every player and clears authorized slots. Tokens remain
stripped from the address bar and absent from the origin-only media referrer.
The existing strict CSP and campaign sandbox are unchanged.

The change is compatible with the current Worker response; deployment updates
Pages only. It does not modify campaign drafts, reviewer access, pledge state,
email, or dashboard editing behavior.

## Verification

- Focused preview and generated-route unit tests: 3 passed.
- Real-CSP Chromium regressions: English desktop and Spanish mobile passed.
  They check thumbnail fallback, keyboard activation, exact inline bounds,
  continued project interaction, inner/outer scrolling, resizing, multiple
  players, origin-only referrers, provider storage, rejected messages, and
  access-loss teardown without new tabs, script errors, or CSP violations.
- Real Tubers YouTube playback observed inside the local built shell with a
  synthetic campaign wrapper. Video and changing captions remained visible in
  the original media area. Screenshot retained outside the checkout at
  `/Users/aindaco1/.Trash/pool-preview-inline-20261005/local-playback.jpg`.

## Release dependencies

The release audit reported development-only findings in `smol-toml` 1.7.1
(GHSA-r4xh-jqrq-34v2) and `source-map-js` 1.2.1 (GHSA-68fv-2mgg-jv7q).
The direct TOML tooling pin is 1.9.0; the existing transitive source-map dependency
resolves to 1.2.2. Root and Worker production/full audits pass with zero findings.
No Worker runtime dependency changed.

## Ethical review

Loading remains an explicit Play action. The video stays inside the project
layout with other content usable. No new analytics permission, reviewer-data
sharing, access grant, or messaging is introduced.
