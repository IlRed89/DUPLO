#!/usr/bin/env bash
# Sovrascrive app.asar negli zip unpacked con il sorgente corrente e pubblica
# la GitHub Release tag = v$(package.json version).
# Ogni zip prodotto ha una cartella radice omonima all'archivio
# (DUPLO-x.y.z-win-x64/), mai win-unpacked/.
# I runtime Electron si scaricano dalla release sorgente più recente disponibile
# (v1.1.x oppure v1.0.0). Con HOUSEKEEPING=1 elimina i tag 1.1.x e ricrea v1.0.0.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-IlRed89/DUPLO}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_VER="$(node -p "require('${ROOT}/package.json').version")"
DEST_TAG="${DEST_TAG:-v${PKG_VER}}"
SOURCE_TAG="${SOURCE_TAG:-auto}"
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
  if ! gh release download "$SOURCE_TAG" --repo "$REPO" --pattern "$asset" --dir "$WORKDIR/dl"; then
    echo "Asset $asset assente su $SOURCE_TAG, provo nomi legacy" >&2
    return 1
  fi
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

extracted, out = Path(sys.argv[1]), Path(sys.argv[2])
wrapper = out.name[:-4] if out.name.lower().endswith('.zip') else out.stem


def payload_root(base: Path) -> Path:
    """Directory che contiene DUPLO.exe / DUPLO, anche se lo zip sorgente era piatto o win-unpacked/."""
    candidates = []
    for path in base.rglob('*'):
        if path.is_file() and path.name in ('DUPLO.exe', 'DUPLO'):
            candidates.append(path)
    if not candidates:
        return base
    candidates.sort(key=lambda p: len(p.parts))
    return candidates[0].parent


root = payload_root(extracted)
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for path in sorted(root.rglob('*')):
        if path.is_file():
            rel = path.relative_to(root).as_posix()
            z.write(path, f'{wrapper}/{rel}')
print('scritto', out, 'byte', out.stat().st_size, 'cartella', wrapper + '/')
PY
}

mkdir -p "$WORKDIR/dl"

resolve_source_tag() {
  if [[ -n "${SOURCE_TAG:-}" && "${SOURCE_TAG}" != "auto" ]]; then
    echo "[rebrand] SOURCE_TAG forzato: $SOURCE_TAG"
    return 0
  fi
  local candidate
  for candidate in v1.1.4 v1.1.3 v1.1.2 v1.1.1 v1.1.0 v1.0.0; do
    if gh release view "$candidate" --repo "$REPO" >/dev/null 2>&1; then
      SOURCE_TAG="$candidate"
      echo "[rebrand] SOURCE_TAG automatico: $SOURCE_TAG"
      return 0
    fi
  done
  echo "ERRORE: nessuna GitHub Release sorgente con zip Electron" >&2
  exit 1
}

delete_release_and_tag() {
  local tag="$1"
  echo "[housekeeping] Elimino release/tag $tag"
  gh release delete "$tag" --repo "$REPO" -y --cleanup-tag 2>/dev/null || \
    gh release delete "$tag" --repo "$REPO" -y 2>/dev/null || true
  gh api -X DELETE "/repos/${REPO}/git/refs/tags/${tag}" >/dev/null 2>&1 || true
}

housekeeping_delete_obsolete() {
  local tag
  echo "[housekeeping] Elimino le release intermedie; DEST ${DEST_TAG} verrà ricreata"
  for tag in v1.1.0 v1.1.1 v1.1.2 v1.1.3 v1.1.4; do
    if [[ "$tag" == "$DEST_TAG" ]]; then
      continue
    fi
    delete_release_and_tag "$tag"
  done
  if [[ "${RECREATE_DEST:-1}" == "1" ]]; then
    delete_release_and_tag "$DEST_TAG"
  fi
}

try_rebrand_zip() {
  local dest_name="$1"
  shift
  local pattern
  for pattern in "$@"; do
    echo "[rebrand] provo source asset $pattern"
    if rebrand_zip "$pattern" "$dest_name"; then
      return 0
    fi
    echo "[rebrand] $pattern non disponibile su $SOURCE_TAG"
  done
  echo "ERRORE: nessun asset sorgente per $dest_name" >&2
  exit 1
}

