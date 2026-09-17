# DUPLO 1.0.0

Release stabile definitiva. Estrai lo zip: trovi una cartella **con lo stesso nome dell'archivio** (es. `DUPLO-1.0.0-win-x64`). Avvia `DUPLO.exe` / `DUPLO` **dentro quella cartella** (serve insieme a dll/pak). Non è un exe unico.

## Download

| File | Sistema |
| --- | --- |
| `DUPLO-1.0.0-win-x64.zip` | Windows 64-bit |
| `DUPLO-1.0.0-win-ia32.zip` | Windows 32-bit |
| `DUPLO-1.0.0-linux-x64.zip` | Linux 64-bit |

Confronta l’hash con `SHA256SUMS.txt`. L’eseguibile non è firmato: su Windows usa **Ulteriori informazioni → Esegui comunque**.

Linux **32-bit non è disponibile**: Electron 33 non pubblica più un runtime Linux ia32. macOS: compila su un Mac con `npm run dist:mac`.

## Cosa c’è in questa build

- Scansione duplicati: dimensione, hash SHA-256/MD5, nome, estensione, data
- Overlay drag & drop a tutta finestra (path nativo nel preload, solo cartelle)
- Menu nativo it/en, categorie file, splitter, Ricerca Avanzata, nomi simili
- Guida in-app, log persistenti, export CSV/JSON, pulizia con conferma
- Identità **DUPLO** (`DUPLO.exe`, titolo finestra, Task Manager)

Eliminazione **definitiva** (niente Cestino). Conferma sempre prima della pulizia.

Manuale: `README.md` in questo zip e pulsante **Guida** nell’app. Dettaglio: [CHANGELOG.md](../CHANGELOG.md).
