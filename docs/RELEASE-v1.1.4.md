# DUPLO 1.1.4

Identità prodotto allineata su ogni file: l’applicazione si chiama **DUPLO** (`duplo` nel lockfile, `DUPLO.exe`, titolo finestra, Task Manager). Estrai lo zip e avvia `DUPLO.exe` / `DUPLO` **nella stessa cartella**.

## Download

| File | Sistema |
| --- | --- |
| `DUPLO-1.1.4-win.zip` | Windows 64-bit |
| `DUPLO-1.1.4-ia32-win.zip` | Windows 32-bit |
| `DUPLO-1.1.4-linux-x64.zip` | Linux 64-bit |

Confronta l’hash con `SHA256SUMS.txt`. L’eseguibile non è firmato: su Windows usa **Ulteriori informazioni → Esegui comunque**.

## Cosa c’è in questa build

- `app.setName('DUPLO')` e titolo finestra bloccato su `DUPLO - Trova File Duplicati`
- LICENSE, SETUP, lockfile e README aggiornati (colonna “ultimo commit” su GitHub = DUPLO)
- Drag & drop cartelle della 1.1.2 (path nativo nel preload, contatore anti-flicker, solo directory)
- Menu nativo it/en, categorie, splitter, Ricerca Avanzata, guida e log

Eliminazione **definitiva** (niente Cestino). Conferma sempre prima della pulizia.

Manuale: `README.md` nello zip e pulsante **Guida** nell’app. Dettaglio: [CHANGELOG.md](../CHANGELOG.md).
