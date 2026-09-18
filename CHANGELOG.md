# Changelog

Tutte le modifiche rilevanti a **DUPLO** sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
e il progetto adotta [Semantic Versioning](https://semver.org/lang/it/).

Release stabile unica: **1.0.0**. Stack: **Electron / Node.js / JavaScript** (nessun Go, nessun FFmpeg).

## [1.0.0] - 2026-09-18

Prima release stabile pubblica. Applicazione **desktop Electron** (cartella unpacked, non un exe singolo).

### Added

- Scansione duplicati per dimensione, contenuto (hash SHA-256 o MD5 a due step con `crypto` nativo), nome, estensione e data di modifica.
- Criteri cumulativi in **intersezione (AND)**: un cluster esiste solo se i file soddisfano tutti i parametri spuntati; badge in intestazione senza dicitura tecnica «AND».
- Filtri avanzati: formato esatto, intervallo date, dimensione min/max, categorie file, file nascosti.
- Ricerca **Nomi Simili (Fuzzy)** (Levenshtein + Dice, soglia 80%).
- Overlay drag & drop a tutta finestra: path nativo nel preload (`webUtils.getPathForFile`), solo cartelle.
- UI e menu nativo in italiano (default), inglese, spagnolo e francese (`src/locales/`).
- Tema chiaro/scuro (`[data-theme]`) persistito in `localStorage` e allineato a `nativeTheme.themeSource`.
- Modali a tema (warning / error / confirm / **prompt di rinomina**): niente `alert()` / `confirm()` / `prompt()` nativi.
- Risultati sezionati per criteri, gruppi sequenziali **Gruppo 1..N** (size desc), file **File #1, #2, #3…** (mtime), selezione «dal 2° in poi».
- Rinomina IPC (`rename-file`): event delegation su `#resultsScrollContainer`, retry `EBUSY`, stream hash chiusi prima del resolve.
- Guida in-app (README), log persistenti (`electron-log`), pulizia con conferma a tema.
- ZIP Windows **x64** e **ia32** e ZIP Linux x64. Dentro lo zip una sola cartella omonima all'archivio (`DUPLO-1.0.0-win-x64/`), **non** `win-unpacked`.
- Identità prodotto **DUPLO**: `name` `duplo`, `productName` / `executableName` `DUPLO`.

### Changed

- Runtime hashing solo con `crypto` Node.js.
- Dipendenza runtime unica: `electron-log`. `electron` / `electron-builder` in `devDependencies`.
- «Azzera Filtri» (parametri) e «Azzera Ricerca» (risultati) sono comandi distinti; all'avvio nessun criterio è spuntato.
- Statistiche: etichetta **Dimensione** (non «Spreco»).
- Path dei duplicati a scorrimento orizzontale; path cliccabile (niente pulsante «Apri percorso» ridondante).

### Fixed

- Toggle «Seleziona dal 2° in poi» a due vie.
- `groupId` assegnato **dopo** l'ordinamento (niente salti 1, 4, 7).
- Stream `fs.createReadStream` distrutti e Promise hash risolta solo dopo `close` (niente `EBUSY` in rinomina su Windows).
- Input vuoti intercettati a monte (niente `UnhandledPromiseRejection`).

### Removed

- Transcodifica media / binari FFmpeg.
- Export JSON/CSV (tasti e metodi).
- Etichette «Originale» / «Duplicato».
- Topic GitHub spuri (`golang`) e qualsiasi stack diverso da Electron/JavaScript.

[1.0.0]: https://github.com/IlRed89/DUPLO/releases/tag/v1.0.0
