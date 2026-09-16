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
- Menu nativo italiano/inglese, guida in-app (README), log persistenti, export CSV/JSON, pulizia con conferma.
- Overlay drag & drop a tutta finestra («Trascina qui le cartelle»): path nativo nel preload con `webUtils.getPathForFile`, contatore anti-flicker, validazione cartella nel Main (`fs.promises.stat` + `isDirectory()`). I file singoli restano ignorati.
- ZIP Windows x64 e ia32 (piatti: exe e dll in radice) e ZIP Linux x64.
- Identità prodotto **DUPLO**: `name` `duplo`, `productName` / `executableName` `DUPLO`, `app.setName('DUPLO')`, titolo finestra `DUPLO - Trova File Duplicati`.

### Changed

- Runtime hashing solo con `crypto` nativo Node.js (niente FFmpeg).
- Dipendenza runtime unica: `electron-log`. `electron` / `electron-builder` restano `devDependencies`.

### Removed

- Transcodifica media / binari FFmpeg.
- Vincolo di drop al solo riquadro tratteggiato in sidebar.

[Unreleased]: https://github.com/IlRed89/DUPLO/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/IlRed89/DUPLO/releases/tag/v1.0.0
