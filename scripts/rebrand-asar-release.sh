#!/usr/bin/env bash
# Sovrascrive app.asar negli zip unpacked con il sorgente corrente e pubblica
# una NUOVA GitHub Release (tag = v$(package.json version)).
# I runtime Electron si scaricano dalla release base (default v1.0.0).
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-IlRed89/DUPLO}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_VER="$(node -p "require('${ROOT}/package.json').version")"
DEST_TAG="${DEST_TAG:-v${PKG_VER}}"
SOURCE_TAG="${SOURCE_TAG:-v1.0.0}"
WORKDIR="$(mktemp -d)"
TOOLS=""
ASAR_BIN=""
cleanup() {
  rm -rf "$WORKDIR"
  if [[ -n "${TOOLS}" ]]; then
    rm -rf "$TOOLS"
  fi
}
trap cleanup EXIT

cd "$ROOT"

echo "== tool isolati (niente electron dal package.json) =="
TOOLS="$(mktemp -d)"
# Directory vuota: npm non deve leggere il package.json del repo (Electron).
mkdir -p "$TOOLS"
cat > "$TOOLS/package.json" <<'JSON'
{"name":"duplo-rebrand-tools","private":true,"version":"1.0.0"}
JSON
npm install --prefix "$TOOLS" --no-fund --no-audit @electron/asar resedit

# @electron/asar >= 4 espone bin/asar.mjs, non asar.js
if [[ -f "$TOOLS/node_modules/.bin/asar" ]]; then
  ASAR_BIN="$TOOLS/node_modules/.bin/asar"
elif [[ -f "$TOOLS/node_modules/@electron/asar/bin/asar.mjs" ]]; then
  ASAR_BIN="$TOOLS/node_modules/@electron/asar/bin/asar.mjs"
elif [[ -f "$TOOLS/node_modules/@electron/asar/bin/asar.js" ]]; then
  ASAR_BIN="$TOOLS/node_modules/@electron/asar/bin/asar.js"
else
  echo "asar CLI non trovato in $TOOLS" >&2
  find "$TOOLS" -name 'asar*' -print >&2 || true
  exit 1
fi
export NODE_PATH="$TOOLS/node_modules${NODE_PATH:+:$NODE_PATH}"
echo "ASAR_BIN=$ASAR_BIN"
"$ASAR_BIN" --version || true

stamp_exe() {
  local exe="$1"
  [[ -f "$exe" ]] || return 0
  node --input-type=commonjs - "$exe" "$PKG_VER" <<'NODE'
const fs = require('fs');
const ResEdit = require('resedit');
const exePath = process.argv[2];
const version = String(process.argv[3] || '0.0.0');
const parts = version.split('.').map((n) => parseInt(n, 10) || 0);
const major = parts[0] || 0;
const minor = parts[1] || 0;
const patch = parts[2] || 0;
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
    LegalCopyright: 'Copyright © 2026 Fabio Rossi',
    FileVersion: version,
    ProductVersion: version
  };
  for (const ver of versions) {
    const langs = ver.getAllLanguagesForStringValues();
    const lang = langs && langs[0] ? langs[0] : { lang: 1033, codepage: 1200 };
    ver.setStringValues(lang, strings);
    ver.fixedInfo.fileVersionMS = (major << 16) | minor;
    ver.fixedInfo.fileVersionLS = (patch << 16) | 0;
    ver.fixedInfo.productVersionMS = (major << 16) | minor;
    ver.fixedInfo.productVersionLS = (patch << 16) | 0;
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
  "$ASAR_BIN" extract "$asar_path" "$unpacked"

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
leftover = []
for dirpath, _, files in os.walk(root):
    for name in files:
        path = os.path.join(dirpath, name)
        rel = os.path.relpath(path, root).replace('\\', '/')
        if '/node_modules/' in '/' + rel + '/' or rel.startswith('node_modules/'):
            continue
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
            text = new
        if 'dupfinder' in text.lower():
            leftover.append(rel)
print(f'[rebrand] file testo aggiornati: {count}')
if leftover:
    print('ERRORE: DupFinder ancora presente nell asar:', file=sys.stderr)
    print('\n'.join(leftover), file=sys.stderr)
    sys.exit(1)
# Controlli visibili all'utente (screenshot: titolo + h1)
html_path = os.path.join(root, 'src', 'renderer', 'index.html')
main_path = os.path.join(root, 'main.js')
html = open(html_path, encoding='utf-8').read()
main = open(main_path, encoding='utf-8').read()
if 'DupFinder' in html or '<h1>DUPLO' not in html:
    raise SystemExit('index.html non ha h1 DUPLO')
if 'DupFinder' in main or 'DUPLO' not in main:
    raise SystemExit('main.js non è rebrand DUPLO')
print('[rebrand] verifica UI: titolo/h1 DUPLO ok')
PY

  "$ASAR_BIN" pack "$unpacked" "$asar_path"
  echo "[rebrand] asar riscritto: $asar_path"
}

