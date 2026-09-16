# Changelog

Tutte le modifiche rilevanti a **DUPLO** sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
e il progetto adotta [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

## [1.1.0] - 2026-09-16

Overlay drag & drop a tutta finestra, documentazione allineata, nuova release scaricabile.

### Added

- Overlay full-screen `#drag-overlay` («Trascina qui le cartelle»): `position: fixed; inset: 0; z-index: 9999`.
- Listener `dragenter` / `dragover` / `dragleave` / `drop` su `window` (capture), con `preventDefault` + `stopPropagation` obbligatori per Electron.
- Log dettagliati: «Iniziato drag & drop», «Aggiunte N cartelle via drop», «Drop ignorato: non è una cartella».
- `CHANGELOG.md` e policy: ogni modifica visibile all’utente ha una **nuova GitHub Release** con zip da scaricare.
- Tabella di compatibilità Windows 64-bit / 32-bit e Linux 64-bit nel README.

### Changed

- L’area di drop non è più il solo rettangolo dell’elenco cartelle: vale **tutta la finestra**.
- Badge UI e `package.json` a **1.1.0**.
- Manuale: istruzioni di download puntano a `DUPLO-1.1.0-*.zip`.

### Fixed

- Drop che faceva navigare Electron su `file://` se `preventDefault` mancava su `dragover`.
- Overlay che spariva a metà drag perché `dragleave` scattava sui figli del document.

### Removed

- Vincolo di drop al solo riquadro tratteggiato in sidebar.

## [1.0.0] - 2026-09-14

Prima release pubblica desktop (zip unpacked, non exe singolo).

### Added

- Scansione duplicati: dimensione, hash SHA-256/MD5 a due step, nome, estensione, data.
- Filtri avanzati (estensioni, date, dimensione min/max), categorie file, nomi simili.
- Menu nativo it/en, guida in-app, log persistenti, export CSV/JSON, pulizia con conferma.
- ZIP Windows x64 e ia32, ZIP Linux x64.

### Changed

- Identità prodotto allineata a DUPLO (titolo, exe, asar, Task Manager).

### Removed

- Dipendenza FFmpeg / transcodifica media: hash solo con `crypto` nativo.
- Runtime extra oltre `electron-log`.

[Unreleased]: https://github.com/IlRed89/DUPLO/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/IlRed89/DUPLO/releases/tag/v1.1.0
[1.0.0]: https://github.com/IlRed89/DUPLO/releases/tag/v1.0.0
