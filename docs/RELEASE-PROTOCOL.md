# Protocollo permanente: Docs, Git e GitHub Releases

Ogni modifica, bugfix o chiusura issue di **DUPLO** non è completa senza le quattro sezioni seguenti. Identità prodotto: **DUPLO** (non DupFinder).

## 1. Documentazione (Docs-as-Code)

- `README.md`: istruzioni, requisiti, architettura, tabella di compatibilità, nomi zip della versione.
- `CHANGELOG.md`: `## [X.Y.Z] - YYYY-MM-DD` in Keep a Changelog (`Added` / `Changed` / `Fixed` / `Removed`).
- `package.json`: bump SemVer (`version`). Patch = bugfix, minor = feature.
- Badge UI `src/renderer/index.html` allineato a `vX.Y.Z`.
- Note in `docs/RELEASE-vX.Y.Z.md`.

## 2. Asset ZIP 32/64 bit (senza cartelle intermedie)

Da Windows, Node 20/22, dopo `npm ci` (e `npm run icons` se manca `build/icon.ico`):

```bash
npm run build -- --win zip --x64
npm run build -- --win zip --ia32
```

`npm run build` è `electron-builder`. `scripts/flattenWinZip.js` produce zip **piatti** (exe e dll in radice).

| Comando | File in `dist/` | Unpacked |
| --- | --- | --- |
| `--win zip --x64` | `dist/DUPLO-<version>-win-x64.zip` | `dist/win-unpacked/` |
| `--win zip --ia32` | `dist/DUPLO-<version>-win-ia32.zip` | `dist/win-ia32-unpacked/` |

Nomi sulla GitHub Release (pipeline overlay, non sovrascrivere `v1.0.0`):

- `DUPLO-1.1.3-win.zip`
- `DUPLO-1.1.3-ia32-win.zip`
- `DUPLO-1.1.3-linux-x64.zip`
- `SHA256SUMS.txt`

## 3. Git e tagging

```bash
git status
git add .
git commit -m "<tipo>(scope): descrizione puntuale in formato Conventional Commits>"
git tag -a vX.Y.Z -m "Release vX.Y.Z: sintesi novità"
git push origin main
git push origin vX.Y.Z
```

Esempio 1.1.3:

```bash
git status
git add .
git commit -m "docs(release): protocollo permanente Docs-as-Code Git e GitHub Releases"
git tag -a v1.1.3 -m "Release v1.1.3: protocollo permanente Docs, Git e GitHub Releases"
git push origin main
git push origin v1.1.3
```

## 4. GitHub Release

Chiudere il ciclo con `https://github.com/IlRed89/DUPLO/releases/tag/vX.Y.Z` e zip scaricabili. Un push su `package.json` / `README.md` / `CHANGELOG.md` / `src/**` avvia `rebrand-asar-release.yml` (`DEST_TAG=v$(version)`).
