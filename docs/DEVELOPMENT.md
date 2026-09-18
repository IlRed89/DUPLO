# DUPLO — sviluppo, architettura e build

Manuale utente: [README.md](../README.md). Protocollo di release: [RELEASE-PROTOCOL.md](RELEASE-PROTOCOL.md).

## Architettura

Due processi Electron, isolati:

```
Renderer (HTML/CSS/JS)  --preload.js / contextBridge-->  Main (Node.js)
        UI, progresso, risultati                         dialoghi nativi, scan, hash, log, disco
```

Il renderer **non** ha `nodeIntegration`. Parla solo con `window.duploAPI` (canali IPC in `preload.js`).

```
DUPLO/
├── main.js                      # ciclo di vita, BrowserWindow, handler IPC
├── preload.js                   # contextBridge (API sicura verso il renderer)
├── package.json                 # dipendenze e configurazione electron-builder
├── LICENSE                      # MIT
├── README.md                    # questo file (anche extraResource nel pacchetto)
├── build/
│   ├── icon.svg                 # master vettoriale (lente + due documenti)
│   ├── icon.png                 # Linux / tray (512×512)
│   ├── icon.ico                 # Windows — OBBLIGATORIO prima di dist:win
│   └── icon.icns                # macOS
├── scripts/
│   ├── generate-icons.js        # PNG → ICO + ICNS (`npm run icons`)
│   ├── flattenWinZip.js         # ZIP: cartella omonima all'archivio (non win-unpacked)
│   └── applyWinIcon.js          # afterPack: timbra icon.ico su DUPLO.exe
└── src/
    ├── logger.js                # electron-log (console + file)
    ├── hasher.js                # crypto nativo: chunk 1 MB, poi stream SHA-256/MD5
    ├── scanner.js               # walk cross-platform, filtri, raggruppamento, matchReason
    ├── i18n.js                  # dizionari IT/EN/ES/FR (italiano default)
    ├── locales/                 # it.json, en.json, es.json, fr.json
    ├── dropFilter.js            # drop: fs.promises.stat, solo directory
    ├── fileCategories.js        # estensioni hardcoded della tendina Categoria
    ├── advancedFilters.js       # parsing formato esatto, date, KB/MB
    ├── fuzzyName.js             # similarità nomi (Levenshtein + Dice, soglia 80%)
    ├── nativeMenu.js            # menu nativo it/en/es/fr (Menu.buildFromTemplate)
    ├── readme.js                # risolve README.md in dev e nel pacchetto
    └── renderer/
        ├── index.html
        ├── styles.css           # tema, header, sidebar, bottoni
        ├── results.css          # risultati, progresso, modali, guida
        ├── renderer.js          # stato, dialoghi a tema, elenco cartelle
        ├── prefsView.js         # lingua, tema, categoria, splitter
        ├── dropView.js          # overlay drop a tutta finestra
        ├── filtersView.js       # criteri AND, Azzera Filtri / Ricerca
        ├── actionsView.js       # scan, delete, guida
        ├── renameView.js        # event delegation Rinomina + DuploDialog + IPC
        ├── appDialog.js         # DuploDialog: warning / error / confirm / prompt
        ├── resultsView.js       # gruppi sequenziali, File #N, selezione dal 2° in poi
        ├── splitterMath.js      # clamp larghezza sidebar
        └── markdown.js          # rendering del manuale in-app
```

Pipeline di scansione (tutta asincrona, non blocca l’UI):

1. Normalizzazione path (`path.resolve` / `path.join`).
2. Walk con `fs.promises` + `withFileTypes`; symlink non seguiti.
3. Bucket per dimensione/nome/estensione/data.
4. Hash parziale 1 MB solo sui bucket con ≥ 2 file.
5. Hash completo in stream da 64 KB se il parziale coincide.
6. Errori di permesso: log `warn`, si passa oltre.

---

## Sviluppo e compilazione

Requisiti: **Node.js 20 o 22**, **npm 10+**.

```bash
git clone https://github.com/IlRed89/DUPLO.git
cd DUPLO
npm install
npm test
npm start
```

| Comando | Output |
| --- | --- |
| `npm start` | App in sviluppo (`electron .`) |
| `npm test` | Test hasher, scanner, fuzzy, ZIP nominato, igiene package (niente FFmpeg), categorie, splitter, drop, menu, README |
| `npm run icons` | Rigenera `icon.ico` e `icon.icns` da `icon.png` — **esegui prima della build Windows se l’ico non c’è** |
| `npm run dist:win:x64` | ZIP Windows 64-bit (`electron-builder --win zip --x64` → `DUPLO-<versione>-win-x64.zip`) |
| `npm run dist:win:ia32` | ZIP Windows 32-bit (`electron-builder --win zip --ia32` → `DUPLO-<versione>-win-ia32.zip`) |
| `npm run dist:win` / `npm run dist` | ZIP Windows 64-bit e 32-bit insieme |
| `npm run dist:linux` | `dist/linux-unpacked/` |
| `npm run dist:mac` | `dist/mac-unpacked/` (**solo su macOS**) |

