#!/usr/bin/env bash
# Ricompila gli zip DUPLO e sostituisce gli asset della release v1.0.0.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-IlRed89/DUPLO}"
TAG="v1.0.0"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f package-lock.json ]]; then
  sed -i 's/"name": "dupfinder"/"name": "duplo"/g' package-lock.json
fi

npm ci
npm test
npx electron-builder --win --linux

DIST="${ROOT}/dist"
mkdir -p "$DIST"

linux_unpacked=""
for candidate in "${DIST}/linux-unpacked" "${DIST}/linux-x64-unpacked"; do
  if [[ -d "$candidate" ]]; then
    linux_unpacked="$candidate"
    break
  fi
done
if [[ -z "$linux_unpacked" ]]; then
  echo "Cartella linux unpacked non trovata" >&2
  ls -la "$DIST" >&2 || true
  exit 1
fi
node -e "require('./scripts/flattenWinZip').writeFlatZip(process.argv[1], process.argv[2])" \
  "$linux_unpacked" "${DIST}/DUPLO-linux-x64.zip"

pick_win_zip() {
  local want_ia32="$1"
  local f
  shopt -s nullglob
  for f in "${DIST}"/*.zip; do
    local base
    base="$(basename "$f")"
    [[ "$base" == DUPLO-linux-x64.zip ]] && continue
    if [[ "$want_ia32" == "1" ]]; then
      if [[ "$base" == *ia32* ]]; then
        echo "$f"
        return 0
      fi
    else
      if [[ "$base" != *ia32* && "$base" == *[Ww]in* ]]; then
        echo "$f"
        return 0
      fi
    fi
  done
  return 1
}

win_x64="$(pick_win_zip 0)"
win_ia32="$(pick_win_zip 1)"
[[ -n "$win_x64" ]] || { echo "ZIP Windows x64 assente"; ls -la "$DIST"; exit 1; }
[[ -n "$win_ia32" ]] || { echo "ZIP Windows ia32 assente"; ls -la "$DIST"; exit 1; }

cp -f "$win_x64" "${DIST}/DUPLO-1.0.0-win.zip"
cp -f "$win_ia32" "${DIST}/DUPLO-1.0.0-ia32-win.zip"

python3 - <<'PY'
import zipfile, sys
checks = {
    "dist/DUPLO-1.0.0-win.zip": "DUPLO.exe",
    "dist/DUPLO-1.0.0-ia32-win.zip": "DUPLO.exe",
    "dist/DUPLO-linux-x64.zip": "DUPLO",
}
for zip_path, expected in checks.items():
    names = zipfile.ZipFile(zip_path).namelist()
    if expected not in names:
        print(f"ERRORE: {zip_path} non contiene {expected}. entries={names[:40]}", file=sys.stderr)
        sys.exit(1)
    leftover = [n for n in names if "dupfinder" in n.lower()]
    if leftover:
        print(f"ERRORE: {zip_path} contiene ancora DupFinder: {leftover}", file=sys.stderr)
        sys.exit(1)
    print(f"OK {zip_path} → {expected}")
PY

(
  cd "$DIST"
  sha256sum DUPLO-1.0.0-win.zip DUPLO-1.0.0-ia32-win.zip DUPLO-linux-x64.zip > SHA256SUMS.txt
  sha256sum "${ROOT}/README.md" | awk '{print $1"  README.md"}' >> SHA256SUMS.txt
)

existing="$(gh api "/repos/${REPO}/releases/tags/${TAG}" --jq '.assets[].name')"
while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  echo "Rimuovo asset precedente: $name"
  gh release delete-asset "$TAG" "$name" --repo "$REPO" --yes || true
done <<< "$existing"

gh release upload "$TAG" \
  "${DIST}/DUPLO-1.0.0-win.zip" \
  "${DIST}/DUPLO-1.0.0-ia32-win.zip" \
  "${DIST}/DUPLO-linux-x64.zip" \
  "${DIST}/SHA256SUMS.txt" \
  "${ROOT}/README.md" \
  --repo "$REPO"

gh release edit "$TAG" --repo "$REPO" \
  --title "DUPLO v1.0.0" \
  --notes-file "docs/RELEASE-v1.0.0.md"

echo "Asset DUPLO pubblicati sulla release ${TAG}."