resolve_source_tag
SRC_VER="${SOURCE_TAG#v}"
echo "== overlay asar: source ${SOURCE_TAG} -> release ${DEST_TAG} (v${PKG_VER}) =="

try_rebrand_zip "DUPLO-${PKG_VER}-win-x64.zip" \
  "DUPLO-${SRC_VER}-win-x64.zip" \
  "DUPLO-${SRC_VER}-win.zip" \
  "DUPLO-1.0.0-win.zip" \
  "DUPLO-1.0.0-win-x64.zip"

try_rebrand_zip "DUPLO-${PKG_VER}-win-ia32.zip" \
  "DUPLO-${SRC_VER}-win-ia32.zip" \
  "DUPLO-${SRC_VER}-ia32-win.zip" \
  "DUPLO-1.0.0-ia32-win.zip" \
  "DUPLO-1.0.0-win-ia32.zip"

try_rebrand_zip "DUPLO-${PKG_VER}-linux-x64.zip" \
  "DUPLO-${SRC_VER}-linux-x64.zip" \
  "DUPLO-linux-x64.zip" \
  "DUPLO-1.0.0-linux-x64.zip"


python3 - "$WORKDIR/out" <<'PY'
import sys, zipfile
from pathlib import Path
out = Path(sys.argv[1])
for zp in out.glob('*.zip'):
    names = zipfile.ZipFile(zp).namelist()
    leftover = [n for n in names if 'dupfinder' in n.lower()]
    if leftover:
        raise SystemExit(f'ERRORE {zp.name} path DupFinder: {leftover}')
    wrapper = zp.name[:-4] if zp.name.lower().endswith('.zip') else zp.stem
    prefix = wrapper.replace('\\', '/') + '/'
    normalized = [n.replace('\\', '/') for n in names]
    if any(n.startswith('win-unpacked/') or n.startswith('win-ia32-unpacked/') or n.startswith('linux-unpacked/') for n in normalized):
        raise SystemExit(f'ERRORE {zp.name} contiene ancora win-unpacked/linux-unpacked: {normalized[:12]}')
    if not any(n == prefix or n.startswith(prefix) for n in normalized):
        raise SystemExit(f'ERRORE {zp.name} senza cartella {wrapper}/: {normalized[:12]}')
    print('OK path', zp.name, 'cartella', wrapper + '/')
PY

(
  cd "$WORKDIR/out"
  sha256sum "DUPLO-${PKG_VER}-win-x64.zip" "DUPLO-${PKG_VER}-win-ia32.zip" "DUPLO-${PKG_VER}-linux-x64.zip" > SHA256SUMS.txt
  cat SHA256SUMS.txt
)

NOTES="${ROOT}/docs/RELEASE-v${PKG_VER}.md"
if [[ ! -f "$NOTES" ]]; then
  NOTES="${ROOT}/CHANGELOG.md"
fi

if [[ "${HOUSEKEEPING:-1}" == "1" ]]; then
  housekeeping_delete_obsolete
fi

TARGET_COMMIT="${GITHUB_SHA:-}"
CREATE_ARGS=(
  "$DEST_TAG"
  --repo "$REPO"
  --title "DUPLO ${DEST_TAG}"
  --notes-file "$NOTES"
)
if [[ -n "$TARGET_COMMIT" ]]; then
  CREATE_ARGS+=(--target "$TARGET_COMMIT")
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
  gh release create "${CREATE_ARGS[@]}"
fi

gh release upload "$DEST_TAG" \
  "$WORKDIR/out/DUPLO-${PKG_VER}-win-x64.zip" \
  "$WORKDIR/out/DUPLO-${PKG_VER}-win-ia32.zip" \
  "$WORKDIR/out/DUPLO-${PKG_VER}-linux-x64.zip" \
  "$WORKDIR/out/SHA256SUMS.txt" \
  "$ROOT/README.md" \
  "$ROOT/CHANGELOG.md" \
  --repo "$REPO"

echo "Release $DEST_TAG pubblicata con asar DUPLO ${PKG_VER}"
