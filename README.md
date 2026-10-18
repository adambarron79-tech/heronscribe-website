# HeronScribe landing page

Deploys to Cloudflare Workers (with static assets) — Cloudflare's current
recommended path for sites like this as of 2026, replacing the older
Cloudflare Pages product for new projects.

## Structure
- `public/` — everything served to visitors: `index.html`, `styles.css`,
  `robots.txt`, `sitemap.xml`, `assets/` (logo, favicons,
  OG image, hero photo)
- `src/worker.js` — minimal Worker entry; serves everything from `public/`
  via the ASSETS binding. No form handling or user input.
- `wrangler.jsonc` — Worker configuration (name, static assets directory)

## Deploy — connected via GitHub (already set up)
This repo is connected to a Cloudflare Workers project via GitHub, so
**pushing to `main` auto-deploys**. No manual deploy command needed
day-to-day.

### One-time setup still required
1. **Connect the custom domain** — in the same Worker project → Settings →
   Domains & Routes → add `heronscribe.app`. Since the domain is already
   on this Cloudflare account, this should auto-configure.
2. **Point `app.heronscribe.app` at the existing gated platform (Render)**
   — a separate DNS record in the same Cloudflare zone, independent of
   this Worker.

### Manual deploy (only needed if you want to push without Git)
```
npm install -g wrangler
wrangler login
wrangler deploy
```

## SEO / sharing already wired in
- Open Graph + Twitter Card tags (needed for WhatsApp/Facebook link
  previews — directly relevant given the launch plan leans on peer sharing)
- `schema.org` SoftwareApplication structured data with both pricing tiers
- Canonical URL tag (`https://heronscribe.app/`)
- `robots.txt` + `sitemap.xml`
- Full favicon set (browser tab, iOS home screen)

## Still needs a decision from you
- **www vs non-www**: built assuming `heronscribe.app` (no www) is canonical
  throughout (OG tags, sitemap, structured data). If you'd rather `www.` be
  the primary, say so and every reference needs updating together, not
  piecemeal.
- **Cloudflare Web Analytics**: if you used the automatic-setup prompt
  from the dashboard, nothing else is needed — don't also add a manual
  beacon script, or analytics will double-count.

## Placeholders to revisit post-launch
Marked with `<!-- PLACEHOLDER -->` comments in `public/index.html`:
- **Guide section** copy — fine to refine as trial feedback comes in.
- **Proof section** — currently a generic line; per the pre-launch
  checklist, this needs named practices (Jess Chi / Heidi Hunter / Adrian
  Vecchio) confirmed BEFORE any press link goes out.
- **Demo video** — currently an icon placeholder; swap in a real embed
  once a demo recording exists.

No footer legal links (privacy/terms) yet — add once HeronScribe Pty Ltd's
compliance documentation is finalized.
