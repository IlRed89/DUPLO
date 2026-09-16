#!/usr/bin/env bash
# Sovrascrive app.asar negli zip della release v1.0.0 con il sorgente DUPLO
# (titolo finestra, h1, menu, logger). Poi ritimbra ProductName sull'exe.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-IlRed89/DUPLO}"
TAG="v1.0.0"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="$(mktemp -d)"
ASAR_BIN=""
trap 'rm -rf "$WORKDIR"' EXIT

cd "$ROOT"

echo "== install @electron/asar + resedit =="
npm install --no-save --no-package-lock @electron/asar resedit
ASAR_BIN="$(node -p "require.resolve('@electron/asar/bin/asar.js')")"

stamp_exe() {
  local exe="$1"
  [[ -f "$exe" ]] || return 0
  node --input-type=commonjs - "$exe" <<'NODE'
const fs = require('fs');
const ResEdit = require('resedit');
const exePath = process.argv[2];
try {
  const binary = fs.readFileSync(exePath);
  const exe = ResEdit.NtExecutable.from(binary, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const versions = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const strings = {
    FileDescription: 'DUPLO',
    ProductName: 'DUPLO',
    InternalName: 'DUPLO',
    OriginalFilename: 'DUPLO.exe',
    CompanyName: 'Fabio Rossi',
    LegalCopyright: 'Copyright © 2026 Fabio Rossi'
  };
  for (const ver of versions) {
    const langs = ver.getAllLanguagesForStringValues();
    const lang = langs && langs[0] ? langs[0] : { lang: 1033, codepage: 1200 };
    ver.setStringValues(lang, strings);
    ver.fixedInfo.fileVersionMS = (1 << 16) | 0;
    ver.fixedInfo.fileVersionLS = (0 << 16) | 0;
    ver.fixedInfo.productVersionMS = (1 << 16) | 0;
    ver.fixedInfo.productVersionLS = (0 << 16) | 0;
    ver.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('[rebrand] VERSIONINFO DUPLO su', exePath);
} catch (err) {
  console.warn('[rebrand] VERSIONINFO skip:', err.message);
}
NODE
}

overlay_asar() {
  local asar_path="$1"
  local unpacked="$WORKDIR/asar-$(basename "$(dirname "$asar_path")")"
  rm -rf "$unpacked"
  mkdir -p "$unpacked"
  node "$ASAR_BIN" extract "$asar_path" "$unpacked"

  cp -f "$ROOT/main.js" "$unpacked/main.js"
  cp -f "$ROOT/preload.js" "$unpacked/preload.js"
  cp -f "$ROOT/package.json" "$unpacked/package.json"
  [[ -f "$ROOT/README.md" ]] && cp -f "$ROOT/README.md" "$unpacked/README.md"
  rm -rf "$unpacked/src"
  cp -a "$ROOT/src" "$unpacked/src"
  find "$unpacked/src" -name '*.test.js' -delete

  python3 - "$unpacked" <<'PY'
import os, sys
root = sys.argv[1]
skip_ext = {'.png', '.ico', '.icns', '.woff', '.woff2', '.ttf', '.bin', '.node', '.dll', '.exe', '.pak', '.dat'}
count = 0
for dirpath, _, files in os.walk(root):
    for name in files:
        path = os.path.join(dirpath, name)
        ext = os.path.splitext(name)[1].lower()
        if ext in skip_ext:
            continue
        try:
            data = open(path, 'rb').read()
        except OSError:
            continue
        if b'\0' in data[:2048]:
            continue
        try:
            text = data.decode('utf-8')
        except UnicodeDecodeError:
            continue
        new = (text
            .replace('DupFinder', 'DUPLO')
            .replace('dupFinder', 'DUPLO')
            .replace('DUPFINDER', 'DUPLO')
            .replace('dupfinder', 'duplo'))
        if new != text:
            open(path, 'w', encoding='utf-8', newline='\n').write(new)
            count += 1
print(f'[rebrand] file testo aggiornati: {count}')
PY

  leftover="$(grep -RIl -i 'dupfinder' "$unpacked" --include='*.js' --include='*.html' --include='*.json' --include='*.css' --include='*.md' | grep -v node_modules || true)"
  if [[ -n "$leftover" ]]; then
    echo "ERRORE: DupFinder ancora presente nell asar:" >&2
    echo "$leftover" >&2
    exit 1
  fi

  node "$ASAR_BIN" pack "$unpacked" "$asar_path"
  echo "[rebrand] asar riscritto: $asar_path"
}

rebrand_zip() {
  local asset="$1"
  local dest="$WORKDIR/out/$asset"
  mkdir -p "$WORKDIR/out" "$WORKDIR/zips/$asset"
  echo "== download $asset =="
  gh release download "$TAG" --repo "$REPO" --pattern "$asset" --dir "$WORKDIR/dl"
  python3 - "$WORKDIR/dl/$asset" "$WORKDIR/zips/$asset" <<'PY'
import sys, zipfile
from pathlib import Path
src, dest = sys.argv[1], sys.argv[2]
Path(dest).mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(src) as z:
    names = z.namelist()
    z.extractall(dest)
print('estratti', len(names), 'file')
PY

  local asar
  asar="$(find "$WORKDIR/zips/$asset" -name app.asar | head -n 1)"
  if [[ -z "$asar" ]]; then
    echo "app.asar non trovato in $asset" >&2
    find "$WORKDIR/zips/$asset" -maxdepth 3 -type f | head >&2
    exit 1
  fi
  overlay_asar "$asar"

  find "$WORKDIR/zips/$asset" -iname '*dupfinder*' -print
  find "$WORKDIR/zips/$asset" \( -iname 'DUPLO.exe' -o -iname 'DupFinder.exe' \) -print | while read -r exe; do
    dir="$(dirname "$exe")"
    if [[ "$(basename "$exe")" != "DUPLO.exe" ]]; then
      mv -f "$exe" "$dir/DUPLO.exe"
      exe="$dir/DUPLO.exe"
    fi
    stamp_exe "$exe"
  done

  python3 - "$WORKDIR/zips/$asset" "$dest" <<'PY'
import os, sys, zipfile
from pathlib import Path
root, out = Path(sys.argv[1]), Path(sys.argv[2])
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for path in sorted(root.rglob('*')):
        if path.is_file():
            z.write(path, path.relative_to(root).as_posix())
print('scritto', out, 'byte', out.stat().st_size)
PY
}

mkdir -p "$WORKDIR/dl"
rebrand_zip "DUPLO-1.0.0-win.zip"
rebrand_zip "DUPLO-1.0.0-ia32-win.zip"
rebrand_zip "DUPLO-linux-x64.zip"

python3 - "$WORKDIR/out" <<'PY'
import sys, zipfile
from pathlib import Path
out = Path(sys.argv[1])
for zp in out.glob('*.zip'):
    names = zipfile.ZipFile(zp).namelist()
    leftover = [n for n in names if 'dupfinder' in n.lower()]
    if leftover:
        raise SystemExit(f'ERRORE {zp.name} path DupFinder: {leftover}')
    print('OK path', zp.name)
PY

(
  cd "$WORKDIR/out"
  sha256sum DUPLO-1.0.0-win.zip DUPLO-1.0.0-ia32-win.zip DUPLO-linux-x64.zip > SHA256SUMS.txt
)

existing="$(gh api "/repos/${REPO}/releases/tags/${TAG}" --jq '.assets[].name')"
while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  case "$name" in
    DUPLO-1.0.0-win.zip|DUPLO-1.0.0-ia32-win.zip|DUPLO-linux-x64.zip|SHA256SUMS.txt|README.md)
      echo "Rimuovo asset precedente: $name"
      gh release delete-asset "$TAG" "$name" --repo "$REPO" --yes || true
      ;;
  esac
done <<< "$existing"

gh release upload "$TAG" \
  "$WORKDIR/out/DUPLO-1.0.0-win.zip" \
  "$WORKDIR/out/DUPLO-1.0.0-ia32-win.zip" \
  "$WORKDIR/out/DUPLO-linux-x64.zip" \
  "$WORKDIR/out/SHA256SUMS.txt" \
  "$ROOT/README.md" \
  --repo "$REPO"

echo "Release $TAG aggiornata con asar DUPLO"
