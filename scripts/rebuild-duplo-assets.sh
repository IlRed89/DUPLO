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

echo "== npm ci =="
if ! npm ci; then
  echo "npm ci fallito, provo npm install"
  npm install
fi

echo "== test =="
mapfile -t tests < <(find src -name '*.test.js' | sort)
echo "Test: ${tests[*]}"
node --test "${tests[@]}"

echo "== electron-builder --win --linux =="
npx electron-builder --win --linux

DIST="${ROOT}/dist"
mkdir -p "$DIST"
ls -la "$DIST" || true

linux_unpacked=""
for candidate in "${DIST}/linux-unpacked" "${DIST}/linux-x64-unpacked"; do
  if [[ -d "$candidate" ]]; then
    linux_unpacked="$candidate"
    break
  fi
done
if [[ -z "$linux_unpacked" ]]; then
  echo "Cartella linux unpacked non trovata" >&2
  find "$DIST" -maxdepth 2 -type d >&2 || true
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

win_x64="$(pick_win_zip 0 || true)"
win_ia32="$(pick_win_zip 1 || true)"
if [[ -z "$win_x64" || -z "$win_ia32" ]]; then
  echo "ZIP Windows mancanti (x64='$win_x64' ia32='$win_ia32')" >&2
  ls -la "$DIST" >&2
  exit 1
fi

cp -f "$win_x64" "${DIST}/DUPLO-1.0.0-win.zip"
cp -f "$win_ia32" "${DIST}/DUPLO-1.0.0-ia32-win.zip"

python3 - <<'PY'
import zipfile, sys
from pathlib import Path

def ok_zip(zip_path, expected_file):
    zp = Path(zip_path)
    names = [n.replace('\\', '/') for n in zipfile.ZipFile(zip_path).namelist()]
    wrapper = zp.name[:-4] if zp.suffix.lower() == '.zip' else zp.stem
    prefix = wrapper + '/'
    if any(n.startswith('win-unpacked/') or n.startswith('win-ia32-unpacked/') or n.startswith('linux-unpacked/') for n in names):
        print(f"ERRORE: {zip_path} contiene win-unpacked. entries={names[:40]}", file=sys.stderr)
        sys.exit(1)
    if not any(n == prefix + expected_file or n.endswith('/' + expected_file) for n in names):
        print(f"ERRORE: {zip_path} non contiene {prefix}{expected_file}. entries={names[:40]}", file=sys.stderr)
        sys.exit(1)
    leftover = [n for n in names if "dupfinder" in n.lower()]
    if leftover:
        print(f"ERRORE: {zip_path} contiene ancora DupFinder: {leftover}", file=sys.stderr)
        sys.exit(1)
    print(f"OK {zip_path} → {prefix}{expected_file}")

ok_zip("dist/DUPLO-1.0.0-win.zip", "DUPLO.exe")
ok_zip("dist/DUPLO-1.0.0-ia32-win.zip", "DUPLO.exe")
ok_zip("dist/DUPLO-linux-x64.zip", "DUPLO")
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
