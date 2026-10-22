#!/usr/bin/env bash
# HPLC modelini Blender betiğinden üretir ve web için sıkıştırır.
#   tools/blender/build-model.sh [--render önizleme.png]
# Gereksinimler:
#   - Blender Python modülü:  python3 -m venv .venv-bpy && .venv-bpy/bin/pip install bpy
#     (veya Blender ikilisi:  BLENDER=blender; betik "--" sonrasındaki argümanları okur)
#   - gltf-transform CLI:     npx --yes @gltf-transform/cli@4 (otomatik indirilir)
# Çıktı: assets/models/hplc-system.glb (EXT_meshopt_compression + KHR_mesh_quantization)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PY="${BPY_PYTHON:-$ROOT/.venv-bpy/bin/python}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [[ -n "${BLENDER:-}" ]]; then
  "$BLENDER" -b --python "$ROOT/tools/blender/build_hplc.py" -- --out "$TMP/raw.glb" "$@"
else
  "$PY" "$ROOT/tools/blender/build_hplc.py" --out "$TMP/raw.glb" "$@"
fi
npx --yes @gltf-transform/cli@4 meshopt "$TMP/raw.glb" "$ROOT/assets/models/hplc-system.glb" --level medium
ls -la "$ROOT/assets/models/hplc-system.glb"