rebrand_zip() {
  local asset="$1"
  local dest_name="$2"
  local dest="$WORKDIR/out/$dest_name"
  mkdir -p "$WORKDIR/out" "$WORKDIR/zips/$asset" "$WORKDIR/dl"
  echo "== download $asset =="
  rm -f "$WORKDIR/dl/$asset"
  gh release download "$SOURCE_TAG" --repo "$REPO" --pattern "$asset" --dir "$WORKDIR/dl"
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
  asar="$(find "$WORKDIR/zips/$asset" -name app.asar | head -n 1 || true)"
  if [[ -z "$asar" ]]; then
    echo "app.asar non trovato in $asset" >&2
    find "$WORKDIR/zips/$asset" -maxdepth 4 -type f | head -n 40 >&2 || true
    exit 1
  fi
  overlay_asar "$asar"

  find "$WORKDIR/zips/$asset" -iname '*dupfinder*' -print || true
  while IFS= read -r exe; do
    [[ -z "$exe" ]] && continue
    dir="$(dirname "$exe")"
    if [[ "$(basename "$exe")" != "DUPLO.exe" ]]; then
      mv -f "$exe" "$dir/DUPLO.exe"
      exe="$dir/DUPLO.exe"
    fi
    stamp_exe "$exe"
  done < <(find "$WORKDIR/zips/$asset" \( -iname 'DUPLO.exe' -o -iname 'DupFinder.exe' \) -print)

  python3 - "$WORKDIR/zips/$asset" "$dest" <<'PY'
import sys, zipfile
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
echo "== overlay asar: source ${SOURCE_TAG} -> release ${DEST_TAG} (v${PKG_VER}) =="
rebrand_zip "DUPLO-1.0.0-win.zip" "DUPLO-${PKG_VER}-win.zip"
rebrand_zip "DUPLO-1.0.0-ia32-win.zip" "DUPLO-${PKG_VER}-ia32-win.zip"
rebrand_zip "DUPLO-linux-x64.zip" "DUPLO-${PKG_VER}-linux-x64.zip"

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
  sha256sum "DUPLO-${PKG_VER}-win.zip" "DUPLO-${PKG_VER}-ia32-win.zip" "DUPLO-${PKG_VER}-linux-x64.zip" > SHA256SUMS.txt
  cat SHA256SUMS.txt
)

NOTES="${ROOT}/docs/RELEASE-v${PKG_VER}.md"
if [[ ! -f "$NOTES" ]]; then
  NOTES="${ROOT}/CHANGELOG.md"
fi

if gh release view "$DEST_TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release $DEST_TAG già esistente: aggiorno gli asset"
  existing="$(gh api "/repos/${REPO}/releases/tags/${DEST_TAG}" --jq '.assets[].name')"
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    echo "Rimuovo asset precedente: $name"
    gh release delete-asset "$DEST_TAG" "$name" --repo "$REPO" --yes || true
  done <<< "$existing"
else
  echo "Creo release $DEST_TAG"
  gh release create "$DEST_TAG" --repo "$REPO" --title "DUPLO ${DEST_TAG}" --notes-file "$NOTES"
fi

gh release upload "$DEST_TAG" \
  "$WORKDIR/out/DUPLO-${PKG_VER}-win.zip" \
  "$WORKDIR/out/DUPLO-${PKG_VER}-ia32-win.zip" \
  "$WORKDIR/out/DUPLO-${PKG_VER}-linux-x64.zip" \
  "$WORKDIR/out/SHA256SUMS.txt" \
  "$ROOT/README.md" \
  "$ROOT/CHANGELOG.md" \
  --repo "$REPO"

echo "Release $DEST_TAG pubblicata con asar DUPLO ${PKG_VER}"
