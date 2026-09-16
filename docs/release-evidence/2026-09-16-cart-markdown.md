# Cart Markdown rendering — 2026-09-16

## Cause and ownership

Pool's cart escaped descriptions directly, exposing Markdown markers even
though campaign cards rendered the same text. Its add buttons also stripped
the permitted inline HTML subset, losing underline before cart storage.

The pinned Platform Admin Shell codec already handles the nested emphasis in
the reported descriptions. This release connects Pool's lazy cart loader and
item renderer to that existing implementation with links disabled. It adds no
Markdown parser or Platform release and changes no consumer dependency pin.
Description attributes remain escaped, and unsupported HTML remains inert.
Existing stored descriptions render when the cart is reopened.

## Regression coverage

- Both new-item and saved-cart tests reproduce the reported nested-bold/italic
  descriptions. They fail before the integration change and pass afterward.
- The same tests preserve underline and line breaks, reject executable HTML,
  event attributes, and interactive links, and verify source descriptions and
  prices are unchanged in cart state.
- Loader coverage verifies dependency order, a single codec load, and the page
  asset version. Browser coverage adds the test campaign tier through its actual
  button, verifies nested emphasis and underline, reloads, and checks restored
  content and item state in English and Spanish.
- Focused cart, loader, and content-security suites: 73 passed, one existing skip.

## Release boundary

This is a static-site presentation change. No Worker, pledge, payment, campaign
price, or customer-data mutation is required. The test-only campaign description
adds formatting without changing its visible wording. Rollback reverts this
Pool change while retaining the existing shared pins and saved cart schema.

## Completed acceptance

- [PR 58](https://github.com/aindaco1/pool/pull/58) merged at
  `d5363bbcd1d16cfba537f4b382fc393ae8b9d931` after the
  [hosted full Merge Smoke gate](https://github.com/aindaco1/pool/actions/runs/35154555677)
  and all four dependency audits passed. Local root/Worker production and full
  audits likewise reported zero vulnerabilities.
- Local checks passed 1,015 unit tests (one existing skip), 127 security tests,
  builds, and both Worker and mutable-pledge smoke checks. The first full-unit
  run exceeded the existing Shopping generator's timeout; that case passed
  alone and the subsequent full-unit run passed without code changes.
- The parallel local browser run had 126 passes, four retry passes, two failures,
  and three skips. Both new Markdown locale cases passed. All nine selected
  cases, including the new regressions and the affected admin, manage,
  accessibility, and checkout cases, passed a sequential rerun without code
  changes. Initial traces are retained locally; the hosted gate passed in full.
- All ten existing Platform codec characterization tests passed. No Platform
  implementation or package revision changed.
- [Production Pages refresh](https://github.com/aindaco1/pool/actions/runs/35155418890)
  passed for the merged revision, including cache purge and deployed response
  policy/crawl checks. Provider evidence and the media workflow also succeeded.
- Before deployment, an isolated public browser cart reproduced the literal
  markers for Alamosaurus. After deployment, reloading and reopening that same
  saved cart produced two bold spans with nested italic spans and no literal
  asterisks. Adding Moros then produced its two bold spans without markers.
  Their prices remained $150 and $5. The rendered cart was visually checked;
  no checkout or pledge submission occurred. Both temporary items were removed.

Generated build/cache/browser output and disposable test directories were moved
to a dated recovery folder outside the repositories. Development dependencies,
local configuration, Worker state, browser profiles, test fixtures, and Podman
images/volumes remain available. The merged feature branch is removed only after
its exact tip is verified against the merged PR and main history.
