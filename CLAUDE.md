# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this site is

A static HTML website ("HPLC Bilgi Merkezi" — HPLC Knowledge Center) written entirely in Turkish. It documents HPLC (High Performance Liquid Chromatography) techniques and validation methods. Deployed to GitHub Pages with no build step.

## Previewing locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

There is no build, no bundler, no package manager. Pages are served directly as authored.

## Architecture

### Shared theme system

All pages load exactly two shared files:

- `assets/theme.css` — single stylesheet with all styles including Notion-compatible CSS classes. Colors, spacing, radii and widths are CSS custom properties on `:root` (`--accent` is teal `#0f766e`; `--page-width` is `46rem` for content pages, overridden to `64rem` by `body.home`). Use the variables instead of hard-coded values.

### Dark mode

Dark mode follows the OS/browser preference only (`@media (prefers-color-scheme: dark)` redefines the `:root` variables; there is no manual toggle, so no storage and no flash on load). New colors must be added as variables with both a light and a dark value. Prism's light theme is neutralized in dark mode by `:root`-prefixed overrides in `theme.css` (higher specificity than the lazily loaded `prism.min.css`). Mermaid diagrams keep Mermaid's default (light) theme because their sources use light `classDef` fills; in dark mode `.mermaid-diagram` is shown on a light panel.
- `assets/theme.js` — single IIFE that injects the site header, generates table of contents, wraps tables in a scroll container, and lazy-loads vendor libs

Both are referenced with absolute paths (`/assets/...`) and require the `<meta name="site-base" content="/">` tag in `<head>` plus `data-base="/"` on `<body>` to resolve paths correctly regardless of page nesting depth.

### Navigation

The header (`.site-header`: a `.site-brand` home link showing `siteName`, plus `nav.site-nav`) is dynamically injected by `theme.js` right after the `.skip-link`, using the `siteName` constant and `navLinks` array at the top of that file. The brand link is the home link, so `navLinks` has no "Ana Sayfa" entry. To add a nav item, edit the array in `assets/theme.js`. Active link detection compares normalized `window.location.pathname` against each link's resolved href and marks the match with `aria-current="page"`.

### Table of contents

`theme.js` auto-generates a `.toc-panel` and inserts it after the first heading when a page has 3 or more `h2`/`h3` elements. IDs are auto-assigned via a `slugify()` function that handles Turkish characters (ç, ğ, ı, ö, ş, ü). Set `data-toc="off"` on `<body>` to suppress it (the home page does this because its cards use `h3`).

### Home page

`index.html` uses `<body class="home" data-toc="off">` and home-only components defined under the "Ana sayfa (body.home)" section of `theme.css`: `.hero`, `.button`, `.home-section`, `.section-title`, `.card-grid`, `.card` (plus `.card-compact`), `.tag-list`, `.badge`. A card is one link: the `<a>` in `.card-title` stretches over the whole card via `::after`, so put no other links inside a card. For external or restricted links, add the context in a `.visually-hidden` span inside the link and mark the visible `.badge` `aria-hidden="true"`.

### Code blocks and diagrams

- Regular code: Prism.js is lazy-loaded from `assets/vendor/prism.min.js` only when `<pre><code>` blocks are present.
- Mermaid diagrams: use `<pre><code class="language-mermaid">` (matched case-insensitively; `hplc-guide/troubleshooting-guide.html` uses `language-Mermaid`) — `theme.js` converts these to `<div class="mermaid">` elements and loads `assets/vendor/mermaid.min.js` at runtime.

### Standalone pages

`hplc-simulator.html` is a standalone application that does not use the shared theme (`theme.css`/`theme.js`) beyond the `site-base` meta tag. It is linked from `index.html` (under "Projeler") and from the `navLinks` array in `assets/theme.js`.

- `hplc-simulator.html` — interactive 3D HPLC instrument simulator (markup only; code and styles in `assets/hplc-sim/`, see below).
- `sfe-intelligence.html` — **redirect stub only** (meta refresh + `location.replace`) to `/sfe-intelligence-web/`. The SFE Intelligence app is a separate project in the repository `ugurtrsahin/sfe-intelligence-web` (Vite/React/TypeScript; built and published by its own GitHub Actions workflow to the project-pages path `https://ugurtrsahin.github.io/sfe-intelligence-web/`). Do not add app code, Firebase configuration, or `firestore.rules` here; they live in that repository (see its `README.md` and `CLAUDE.md`). `index.html` and the `navLinks` entry point to `sfe-intelligence-web/`. Do not create a top-level `sfe-intelligence-web/` directory in this repository — it would shadow the project site. The app is private to its owner (verified-email gate + Firestore rules).

### HPLC simulator (`assets/hplc-sim/`)

Classic scripts loaded in order by `hplc-simulator.html`; they share one global scope (top-level `const`s such as `S`, `V`, `CAM` are not `window` properties). Order: `data.js` → `physics.js` → `scene-core.js` → `scene-procedural.js` → `scene-gltf.js` → `interaction.js` → `chroma.js` → `ui.js` → `main.js`, then the ES module `three-boot.mjs`.

