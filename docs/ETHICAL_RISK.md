# Ethical Risk Review

This guide adapts the Ethical OS Toolkit from the Institute for the Future and Omidyar Network to The Pool's crowdfunding, payment, email, admin, and public sharing surfaces. Use it as a practical risk review, not as a replacement for security, accessibility, privacy, or legal review.

Source context: the toolkit asks teams to imagine longer-term consequences, check new features against recurring risk zones, and turn the findings into concrete mitigations before shipping. The original toolkit is licensed CC BY-NC-SA 4.0 and is available from `ethicalOS.org`.

## When To Use This

Run an ethical risk review when a change adds or materially changes:

- checkout, pledge management, settlement, tax, shipping, fees, tips, or financial reporting
- supporter email, launch reminders, abandoned-checkout reminders, Blast, diary broadcasts, or other notification flows
- admin roles, campaign creation, protected previews, user management, analytics, reports, marketing links, QR codes, embeds, or share cards
- public campaign visibility, SEO metadata, social previews, localization, or content-rendering rules
- data collection, retention, exports, provider integrations, analytics, or backup/restore behavior
- scoring, automation, personalization, recommendation, fraud detection, or AI-assisted workflows

Small copy, style, or docs-only changes usually do not need a full review unless they affect consent, privacy, public claims, or user understanding.

## Operating Principles

- Consent should be explicit where supporter attention, data, or money is involved.
- The Worker remains authoritative for totals, state, permissions, and persistence; browser UI is an explanation layer, not a trust boundary.
- Collect only data the current product needs, store it only where documented, and keep retention/restore behavior explainable.
- Prefer honest, state-aware public metadata over growth tricks, vague scarcity, or misleading social previews.
- Give supporters and admins clear recourse: manage links, unsubscribe paths, preview expiry, conflict messages, export/report paths, and support contact.
- Treat abuse, spam, harassment, fraud, and coercive design as product risks, not only security bugs.
- Review how different groups are affected, including users with disabilities, localized users, creators with small audiences, supporters with limited funds, and people sharing devices or networks.
- Build healthy platform metrics around successful completion, clear consent, delivery reliability, abuse reduction, and support outcomes, not only clicks, sends, or engagement volume.

## Risk Zones

Use these risk zones as prompts during design, implementation, and review.

| Risk zone | How it shows up in The Pool | Best practice |
|-----------|-----------------------------|---------------|
| Truth, disinformation, and propaganda | Campaign claims, diary posts, Blast, share cards, SEO metadata, embeds, social links, and generated previews can spread misleading public claims quickly. | Public metadata should match visible page content and current campaign state. Do not inflate funding status, scarcity, deadlines, creator identity, or tax/shipping certainty. |
| Addiction and attention pressure | Reminders, countdowns, limited inventory, milestone emails, and marketing dashboards can drift into pressure tactics. | Keep reminders opt-in and bounded. Avoid infinite loops, manipulative urgency, hidden defaults, or notification volume that exists mainly to maximize attention. |
| Economic and asset inequality | Fees, tips, shipping, tax, add-ons, limited tiers, and provider limits can affect supporters and creators unevenly. | Show subtotal, tax, shipping, platform tip, and total clearly. Keep platform add-on revenue separate from campaign progress. Test low-bandwidth, mobile, localized, and keyboard-only paths. |
| Machine ethics and algorithmic bias | Analytics, fraud checks, future recommendations, automated moderation, and provider readiness signals can become opaque decision systems. | Keep automated decisions explainable, auditable, and reversible where they affect access, pricing, visibility, or admin action. Avoid scoring users or campaigns without clear recourse. |
| Surveillance and long-term reputation risk | Pledge records, magic links, preview reviewer lists, referral/UTM data, abandoned-cart data, and admin audit records can reveal sensitive behavior. | Minimize PII, avoid broad tracking, keep tokenized/private routes out of indexing and prefetch, and do not expose supporter or reviewer identities in public artifacts. |
| Data control and monetization | Supporter, creator, campaign, and analytics data could be exported, sold, restored incorrectly, or repurposed after a provider/account change. | Document data purpose, storage, export, restore, and deletion expectations. Do not sell or repurpose supporter data without a new explicit product decision and consent model. |
| Implicit trust and user understanding | Admin publish flows, protected previews, checkout recovery, share links, drafts, and provider fallback states can surprise users if side effects are hidden. | Use clear status language for draft vs published, preview vs public, estimated vs final, dry run vs live send, and local-only vs production behavior. |
| Hateful and criminal actors | Public pages, embeds, referral links, QR codes, supporter email blasts, preview invites, and accountless links can be abused for harassment, spam, fraud, or doxxing. | Red-team misuse before release. Rate-limit mutation paths, scope permissions tightly, keep audit records, and avoid features that make targeted harm easier without mitigation. |

## Review Loop

For meaningful feature work, record the review in the PR, issue, release notes, or design notes:

