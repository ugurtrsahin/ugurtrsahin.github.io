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

`sfe-intelligence.html` and `hplc-simulator.html` are single-file applications that do not use the shared theme beyond the `site-base` meta tag. Both are linked from `index.html` (under "Projeler") and from the `navLinks` array in `assets/theme.js`.

- `sfe-intelligence.html` — SFE Intelligence: a single-file (inline CSS + bundled JS, ~1 MB) platform for supercritical CO₂ (scCO₂) extraction literature, evidence traceability (provenance) and deterministic engineering calculations. Treat it as a build output: do not hand-edit the minified bundle; replace the whole file when a new build is exported. It must not contain preview-environment scripts such as `/_aistudio-iframe.js`.
  - **Hand-patched bundle**: the owner-only auth gate below was added directly to the minified bundle (component `SfeAuthGate` wraps the app root `BC`, plus the `KS` Firebase config). If the file is replaced by a fresh export, these patches must be re-applied.
  - Backend: the `sfe-intelligence` Firebase project (Google/GitHub Sign-In and the Cloud Firestore `(default)` database). The Firebase web config is embedded as the `KS` object; web API keys are public by design — access control is the auth gate (UI) plus `firestore.rules` (data).
  - **Access model — owner-only (single user)**: the app is private to `ugur.tr.sahin@gmail.com` (GitHub: `ugurtrsahin`). Signed-out visitors see only a lock screen with "GitHub ile Giriş Yap" / "Google ile Giriş Yap" buttons; the app (`BC`) is not even mounted, so no tabs, tables, demo data or `localStorage` guest mode are reachable. `onAuthStateChanged` and every sign-in result run `sfeIsOwner(user)`: the Firebase account must have a **verified** email equal (case-insensitive) to the owner email; otherwise `signOut` is called immediately and "Erişim Reddedildi" is shown. Identity is decided by verified email only — a GitHub username match alone is not accepted, because Firestore rules cannot verify it (the UI would open but all data access would fail).
  - Limits of the gate: it is client-side (static hosting). The HTML/JS bundle itself — including built-in demo/glossary data — stays publicly downloadable; real data protection comes from `firestore.rules`. Data already cached in the browser's `localStorage` from earlier sessions is not erased by the gate.
  - Persistence: data lives in Firestore (`projects`, `sources`, `evidences`, `experiments`, `calculations`), each document carrying `ownerId` = the owner's uid, with real-time sync and a `localStorage` cache. Legacy `local-user` records are migrated to the cloud on first owner sign-in.
  - Security rules: `firestore.rules` at the repository root is the versioned backup of the rules published in the Firebase Console (not deployed automatically). Rules require `isAuthorizedOwner()` (verified email = owner email) **and** `ownerId == request.auth.uid`, limited to the five collections. After changing the rules in the Console, update this file to match. It is served publicly with the site; the rules contain no secrets.
  - Firebase Console prerequisites: Authentication → Sign-in method: Google and GitHub enabled (GitHub needs an OAuth App whose callback URL is `https://sfe-intelligence.firebaseapp.com/__/auth/handler`); Authorized domains includes `ugurtrsahin.github.io`. Keep "one account per email" (default) so Google and GitHub logins share one uid and therefore one `ownerId`.
  - Navigation: the page has no shared theme nav; a static top bar (`← Ana Sayfa`, `href="index.html"`) above `#root` links back to the home page.
- `hplc-simulator.html` — interactive 3D HPLC instrument simulator.

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

## Deployment

Push to the `main` branch — GitHub Pages deploys automatically with no build step.

- `.nojekyll` at the repository root disables Jekyll processing, so the large single-file pages are served as authored.
- `.github/workflows/static.yml` deploys the repository root with `actions/deploy-pages`. It requires Settings → Pages → Source = "GitHub Actions"; with "Deploy from a branch" the built-in `pages-build-deployment` run is used instead.