- `physics.js` is DOM-free (chemistry/physics model v2: per-solvent LSS + ionisation with s_s pH shift, Knox with k-dependent C, Poppe G, Darcy + Hagen–Poiseuille pressure, stray-light detector, seeded noise, EP S/N, two-run LSS fit). Keep it DOM-free so `tests/` can load it in Node.
- three.js is **vendored** in `assets/vendor/three/` (version in `VERSION`, regenerated from the npm package with `tools/vendor-three.sh <version>`). An import map in `hplc-simulator.html` maps `three` and `three/addons/`; `three-boot.mjs` dynamically imports the library and addons into `window.THREE` and fires `three-ready` / `three-failed`. Do not add a `modulepreload` before the import map.
- 3D "rig" contract (`scene-core.js` header): a rig builder fills `V.modules`, `V.segDefs`, `V.colAxis`, `V.screens`, pivots etc.; animation/interaction code only uses these fields. Two rigs exist: `scene-gltf.js` (Blender model, default) and `scene-procedural.js` (fallback if the model fails to load; force with `?model=prosedurel`). Camera focus, labels and outlines are derived from module bounding boxes, so the rigs need not share a scale.
- The model `assets/models/hplc-system.glb` is generated, not hand-edited: `tools/blender/build_hplc.py` (bpy, real scale in metres, generic design without any vendor branding) + `tools/blender/build-model.sh` (gltf-transform meshopt compression). The script header documents the node naming contract (`Mod_*`, `Screen_*`/`Label_*`, `LED_*`, `Pivot_*`, `Column_In/Out`, `Det_Cell`, `Lamp_*`, `FlowPaths` extras) that `scene-gltf.js` relies on; change both together.
- `tools/screenshots.mjs` takes fixed-angle screenshots with Playwright (SwiftShader without a GPU) for before/after checks.

### Tests

`node --test tests/*.test.mjs` — verification tests of `physics.js` against closed-form solutions (see `tests/README.md`). CI: `.github/workflows/test.yml` (syntax check of every `assets/hplc-sim/*.js` + tests). Run them after any change to `data.js` or `physics.js`.

### Notion-compatible CSS

Content was exported from Notion. `theme.css` defines classes matching Notion's output: `.page`, `.page-title`, `.page-description`, `.link-to-page`, `.bulleted-list`, `.toggle` (collapsible `<details>`), `.to-do-list`, `.checkbox`.

## Page structure conventions

Every page follows this pattern:

```html
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="site-base" content="/">
    <!-- SEO: description, og:*, twitter:* -->
    <link rel="canonical" href="https://ugurtrsahin.github.io/...">
    <link rel="stylesheet" href="/assets/theme.css">
    <script defer src="/assets/theme.js"></script>
    <title>...</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body data-base="/">
<a class="skip-link" href="#main-content">İçeriğe atla</a>
<main id="main-content">
    <!-- content -->
</main>
</body>
</html>
```

- `lang="tr"` on all pages (content is Turkish)
- `<meta name="site-base" content="/">` and `data-base="/"` are required for `theme.js` path resolution — do not omit them
- The skip link for accessibility (`#main-content`) is always the first child of `<body>` before the injected nav
- All asset hrefs use root-relative paths (`/assets/...`), not relative paths

## Content language

All page content, headings, navigation labels, and UI text are in Turkish. Maintain Turkish throughout when editing or adding content.

## Security notes

- **No secrets in the repo.** Never commit service-account keys, OAuth client secrets, or `GEMINI_API_KEY`. (The SFE app's Firebase web config is public by design and lives in its own repository, which also owns the auth gate and `firestore.rules`.)
- **Third-party code.** three.js (r186) is served from `assets/vendor/three/` (no CDN); update it only with `tools/vendor-three.sh`, which takes the files from the official npm package, and keep `LICENSE`/`VERSION`. `assets/vendor/mermaid.min.js` (10.9.5) is loaded by `hplc-guide/troubleshooting-guide.html`; keep it updated or convert that diagram to a static image and remove it. Prism is loaded only for pages with `<pre><code>` blocks.
- **CI supply chain.** `.github/workflows/static.yml` and `test.yml` pin every action to a commit SHA (tag in the trailing comment) and uses least-privilege `permissions`. When bumping an action, update both the SHA and the comment.
- **No inline HTML from user input.** New code must use `textContent`/DOM APIs, not `innerHTML`, for any value that is not a number or a static string.

## Deployment

Push to the `main` branch — GitHub Pages deploys automatically with no build step.

- `.nojekyll` at the repository root disables Jekyll processing, so the large single-file pages are served as authored.
- `.github/workflows/static.yml` deploys the repository root with `actions/deploy-pages`. It requires Settings → Pages → Source = "GitHub Actions"; with "Deploy from a branch" the built-in `pages-build-deployment` run is used instead.
