# Changelog

Tutte le modifiche rilevanti a **DUPLO** sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
e il progetto adotta [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

## [1.0.0] - 2026-09-16

Prima release stabile pubblica. Applicazione desktop Electron (cartella unpacked, non un exe singolo).

### Added

- Scansione duplicati per dimensione, contenuto (hash SHA-256 o MD5 a due step), nome, estensione e data di modifica.
- Filtri avanzati: estensioni, intervallo date, dimensione min/max, categorie file, nomi simili.
- Menu nativo e UI in italiano (default), inglese, spagnolo e francese; dizionari in `src/locales/`. Cambio lingua immediato sul DOM + IPC per i menu nativi; preferenza in `localStorage`.
- Tema chiaro/scuro con variabili CSS (`--bg-primary`, `--text-primary`, `--accent-color`, …) persistito in `localStorage` e allineato a `nativeTheme.themeSource`.
- Risultati nel pannello destro sezionati per criterio di rilevamento (`matchReason`: hash, size, name, fuzzy), sezioni collassabili, checkbox, Apri percorso, Rinomina.
- Menu nativo italiano/inglese/spagnolo/francese, guida in-app (README), log persistenti, export CSV/JSON, pulizia con conferma.
- Overlay drag & drop a tutta finestra («Trascina qui le cartelle»): path nativo nel preload con `webUtils.getPathForFile`, contatore anti-flicker, validazione cartella nel Main (`fs.promises.stat` + `isDirectory()`). I file singoli restano ignorati.
- ZIP Windows x64 e ia32 e ZIP Linux x64. Dentro ogni archivio la cartella ha **lo stesso nome dello zip** (es. `DUPLO-1.0.0-win-x64/`), non `win-unpacked`.
- Identità prodotto **DUPLO**: `name` `duplo`, `productName` / `executableName` `DUPLO`, `app.setName('DUPLO')`, titolo finestra `DUPLO - Trova File Duplicati`.

### Changed

- Runtime hashing solo con `crypto` nativo Node.js (niente FFmpeg).
- Dipendenza runtime unica: `electron-log`. `electron` / `electron-builder` restano `devDependencies`.
- Code audit e snellimento dei sorgenti (Main, Preload, Renderer, CSS): JSDoc capillare, commenti sul *perché* (hash a due step, fuzzy, contatore anti-flicker, splitter, path/permessi OS), utility `formatBytes` unificata tra export CSV e statistiche UI.
- Zip di release: cartella interna omonima all'archivio (`DUPLO-1.0.0-win-x64`, `DUPLO-1.0.0-win-ia32`, `DUPLO-1.0.0-linux-x64`) al posto di `win-unpacked`.

### Fixed

- Gli stream di hashing (`fs.createReadStream`) chiudono e `destroy()` il descriptor su `error`, `end` e `close`, per evitare file lockati su Windows (EBUSY).
- Input vuoti (path, cartelle, date non impostate) intercettati a monte: niente `UnhandledPromiseRejection` su IPC `scan:start` / hash / delete. Un path di soli spazi non viene più risolto come directory corrente (`path.resolve('')`).
- Dopo il raggruppamento preliminare l'array piatto dei file candidati viene rilasciato: in RAM restano solo i bucket con ≥ 2 elementi.
- IPC request/response su `ipcMain.handle` + `invoke` (lingua inclusa). Restano push Main→Renderer solo `scan:progress` e `menu:open-guide`; `log:renderer` resta fire-and-forget.

### Removed

- Transcodifica media / binari FFmpeg.
- Vincolo di drop al solo riquadro tratteggiato in sidebar.
- Canali IPC morti `file:move` e `open-file-location` (duplicato di `shell:show-item`).
- Classi CSS non referenziate (`.folder-list.is-drop-target`, `.group-hash`, `.file-actions`) e classe HTML residua `folder-dropzone`.

[Unreleased]: https://github.com/IlRed89/DUPLO/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/IlRed89/DUPLO/releases/tag/v1.0.0