La finestra non si può rimpicciolire sotto **920×700** px (`minWidth` / `minHeight`): così header, sidebar e risultati non si sovrappongono. Il layout usa flex/grid e media query per adattarsi alle risoluzioni più strette.

Gli ZIP Windows vengono riarrotati da `scripts/flattenWinZip.js` (`archiver`, hook `afterAllArtifactBuild`): dentro l'archivio c'è una cartella **omonima allo zip** (es. `DUPLO-1.0.0-win-x64/DUPLO.exe`), **non** `win-unpacked/`.

Runtime: solo `electron-log`. `electron` / `electron-builder` / `archiver` / `resedit` / `png2icons` sono `devDependencies`. Nessun binario FFmpeg nel pacchetto.

La build Windows da Linux non firma l’exe (`signAndEditExecutable: false`). L’icona viene comunque applicata da `applyWinIcon.js`. Per firmare vedi [SmartScreen e firma del codice](#windows-smartscreen-e-firma-del-codice).

---

## Lifecycle & Release Policy (obbligatoria)

Ogni modifica, funzione, bugfix o chiusura issue **non è completa** finché non sono eseguite **tutte e quattro** le sezioni seguenti. Il lavoro si chiude solo con documentazione allineata, versione SemVer, zip Windows 32/64 bit e una **nuova GitHub Release** scaricabile.

### 1. Aggiornamento documentazione (Docs-as-Code)

- **`README.md`**: istruzioni, requisiti, architettura, tabella di compatibilità, nomi zip della versione corrente.
- **`CHANGELOG.md`**: voce `## [X.Y.Z] - YYYY-MM-DD` in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) (`Added` / `Changed` / `Fixed` / `Removed`).
- **`package.json`**: incrementare `version` (patch per bugfix, minor per feature, major per breaking).
- JSDoc + log su ogni canale IPC o metodo nuovo. Badge UI (`src/renderer/index.html`) allineato a `vX.Y.Z`.
- Note di release in `docs/RELEASE-vX.Y.Z.md` (usate dalla pipeline overlay).

Identità prodotto: **DUPLO** (`name` / `productName` / `executableName` / `app.setName` / titolo finestra / Task Manager).

### 2. Preparazione degli asset ZIP (32/64 bit)

Da Windows, Node 20/22, dopo `npm ci` e `npm run icons` se manca `build/icon.ico`:

```bash
npm run build -- --win zip --x64
npm run build -- --win zip --ia32
```

`npm run build` è l’alias di `electron-builder`. Gli ZIP Windows vengono riarrotati da `scripts/flattenWinZip.js` (`afterAllArtifactBuild`): la cartella dentro lo zip ha **lo stesso nome dell'archivio** (es. `DUPLO-1.0.0-win-x64/`), non `win-unpacked`.

File pronti in `dist/`:

| Comando | File generato (electron-builder) | Cartella unpacked di origine |
| --- | --- | --- |
| `--win zip --x64` | `dist/DUPLO-<version>-win-x64.zip` | `dist/win-unpacked/` |
| `--win zip --ia32` | `dist/DUPLO-<version>-win-ia32.zip` | `dist/win-ia32-unpacked/` |

Sulla GitHub Release i nomi pubblicati dalla pipeline overlay sono versionati. Aprendo lo zip trovi una cartella omonima:

- `DUPLO-1.0.0-win-x64.zip` → cartella `DUPLO-1.0.0-win-x64/`
- `DUPLO-1.0.0-win-ia32.zip` → cartella `DUPLO-1.0.0-win-ia32/`
- `DUPLO-1.0.0-linux-x64.zip` → cartella `DUPLO-1.0.0-linux-x64/`
- `SHA256SUMS.txt`

La release stabile è il tag `v1.0.0`. La pipeline overlay usa quegli zip come runtime Electron e aggiorna `app.asar`.

### 3. Sincronizzazione Git & tagging

Blocco sequenziale (Conventional Commits). Tipi: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

```bash
git status
git add .
git commit -m "<tipo>(scope): descrizione puntuale in formato Conventional Commits>"
git tag -a vX.Y.Z -m "Release vX.Y.Z: sintesi novità"
git push origin main
git push origin vX.Y.Z
```

Esempio per questa versione:

```bash
git status
git add .
git commit -m "chore(release): consolida DUPLO 1.0.0 stabile"
git tag -a v1.0.0 -m "Release v1.0.0: prima versione stabile DUPLO"
git push origin main
git push origin v1.0.0
```

### 4. GitHub Release

Ogni ciclo deve chiudersi con la GitHub Release `https://github.com/IlRed89/DUPLO/releases/tag/vX.Y.Z` e zip scaricabili (win x64, win ia32, linux x64). Un push su `package.json` / `README.md` / `CHANGELOG.md` / `src/**` / `main.js` / `preload.js` avvia il workflow overlay (`rebrand-asar-release.yml`), che pubblica il tag `v$(package.json version)`.

---
