#!/usr/bin/env bash
# Aggiorna titolo, note e asset della release v1.0.0 al nome DUPLO.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-IlRed89/DUPLO}"
TAG="v1.0.0"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

gh release edit "$TAG" --repo "$REPO" \
  --title "DUPLO v1.0.0" \
  --notes-file "docs/RELEASE-v1.0.0.md"

rename_asset() {
  local old_name="$1"
  local new_name="$2"
  local id
  id="$(gh api "/repos/${REPO}/releases/tags/${TAG}" --jq ".assets[] | select(.name==\"${old_name}\") | .id" || true)"
  if [[ -n "${id}" ]]; then
    echo "Rinomino asset ${old_name} (#${id}) → ${new_name}"
    gh api -X PATCH "/repos/${REPO}/releases/assets/${id}" -f name="${new_name}" >/dev/null
  else
    echo "Asset ${old_name} non trovato (già rinominato?)"
  fi
}

rename_asset "DupFinder-windows-x64.zip" "DUPLO-1.0.0-win.zip"
rename_asset "DupFinder-windows-ia32.zip" "DUPLO-1.0.0-ia32-win.zip"
rename_asset "DupFinder-linux-x64.zip" "DUPLO-linux-x64.zip"

tmp_dir="$(mktemp -d)"
gh release download "$TAG" --repo "$REPO" -p "SHA256SUMS.txt" -D "$tmp_dir" || true
if [[ -f "${tmp_dir}/SHA256SUMS.txt" ]]; then
  sed -i \
    -e 's/DupFinder-windows-x64\.zip/DUPLO-1.0.0-win.zip/g' \
    -e 's/DupFinder-windows-ia32\.zip/DUPLO-1.0.0-ia32-win.zip/g' \
    -e 's/DupFinder-linux-x64\.zip/DUPLO-linux-x64.zip/g' \
    -e 's/DupFinder\.exe/DUPLO.exe/g' \
    -e 's/DupFinder/DUPLO/g' \
    "${tmp_dir}/SHA256SUMS.txt"
  gh release delete-asset "$TAG" "SHA256SUMS.txt" --repo "$REPO" --yes || true
  gh release upload "$TAG" "${tmp_dir}/SHA256SUMS.txt" --repo "$REPO" --clobber
fi

gh release delete-asset "$TAG" "README.md" --repo "$REPO" --yes || true
gh release upload "$TAG" "${ROOT}/README.md" --repo "$REPO" --clobber

gh api -X PATCH "/repos/${REPO}" \
  -f description="DUPLO — trova e pulisce file duplicati (Electron, hash SHA-256/MD5)." \
  -f homepage="https://github.com/IlRed89/DUPLO" \
  || true

echo "Release ${TAG} rinominata in DUPLO."
