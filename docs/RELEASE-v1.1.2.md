# DUPLO 1.1.2

Il drag & drop cartelle ora legge il path **nel preload** con `webUtils.getPathForFile` sul File nativo (il passaggio dal Renderer clonava l’oggetto e il path restava vuoto). Estrai lo zip e avvia `DUPLO.exe` / `DUPLO` **nella stessa cartella**.

## Download

| File | Sistema |
| --- | --- |
| `DUPLO-1.1.2-win.zip` | Windows 64-bit |
| `DUPLO-1.1.2-ia32-win.zip` | Windows 32-bit |
| `DUPLO-1.1.2-linux-x64.zip` | Linux 64-bit |

Confronta l’hash con `SHA256SUMS.txt`. L’eseguibile non è firmato: su Windows usa **Ulteriori informazioni → Esegui comunque**.

## Cosa c’è in questa build

- Trascina le cartelle **ovunque nella finestra** (overlay «Trascina qui le cartelle»)
- Path nativo catturato nel preload (`consumeDroppedPaths`), non più solo `File.path`
- I file singoli restano ignorati (`fs.promises.stat` nel Main Process)
- Menu nativo it/en, categorie, splitter, Ricerca Avanzata, guida e log

Eliminazione **definitiva** (niente Cestino). Conferma sempre prima della pulizia.

Manuale: `README.md` nello zip e pulsante **Guida** nell’app. Dettaglio: [CHANGELOG.md](../CHANGELOG.md).
