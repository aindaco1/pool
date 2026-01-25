# CMS Integration

The Pool uses [Pages CMS](https://pagescms.org) for visual campaign editing without requiring Git knowledge.

## Quick Start

1. Go to [app.pagescms.org](https://app.pagescms.org)
2. Sign in with GitHub
3. Grant access to the `aindaco1/pool` repository
4. Open the project to see the dashboard

## What You Can Edit

### Campaigns

The main content type. Each campaign includes:

| Section | Fields |
|---------|--------|
| **Core** | Title, slug, creator name/image, category |
| **Images** | Hero (square + wide), video, backgrounds |
| **Funding** | Goal amount, start/end dates |
| **Content** | Short blurb, long description (rich blocks) |
| **Tiers** | Reward tiers with pricing, limits, gating |
| **Stretch Goals** | Funding thresholds with titles |
| **Support Items** | Named funding buckets (e.g., "Festival Submissions") |
| **Diary** | Production updates with rich content |
| **Decisions** | Community polls for backers |

### Pages

- **About Page** (`about.md`) — Platform explanation
- **Terms Page** (`terms.md`) — Terms of service

### Site Settings

- Site title, tagline, description (via `_config.yml`)

## Campaign Editing Workflow

### Creating a New Campaign

1. Go to **Campaigns** → **Add Entry**
2. Fill required fields:
   - Title (e.g., "TECOLOTE · Short Film")
   - Slug (e.g., `tecolote`) — becomes the URL
   - Creator name
   - Category
   - Hero image
   - Goal amount, start date, end date
   - Short blurb
3. Add at least one tier
4. Click **Save**

Pages CMS commits the new file to GitHub, triggering a site rebuild.

### Content Blocks

The `long_content` field uses **block-based editing** — each block type shows only its relevant fields:

| Type | Fields Shown |
|------|--------------|
| **Text** | Markdown content editor |
| **Image** | Image upload, alt text, caption |
| **Quote** | Quote text, author |
| **Gallery** | Layout selector, image list, caption |
| **Divider** | None (just adds a horizontal line) |

The same block system is used for **Production Diary** entries.

### Adding Tiers

Each tier needs:
- **ID** — Lowercase with hyphens (e.g., `digital-screener`)
- **Name** — Display name (e.g., "Digital Screener")
- **Price** — In dollars
- **Description** — What the backer gets

Optional tier settings:
- **Image** — Wide image shown above tier name
- **Category** — `digital` or `physical` (for shipping)
- **Multiple Quantities?** — Can backers add more than one?
- **Limit** — Max available (leave empty for unlimited)
- **Unlock Threshold** — Only visible after campaign reaches $X
- **Late Support** — Available after campaign ends

### Adding Diary Entries

1. Open a campaign
2. Scroll to **Production Diary**
3. Click **Add Item**
4. Fill in:
   - **Date** — Datetime picker (stored with timezone)
   - **Title** — Entry headline
   - **Phase** — Production phase (fundraising, pre-production, etc.)
5. Add content blocks (text, images) — same block system as Campaign Description
6. Save

New diary entries trigger email broadcasts to supporters (via Worker cron).

## Media Uploads

Images upload to `assets/images/campaigns/` and are organized by campaign slug.

**Recommended sizes:**
- Hero (square): 1000×1000px, <400KB
- Hero (wide): 1600×900px, <400KB
- Creator photo: 400×400px

## Permissions & Access

⚠️ **Current Limitation:** Pages CMS does not yet support per-user permissions. All collaborators with repo access can edit all campaigns.

### Workarounds for Multi-Creator Access

**Option 1: Branch-Based Workflow**
1. Create a branch per creator (e.g., `campaign/tecolote`)
2. Creator edits only their branch via Pages CMS
3. Admin reviews and merges PRs to `main`

**Option 2: Submission Repository**
1. Creators fork the repo or use a separate "submissions" repo
2. Submit campaign edits via Pull Request
3. Admin reviews and merges

**Option 3: Trust Model**
- Invite trusted collaborators with full access
- Rely on GitHub's commit history for accountability

### Adding a Collaborator

1. Go to **Settings** → **Collaborators** in Pages CMS
2. Invite by email (no GitHub account required)
3. They receive a magic link to access the dashboard

## Configuration File

The CMS is configured in `.pages.yml` at the repo root.

Key sections:
- `media` — Upload paths
- `content` — Collections and fields

To add a new field to campaigns, edit `.pages.yml` and add to the `fields` array under `campaigns`.

## Troubleshooting

### Changes Not Appearing

1. Check GitHub Actions — the build may have failed
2. Wait 2-3 minutes for GitHub Pages to deploy
3. Hard refresh the browser (Cmd+Shift+R)

### Image Upload Failed

- Check file size (<400KB recommended)
- Ensure the file is a supported format (PNG, JPG, WebP)
- Check that `assets/images/campaigns/` exists

### Field Not Saving

- Required fields must have values
- Pattern-validated fields (slug, IDs) must match format
- Check browser console for errors

### Sections Show Empty (Despite Having Data)

This usually means invalid YAML in the campaign file. Common causes:

- **`---` in content** — A line with just `---` inside a multiline text field will break YAML parsing (it's interpreted as a document separator). Remove or replace with a different separator.
- **Unescaped special characters** — Colons, quotes, or brackets in text may need escaping.

Test your campaign file locally:
```bash
python3 -c "import yaml; print(yaml.safe_load(open('_campaigns/your-campaign.md').read().split('---')[1]))"
```

## Future: Per-Campaign Permissions

Pages CMS has "Permissions" on their roadmap. When released, we'll update to support:
- Admin role: edit any campaign + site settings
- Campaign writer role: edit only assigned campaigns + upload media

---

_Last updated: Jan 2026_