1. Name the feature and the user groups affected.
2. Pick the two or three risk zones most relevant to the feature.
3. Imagine first-, second-, and third-order misuse or failure modes.
4. Identify what the feature makes easier for a malicious, careless, or financially pressured actor.
5. Decide which mitigations must ship now and which are acceptable follow-ups.
6. Add tests, docs, dashboard help, or operator runbook updates for the accepted mitigations.
7. If the risk cannot be explained simply, pause the change until the owner can explain the tradeoff.

## Red Flags

Treat these as release blockers until explicitly resolved:

- new hidden data collection, tracking, or analytics identifiers
- new public indexing, sharing, embed, or prefetch behavior for private/tokenized surfaces
- bulk messaging or reminder behavior without explicit consent, rate limits, dry-run validation, and unsubscribe/suppression handling where appropriate
- user-visible money, tax, shipping, fee, inventory, or campaign-progress changes without Worker-canonical verification
- automation that changes access, pricing, visibility, moderation, settlement, or reports without auditability and recourse
- admin role or campaign-scope changes that rely on browser controls instead of Worker enforcement
- campaign or creator content that can create stored XSS, unsafe embeds, misleading claims, or unsupported raw HTML
- social preview or SEO changes that can imply a different campaign state than the visible page
- provider integrations that add secrets, PII, or data export paths without storage and incident-response docs
- growth or engagement experiments that make it harder for users to stop, opt out, understand cost, or leave

## Review Template

```markdown
### Ethical Risk Review

- Feature:
- Affected users:
- Relevant risk zones:
- What could go wrong:
- Data collected or exposed:
- Consent, opt-out, and recourse:
- Abuse/misuse mitigations:
- Accessibility/i18n impact:
- Tests or evidence:
- Follow-ups accepted:
```

## Project-Specific Guidance

- Checkout and payment changes: start from [PAYMENT_PROCESSOR.md](./PAYMENT_PROCESSOR.md), [WORKFLOWS.md](./WORKFLOWS.md), and [SECURITY.md](./SECURITY.md). Verify canonical totals, idempotency, supporter understanding, and recovery paths.
- Email and reminders: start from [EMAIL.md](./EMAIL.md). Verify explicit consent, audience scope, dry runs, localized copy, suppression/unsubscribe behavior, and no-send evidence.
- Admin dashboard changes: start from [DASHBOARD.md](./DASHBOARD.md). Document whether the feature is read-only, browser-local, KV-backed, or GitHub-backed, and keep role/campaign scoping Worker-enforced.
- Public sharing, SEO, and embeds: start from [SEO.md](./SEO.md) and [EMBEDS.md](./EMBEDS.md). Public previews should be truthful, state-aware, and never leak protected-preview or tokenized data.
- Accessibility and localization: start from [ACCESSIBILITY.md](./ACCESSIBILITY.md) and [I18N.md](./I18N.md). Review who is left out when copy, controls, or evidence only work in one language, viewport, input mode, or ability profile.
- Performance and prefetching: start from [PERFORMANCE.md](./PERFORMANCE.md). Speculative loading should stay public-only and should not pressure user action or background private flows.
- Backups, exports, and restore paths: document data classes, PII minimization, retention, restore order, and duplicate-send/duplicate-charge risks before adding new backup behavior.

## Future-Proofing Habits

- Add ethical red flags to PRs early, while changes are still easy to reshape.
- Accept ethical-risk reports the same way the project accepts security or accessibility reports: specific, reproducible, and tied to a realistic harm.
- Keep platform health visible through operational evidence such as failed sends, rate-limit pressure, projection drift, accessibility coverage, i18n completeness, provider readiness, and abuse-path tests.
- Revisit this guide when the product adds new audiences, new data uses, new automation, or new distribution channels.

## v1.1.0 Review Record

- Feature: variant-specific add-on pricing plus production-quality/admin diagnostics hardening
- Affected users: supporters choosing add-ons, supporters modifying pledges, campaign creators, super admins, and operators
- Relevant risk zones: economic inequality/user understanding, implicit trust, and surveillance/data control
- What could go wrong: a browser could understate a selected price; a catalog edit could silently reprice an old pledge; a blank or zero override could be misread; performance diagnostics could retain sensitive request data; a public-cache optimization could leak a private response
- Data collected or exposed: no new supporter fields or telemetry payloads; diagnostics flatten existing bounded aggregate histograms only
- Consent, opt-out, and recourse: supporters see the selected variant price before checkout and can remove/change it; existing pledges retain their booked line price unless the variant changes; admin price changes use the existing preview/publish and audit model
- Abuse/misuse mitigations: Worker-canonical price resolution, historical persisted `unitPrice`, non-negative validation, explicit zero handling, private/no-store cache gates, bounded/redacted timing summaries, and no Store download/R2 systems
- Accessibility/i18n impact: new admin labels/help exist in English and Spanish; automated locale/accessibility checks remain gates; human screen-reader and native-Spanish review remain optional evidence
- Tests or evidence: shared utility, cart, Manage Pledge, Worker checkout/modification, admin validation/YAML, performance evaluator, cache-policy, observability, i18n, and release evidence coverage
- Follow-ups accepted: no product migration is needed; Workers Cache remains disabled until representative evidence proves the configured p95 improvement

---

_Last updated: July 12, 2026_
