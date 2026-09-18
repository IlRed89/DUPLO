#!/usr/bin/env bash
# Allinea package-lock, homepage, SHA256SUMS e descrizione al nome DUPLO.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-IlRed89/DUPLO}"
TAG="v1.0.0"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f package-lock.json ]]; then
  sed -i 's/"name": "dupfinder"/"name": "duplo"/g' package-lock.json
fi

gh repo edit "$REPO" \
  --description "DUPLO — Duplicate File Finder desktop (Electron / Node.js / JavaScript). Hash SHA-256/MD5." \
  --homepage "https://github.com/IlRed89/DUPLO" \
  || true

gh api -X PUT "/repos/${REPO}/topics" \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON' || true
{"names":["electron","javascript","nodejs","duplicate-files","windows"]}
JSON

tmp="$(mktemp -d)"
gh release download "$TAG" --repo "$REPO" -p "README.md" -p "SHA256SUMS.txt" -p "DUPLO-1.0.0-win.zip" -p "DUPLO-1.0.0-ia32-win.zip" -p "DUPLO-linux-x64.zip" -D "$tmp" || true
# Se gli zip sono troppo grandi per questo job, ricalcola almeno il README.
(
  cd "$tmp"
  if [[ -f README.md ]]; then
    {
      [[ -f DUPLO-1.0.0-win.zip ]] && sha256sum DUPLO-1.0.0-win.zip
      [[ -f DUPLO-1.0.0-ia32-win.zip ]] && sha256sum DUPLO-1.0.0-ia32-win.zip
      [[ -f DUPLO-linux-x64.zip ]] && sha256sum DUPLO-linux-x64.zip
      sha256sum README.md
    } > SHA256SUMS.txt
  fi
)

if [[ -f "${tmp}/SHA256SUMS.txt" ]]; then
  gh release delete-asset "$TAG" "SHA256SUMS.txt" --repo "$REPO" --yes || true
  gh release upload "$TAG" "${tmp}/SHA256SUMS.txt" --repo "$REPO" --clobber
fi

echo "Metadati DUPLO aggiornati."
