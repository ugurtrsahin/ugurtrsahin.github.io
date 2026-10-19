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

- `assets/theme.css` — single stylesheet with all styles including Notion-compatible CSS classes
- `assets/theme.js` — single IIFE that injects navigation, generates table of contents, and lazy-loads vendor libs

Both are referenced with absolute paths (`/assets/...`) and require the `<meta name="site-base" content="/">` tag in `<head>` plus `data-base="/"` on `<body>` to resolve paths correctly regardless of page nesting depth.

### Navigation

The nav bar is dynamically injected by `theme.js` using the `navLinks` array hardcoded at the top of that file. To add a nav item, edit the array in `assets/theme.js`. Active link detection compares normalized `window.location.pathname` against each link's resolved href.

### Table of contents

`theme.js` auto-generates a `.toc-panel` and inserts it after the first heading when a page has 3 or more `h2`/`h3` elements. IDs are auto-assigned via a `slugify()` function that handles Turkish characters (ç, ğ, ı, ö, ş, ü).

### Code blocks and diagrams

- Regular code: Prism.js is lazy-loaded from `assets/vendor/prism.min.js` only when `<pre><code>` blocks are present.
- Mermaid diagrams: use `<pre><code class="language-mermaid">` — `theme.js` converts these to `<div class="mermaid">` elements and loads `assets/vendor/mermaid.min.js` at runtime.

### Standalone pages

`hplc-simulator.html` is a single-file application that does not use the shared theme beyond the `site-base` meta tag. It is linked from `index.html` (under "Projeler") and from the `navLinks` array in `assets/theme.js`.

- `hplc-simulator.html` — interactive 3D HPLC instrument simulator.
- `sfe-intelligence.html` — **redirect stub only** (meta refresh + `location.replace`) to `/sfe-intelligence-web/`. The SFE Intelligence app is a separate project in the repository `ugurtrsahin/sfe-intelligence-web` (Vite/React/TypeScript; built and published by its own GitHub Actions workflow to the project-pages path `https://ugurtrsahin.github.io/sfe-intelligence-web/`). Do not add app code, Firebase configuration, or `firestore.rules` here; they live in that repository (see its `README.md` and `CLAUDE.md`). `index.html` and the `navLinks` entry point to `sfe-intelligence-web/`. Do not create a top-level `sfe-intelligence-web/` directory in this repository — it would shadow the project site. The app is private to its owner (verified-email gate + Firestore rules).

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
    <meta name="color-scheme" content="light">
    <meta name="site-base" content="/">
    <!-- SEO: description, og:*, twitter:* -->
    <link rel="canonical" href="https://ugurtrsahin.github.io/...">
    <link rel="stylesheet" href="/assets/theme.css">
    <script defer src="/assets/theme.js"></script>
    <title>...</title>
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
- **Third-party code.** `hplc-simulator.html` loads three.js r128 from CDNs with Subresource Integrity (`THREE_SRI`; all three CDNs serve the identical file). When changing the three.js version, recompute the `sha384` hash. `assets/vendor/mermaid.min.js` (10.9.5) is currently unused by any page; keep it unused or update/remove it. Prism is loaded only for pages with `<pre><code>` blocks.
- **CI supply chain.** `.github/workflows/static.yml` pins every action to a commit SHA (tag in the trailing comment) and uses least-privilege `permissions`. When bumping an action, update both the SHA and the comment.
- **No inline HTML from user input.** New code must use `textContent`/DOM APIs, not `innerHTML`, for any value that is not a number or a static string.

## Deployment

Push to the `main` branch — GitHub Pages deploys automatically with no build step.

- `.nojekyll` at the repository root disables Jekyll processing, so the large single-file pages are served as authored.
- `.github/workflows/static.yml` deploys the repository root with `actions/deploy-pages`. It requires Settings → Pages → Source = "GitHub Actions"; with "Deploy from a branch" the built-in `pages-build-deployment` run is used instead.
