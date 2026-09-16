# DUPLO 1.1.0

Overlay **full-window** per il drag & drop delle cartelle. Estrai lo zip e avvia `DUPLO.exe` / `DUPLO` **nella stessa cartella** (serve insieme a dll/pak).

## Download

| File | Sistema |
| --- | --- |
| `DUPLO-1.1.0-win.zip` | Windows 64-bit |
| `DUPLO-1.1.0-ia32-win.zip` | Windows 32-bit |
| `DUPLO-1.1.0-linux-x64.zip` | Linux 64-bit |

Confronta l’hash con `SHA256SUMS.txt`. L’eseguibile non è firmato: su Windows usa **Ulteriori informazioni → Esegui comunque**.

## Cosa c’è in questa build

- Trascina le cartelle **ovunque nella finestra** (overlay «Trascina qui le cartelle»)
- I file singoli restano ignorati (`fs.statSync` nel Main Process)
- Menu nativo it/en, categorie, splitter, Ricerca Avanzata, guida e log

Eliminazione **definitiva** (niente Cestino). Conferma sempre prima della pulizia.

Manuale: `README.md` nello zip e pulsante **Guida** nell’app. Dettaglio: [CHANGELOG.md](../CHANGELOG.md).
