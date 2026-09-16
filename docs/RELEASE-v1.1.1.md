# DUPLO 1.1.1

Correzione del drag & drop cartelle su Electron: `webUtils.getPathForFile`, contatore anti-flicker, validazione `fs.promises.stat` nel Main. Estrai lo zip e avvia `DUPLO.exe` / `DUPLO` **nella stessa cartella**.

## Download

| File | Sistema |
| --- | --- |
| `DUPLO-1.1.1-win.zip` | Windows 64-bit |
| `DUPLO-1.1.1-ia32-win.zip` | Windows 32-bit |
| `DUPLO-1.1.1-linux-x64.zip` | Linux 64-bit |

Confronta l’hash con `SHA256SUMS.txt`. L’eseguibile non è firmato: su Windows usa **Ulteriori informazioni → Esegui comunque**.

## Cosa c’è in questa build

- Trascina le cartelle **ovunque nella finestra** (overlay «Trascina qui le cartelle»)
- Percorso nativo via `webUtils.getPathForFile` (non più `File.path`)
- I file singoli restano ignorati (`fs.promises.stat` nel Main Process)
- Menu nativo it/en, categorie, splitter, Ricerca Avanzata, guida e log

Eliminazione **definitiva** (niente Cestino). Conferma sempre prima della pulizia.

Manuale: `README.md` nello zip e pulsante **Guida** nell’app. Dettaglio: [CHANGELOG.md](../CHANGELOG.md).
