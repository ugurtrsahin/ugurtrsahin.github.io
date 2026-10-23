#!/usr/bin/env bash
# three.js'i resmî npm paketinden assets/vendor/three/ altına alır ve küçültür.
# Kullanım: tools/vendor-three.sh 0.186.1
# Gereksinim: node + npx (esbuild indirilir). Çıktı derleme gerektirmeyen ES modülleridir;
# importmap ("three", "three/addons/") hplc-simulator.html içinde tanımlıdır.
set -euo pipefail
VER="${1:?three sürümü verin, ör. 0.186.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/assets/vendor/three"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
npm pack "three@$VER" --silent >/dev/null
tar xzf "three-$VER.tgz"

rm -rf "$DEST"; mkdir -p "$DEST/addons"
for f in three.core three.module; do
  npx --yes esbuild "package/build/$f.js" --minify --format=esm --legal-comments=inline \
      --log-level=warning --outfile="$DEST/$f.min.js"
done
sed -i "s#\./three\.core\.js#./three.core.min.js#g" "$DEST/three.module.min.js"

# Kullanılan eklentiler ve göreli import bağımlılıkları (kapanış kümesi)
python3 -I - "$WORK/package/examples/jsm" > addons.txt <<'PY'
import os, re, sys
root = sys.argv[1]
entries = ['loaders/GLTFLoader.js', 'libs/meshopt_decoder.module.js', 'environments/RoomEnvironment.js',
           'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
           'postprocessing/GTAOPass.js', 'postprocessing/OutputPass.js']
seen, stack = set(), list(entries)
while stack:
    f = os.path.normpath(stack.pop())
    if f in seen: continue
    seen.add(f)
    src = open(os.path.join(root, f), encoding='utf-8').read()
    for m in re.finditer(r"""(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]""", src, re.S):
        stack.append(os.path.join(os.path.dirname(f), m.group(1)))
print('\n'.join(sorted(seen)))
PY
while read -r f; do
  mkdir -p "$DEST/addons/$(dirname "$f")"
  npx --yes esbuild "package/examples/jsm/$f" --minify --format=esm --legal-comments=inline \
      --log-level=warning --outfile="$DEST/addons/$f"
done < addons.txt
cp package/LICENSE "$DEST/LICENSE"
echo "$VER" > "$DEST/VERSION"
echo "three@$VER -> $DEST"
