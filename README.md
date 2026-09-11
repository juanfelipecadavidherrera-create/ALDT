# ALDT — Advanced Land Development Tools

Static marketing website for the ALDT Autodesk Civil 3D plugin, authored by
Juan Felipe Cadavid Herrera. Plain HTML, CSS, and JavaScript; no build step.

## Design and content

The site carries the opening cutaway's warm stone backgrounds, green ink,
editorial typography, and restrained rules through the product overview,
command library, workflow, founder story, pricing, download, and privacy page.

The supplied ALDT master index is the content source: **55 commands**, grouped
into **9 disciplines** for the website. `PUMPCALCULATOR`, `STATIONMAKER`, and
`ALDTLICENSE` are marked as command-line tools. Search operates across all
commands; nine project cards select a family, and command chips open a focused
preview with previous/next navigation. On phones, the project cards form a
horizontally scrollable shelf. Without JavaScript, the entire
catalog remains readable through native disclosure sections.

Existing subscription prices, trial terms, purchase URLs, and privacy-policy
text are preserved. The compatibility copy follows the supplied guide's
Civil 3D 2025/2026 and .NET 8 targets.

## Local preview

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/`. ES-module imports require HTTP; opening the HTML
through `file://` will not run the scene.

The 8.5-second Three.js opening shows survey, concrete placement, and a soil
section reveal. The manholes have centered cones and covers, and the pipe
connections are raised above their bases. There are no object-label callouts.
Pause, replay, skip, reduced-motion stills, and an inline SVG fallback are
supported. Rendering stops when complete, paused, or offscreen.

For repeatable local scene checkpoints, `?intro-frame=0.46` holds the assembly
and `?intro-frame=1` holds the completed view. Production ignores this override.

## Files

- `index.html`: landing page, complete command inventory, and metadata.
- `privacy.html`: shared visual shell with the existing policy text.
- `assets/css/base.css`: shared palette, typography, controls, and layout.
- `assets/css/intro.css`: opening scene layout and controls.
- `assets/css/nav-hero.css`: navigation, product overview, and profile study.
- `assets/css/tools.css`: responsive command library and search states.
- `assets/css/sections.css`: workflow, about, pricing, footer, and legal page.
- `assets/js/pipe3d.js`: Three.js scene, clock, playback, and lifecycle.
- `assets/js/intro-materials.js`: local procedural textures and geometry helpers.
- `assets/js/intro.js`: scene controls, progress, and navigation handoff.
- `assets/js/tools.js`: global command search, category filters, and deep links.
- `assets/js/main.js`, `hero.js`, `sections.js`, `boot.js`: existing shared
  Lenis/GSAP runtime and page navigation/animation behavior.

Load the CSS files in the order listed above. Three.js and its addons share
one pinned version. GSAP and Lenis retain the existing CDN versions.

## Publishing

The repository is deployed through GitHub Pages:
`https://juanfelipecadavidherrera-create.github.io/ALDT/`.
Relative asset URLs preserve deployment under `/ALDT/`. `.nojekyll` disables
Jekyll processing. There is no custom-domain CNAME in this checkout.

Before publishing, validate JavaScript syntax, local references and anchors,
unique command coverage, search/reset/filter behavior, and responsive layouts.
