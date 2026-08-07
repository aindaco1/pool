# Product Video Workflow

Pool has a repeatable, local-only product walkthrough pipeline built on the pinned `@dustwave/product-video-core` package. It captures the real public interface and renders transparent video suitable for a marketing-site hero without entering payment details or depending on live Stripe or Worker state.

The default flow performs this sequence:

1. open the locally rendered homepage
2. open the `smoke-editable` test campaign
3. add its standard tier
4. add its campaign poster add-on
5. advance to the checkout preview

## Ownership boundary

Platform owns the framework-neutral mechanics:

- bounded declarative flow validation
- transparent Playwright stage and synthetic cursor
- guarded generated-output paths
- shell-free FFmpeg argument construction and decoded alpha-plane verification
- ProRes, VP9 WebM alpha, and HEVC alpha output evidence

Pool owns:

- Jekyll preview startup and `_config.test.yml`
- the `smoke-editable` fixture and selectors
- `assets/capture-presentation.css`
- flow timing and editorial choices
- output names and the optional marketing-repository copy
- generated video review, publication, and rollback

The capture stylesheet is injected only into the local Playwright frame. It is emitted as a static asset so the strict page CSP can load it, but it is not linked from production templates and adds no production request.

## Commands

Capture a quick frame sequence without running FFmpeg:

```bash
npm run video:demo:capture
```

Render the complete default output set:

```bash
npm run video:demo:render
```

Run the short real-UI capture used to verify the fixture and selectors:

```bash
npm run test:product-video
```

Use an already-running preview or select portable formats:

```bash
./scripts/render-product-demo.sh \
  --base-url http://127.0.0.1:4010 \
  --format prores \
  --format webm
```

To copy the browser outputs into an existing checked-out marketing repository:

```bash
POOL_MARKETING_REPO=/path/to/pool-marketing-docs npm run video:demo:render
```

The destination must already be a Git checkout. The command creates only its `assets/videos` directory and copies:

- `product-demo.webm` to `hero-demo.webm`
- `product-demo.mp4` to `hero-demo.mp4`

## Clean-checkout behavior

When the default `http://127.0.0.1:4010` preview is unavailable, the Pool wrapper builds a unique generated site using:

```text
_config.yml,_config.test.yml
```

That tracked test configuration exposes `smoke-editable` without relying on ignored machine-local configuration. A custom unavailable origin fails explicitly rather than causing the wrapper to bind an arbitrary host or port.

## Output contract

Each run receives a unique process-qualified directory:

```text
tmp/product-video/<timestamp>-<pid>/
```

It contains the generated site when Pool starts the preview, the PNG frame sequence, capture and render manifests, and—unless `--capture-only` was selected—the following outputs:

- `output/product-demo-master.mov` — ProRes 4444 alpha master
- `output/product-demo.webm` — VP9 alpha for Chromium and Firefox
- `output/product-demo.mp4` — HEVC alpha for Safari and Apple platforms

Existing run directories are never overwritten or recursively deleted. The entire `tmp/` tree remains ignored. Jekyll also excludes that tree, and the pre-merge artifact gate fails if a generated `_site/tmp` path appears, preventing local capture artifacts from entering a Pages deployment.

## Host requirements

- Node and the repository-pinned `@playwright/test`
- Ruby/Bundler and the checked-in Jekyll dependencies when Pool must start a preview
- Python 3 for the loopback static server
- FFmpeg and FFprobe for rendering
- an Apple FFmpeg build exposing `hevc_videotoolbox` for the HEVC alpha output

On hosts without VideoToolbox, select only ProRes and WebM. The capture-only command needs neither FFmpeg nor FFprobe.

## Security and performance guardrails

- Capture defaults to loopback. Platform requires an explicit flag for remote origins; Pool does not enable that flag.
- Flow navigation is same-origin and the flow language has no arbitrary JavaScript action.
- Frame and render directories must remain below `tmp/product-video`.
- Existing output fails closed, so a mistyped path cannot trigger recursive deletion.
- Encoder commands use argument arrays without a shell.
- Capture records effective frame rate and fails below the configured floor instead of silently producing a sped-up render.
- No customer data, live checkout, credential, generated video, or marketing destination is committed.

## Updating the flow

The production-length consumer policy lives in `video/product-demo.smoke-editable.json`. Keep the short contract in `tests/fixtures/product-video.smoke.json` aligned when changing selectors. Existing campaign checkout tests cover the same tier, cart, add-on, and checkout-preview controls; `tests/unit/product-video-workflow.test.ts` additionally locks the Platform boundary and capture-only production posture.
