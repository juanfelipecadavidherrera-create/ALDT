# ALDT — Advanced Land Development Tools

Marketing site for **Advanced Land Development Tools (ALDT)**, a paid AutoCAD
Civil 3D 2026 plugin for civil engineers working in land development. ALDT
ships **53 commands across 12 toolsets** — pipe & pressure-network math,
profile-view automation and labeling, vehicle tracking / swept-path analysis,
GIS lookups, surface tools, area/excavation takeoffs, and drafting utilities —
all in a single install that loads automatically into the Civil 3D ribbon.

- **Price:** $9.99/month or $99.99/year, sold through the Autodesk App Store.
- **Requirements:** Civil 3D 2026, .NET 8, AutoCAD R26, Windows 10+ 64-bit.
- **Built by:** Juan Felipe Cadavid Herrera, a civil engineer specializing in
  land development.

## About this site

This is the static marketing/landing page for ALDT — a single-page site
(`index.html`) plus a privacy policy (`privacy.html`). There is no build
step and no framework: plain HTML, CSS and JS, deployed as-is to GitHub
Pages (see the `.nojekyll` file — Jekyll processing is intentionally
disabled).

The opening “Below the surface” scene renders an 8.5-second Three.js
infrastructure cutaway: survey, concrete placement, and a finished soil/pavement
section. Local procedural materials provide concrete, iron, soil, and aggregate
textures. A single clock drives the camera and assembly; GSAP ScrollTrigger
drives the rest of the page. Pause, replay, and skip are available, reduced
motion renders a still, and an inline SVG provides the WebGL fallback.
Rendering stops at completion, while paused, or while the intro is offscreen.

For repeatable local visual checks, `?intro-frame=0.46` holds an assembly
checkpoint and `?intro-frame=1` shows the finished composition. This override
is accepted only on localhost. Replay resumes ordinary playback.

## Running it locally

No build step, so any static file server works:

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000/
```

or with Node:

```bash
npx http-server -p 8000
```

Opening `index.html` directly via `file://` will not work — the ES module
imports (`<script type="module">`, the `three` import map) require
an HTTP origin.

## File layout

```
index.html            Main landing page (hero, tools, workflow, stats,
                       about, pricing, download, footer)
privacy.html           Privacy policy page — shares the same nav/footer
                       chrome and stylesheet stack as index.html
CNAME                  (not present — see Deployment below)
.nojekyll               Disables GitHub Pages' Jekyll processing
robots.txt, sitemap.xml  Crawler directives / URL list
site.webmanifest        PWA manifest (name, icons, theme color)
favicon.ico, favicon.svg,
apple-touch-icon.png,
icon-192.png, icon-512.png   Favicon set, generated from the nav logo mark

assets/
  css/
    base.css            Design tokens (colors, fonts, spacing), CSS reset,
                         utility classes, buttons
    intro.css           Cutaway intro layout, responsive composition,
                         labels, progress phases, and playback controls
    nav-hero.css         Fixed nav bar + hero section
    tools.css             Tools section: the 53-command showcase, including
                         the GSAP-pinned horizontal scroll track on desktop
                         and the CSS-only stacked/swipeable fallback on
                         mobile and reduced-motion
    sections.css          Workflow steps, stats strip, about, pricing,
                         download CTA, and footer
  js/
    main.js              Site logic: nav scroll state, Lenis smooth scroll,
                         GSAP ScrollTrigger setup (incl. the horizontal
                         tools pin), reveal-on-scroll, animated stat counters
    pipe3d.js             Three.js cutaway scene, clock, and playback lifecycle
    intro-materials.js    Seeded material textures and chamfered lathe geometry
    intro.js              Intro controls, progress phases, navigation handoff
  img/
    og-image.png          1200×630 Open Graph / Twitter card image
```

### Stylesheet cascade order

The five `assets/css/*.css` files are **not independent** — later files rely
on tokens and base rules defined earlier, and some selectors intentionally
override earlier ones. They must be loaded in exactly this order, matching
the `<link>` order in the `<head>` of both `index.html` and `privacy.html`:

1. `base.css`
2. `intro.css`
3. `nav-hero.css`
4. `tools.css`
5. `sections.css`

If you split or reorder these files further, preserve this cascade — moving
a `<link>` earlier or later than this list can silently change how a rule
resolves.

## Deployment

Deployed via GitHub Pages from this repository
(`juanfelipecadavidherrera-create/ALDT`). There is no `CNAME` file, so the
site is served at the default GitHub Pages project URL:

```
https://juanfelipecadavidherrera-create.github.io/ALDT/
```

All internal links and asset paths in this repo are relative (no leading
`/`) so the site works correctly under that `/ALDT/` subpath. If a custom
domain is ever added via a `CNAME` file, the canonical URLs and Open Graph
`og:url` / `og:image` values in both HTML files' `<head>` sections should be
updated to match.
