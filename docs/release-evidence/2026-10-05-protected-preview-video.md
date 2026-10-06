# Protected preview YouTube playback — 2026-10-05

## Scope and diagnosis

The reported Tubers preview was checked against the current protected Worker
response without publishing, changing reviewer access, or sending invitations.
Its YouTube facade rendered a thumbnail and an external watch link. The full
preview had no handler for `data-youtube-poster-fallback` and no embedded Play
behavior. For the actual video, `maxres1.jpg` returned HTTP 404 while `hq1.jpg`
returned HTTP 200. A decodable thumbnail placeholder can fire `load` despite
the HTTP error, so handling only `error` is insufficient.

The reported blocked inline script and Cloudflare beacon are separate from the
facade behavior. The fix does not allow inline scripts or the analytics beacon.

## Change and boundaries

The protected shell adds its existing external preview runtime to the returned
`srcdoc` document. It applies thumbnail fallback on errors and small YouTube
placeholder images. Play requests a shell-owned YouTube player dialog through
`postMessage`; closing it removes the player and returns focus to the initiating
Play control. English and Spanish labels use the existing locale catalog.

The shell checks both the message source and opaque origin, accepts only video
IDs extracted from the current authorized payload, and constructs the embed URL
on the fixed `www.youtube-nocookie.com` host. Access reload clears that set and
closes playback. Campaign HTML retains its original sandbox without
`allow-same-origin`. The strict CSP remains unchanged. The player receives only
the site origin as its referrer; reviewer tokens stay in the existing tab-scoped
storage flow.

The separate player document avoids inheriting the campaign sandbox's origin
restrictions. See the [iframe sandbox reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox)
and [YouTube's embedded-player identity requirements](https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity).

This is a site-only change compatible with the current Worker payload. It does
not alter campaign content, saved drafts, checkout, email, access grants, public
campaign rendering, or the dashboard editor's external video links.

## Verification

- Focused preview, preview-page generation, and dashboard unit tests: 118 passed.
- Real-CSP Chromium preview regression: English desktop and Spanish mobile
  passed. Covers thumbnail fallback, no player before Play, keyboard activation,
  allowed-host URL construction, origin-only referrers, independent player
  storage, close/Escape/focus restoration, viewport fit, rejected messages,
  access loss, and no new browser tabs or CSP/script errors.
- Actual provider check: the Tubers video played in the local built protected
  shell, using a synthetic campaign wrapper containing the real video ID.
  Observed moving video frames; Close removed the player and restored Play
  focus. This establishes local provider playback, not a production deployment.
- Full unit suite: 111 files passed, 1,076 tests passed, one existing skip.
- Full `npm run test:premerge` gate: passed, including build/SEO/performance
  artifact checks, 127 security tests, Worker and mutable-pledge smoke checks,
  and 145 browser tests with three existing skips. The two new protected-preview
  browser regressions are included. Logs: `/tmp/pool-premerge-logs.LWFIFT/`.
- Root and Worker dependency audits, production and full scopes: all four passed
  with zero findings.
- JavaScript syntax, diff whitespace, and English/Spanish catalog completeness:
  passed.

Deployment and post-deploy checks have not been performed. Existing untracked CloudDocs
duplicate media and documentation files were left untouched.

## Ethical review

Playback remains an explicit user action and loads the remote player only after
Play. The authenticated payload stays private; no token, reviewer address, or
campaign draft is added to provider requests or this evidence. Source/origin
and payload checks prevent unrelated frames from selecting arbitrary embed
destinations. No access expansion or tracking exception is required.
