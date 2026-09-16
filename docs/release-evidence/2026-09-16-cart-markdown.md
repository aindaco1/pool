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
Full gate and deployed-browser acceptance are recorded after completion.
