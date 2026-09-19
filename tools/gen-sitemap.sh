#!/bin/sh
# sitemap.xml ureteci — depo kokunden calistirilir:  sh tools/gen-sitemap.sh
#
# Kapsam kurallari:
#   - Depodaki tum .html dosyalari taranir (git ls-files; izlenmeyen dosya alinmaz).
#   - 404.html haric tutulur (noindex; arama motorlarina bildirilmez).
#   - URL semasi korunur: kokte *.html, alt agacta hplc-guide/*.html.
#     Dizin bazli URL'ye donusum YAPILMAZ (GitHub Pages sunucu tarafi 301
#     desteklemedigi icin mevcut tum baglantilari kirardi).
#   - index.html, site kokune (/) esleştirilir.
#   - lastmod, dosyanin son commit tarihinden okunur; hicbir commit yoksa
#     bugunun tarihi kullanilir.
set -eu

BASE="https://ugurtrsahin.github.io"
OUT="sitemap.xml"
TODAY=$(date -u +%Y-%m-%d)

{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  git ls-files '*.html' | grep -v '^404\.html$' | LC_ALL=C sort | while read -r f; do
    case "$f" in
      index.html) loc="$BASE/" ;;
      *)          loc="$BASE/$f" ;;
    esac
    mod=$(git log -1 --format=%cs -- "$f" 2>/dev/null || true)
    [ -n "$mod" ] || mod="$TODAY"
    printf '  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>\n  </url>\n' "$loc" "$mod"
  done
  echo '</urlset>'
} > "$OUT"

echo "$OUT yazildi: $(grep -c '<loc>' "$OUT") URL"
