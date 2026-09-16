# Campaign video uploads — 2026-09-16

## Scope

The dashboard advertised 100 MB videos while the shared GitHub client rejected
files above its default 2,000,000-byte content limit. Base64 JSON also expanded
large browser requests and required multiple full-file copies in Worker memory.
The binary/streaming transport follows the documented
[Cloudflare request and memory limits](https://developers.cloudflare.com/workers/platform/limits/)
while retaining GitHub's
[repository-contents upload API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).

Hero, Content, Diary, and media-library video replacements use binary requests
with a 100,000,000-byte ceiling. The Worker authenticates campaign scope and
CSRF before reading the stream, validates its exact length, and streams GitHub's
base64 JSON encoding. Repository assets remain the source of truth. No new
storage service, KV catalog, credentials, or shared-submodule revision is added.

The small legacy JSON video path remains available within a 12 MiB request
limit; its GitHub write uses the video-specific content bound. Text, image, and
audio GitHub bounds remain unchanged. Deploy the Worker before the updated
dashboard, and reload old dashboard tabs for full-size uploads.

## Validation

- Real workerd runtime with a simulated GitHub receiver: an exact
  100,000,000-byte file passes, with the entire encoded request verified by hash.
- Runtime regressions cover base64 chunk boundaries, one byte over the limit,
  empty files, truncated/overlong bodies, provider rejection, and redirects.
- Worker API regressions cover binary uploads above the old 2 MB ceiling,
  legacy JSON compatibility, exact byte reporting, campaign permissions, CSRF,
  type/size/metadata validation, private caching, and optimization dispatch.
- Dashboard browser regression checks that the hero uploader sends the file's
  binary bytes with its size and campaign metadata.
- Full unit suite: 977 passed, one existing skip; security suite: 127 passed.
- Pre-merge secret audit, template drift, syntax, focused regressions, release
  command sanity, and Jekyll build/artifact checks passed.
- Both production and full dependency audits passed for the root and Worker
  packages with zero vulnerabilities.
- The full pre-merge gate stopped at the Podman resource check. The existing
  `record-release-gate` VM occupied the Apple virtualization provider, which
  permits only one active VM; `podman-machine-default` could not start. The
  other VM was left running. Podman Worker/mutable-pledge smoke phases and the
  complete browser suite were not reached by this gate.
- Host Chromium dashboard suite: all 20 tests passed against the newly built
  site, including binary hero-video upload, staged Content/Diary media,
  responsive layouts, and Spanish administration.

## Ethical risk review

Creators can upload larger source videos. The relevant risks are resource
exhaustion, accidental replacement of live media, and confusion about whether
an upload succeeded. Streaming, byte limits, a ten-minute provider deadline,
bounded provider responses, campaign authorization, and no automatic write
retries limit resource use and ambiguous writes. A valid complete body and
GitHub content/commit SHAs are required before success or optimization dispatch.
Campaign replacements retain their new-path behavior; project Save/Publish
boundaries remain intact. Existing English/Spanish status strings and keyboard
file controls remain in use. No new personal data or messaging is introduced.

## Provider acceptance

The runtime receiver is simulated. These checks do not prove live Cloudflare
edge ingestion, GitHub persistence, Pages propagation, optimization, or playback
of a creator's actual video. Production deployment and a real near-limit video
upload remain separate acceptance steps.
