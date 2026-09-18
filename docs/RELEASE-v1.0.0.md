# DUPLO 1.0.0

Release stabile del **18 settembre 2026**. App desktop **Electron / Node.js / JavaScript** (non Go). Estrai lo zip: trovi una cartella **con lo stesso nome dell'archivio** (es. `DUPLO-1.0.0-win-x64`). Avvia `DUPLO.exe` / `DUPLO` **dentro quella cartella** (serve insieme a dll/pak). Non è un exe unico. Non c'è `win-unpacked`.

## Download

| File | Sistema |
| --- | --- |
| `DUPLO-1.0.0-win-x64.zip` | Windows 64-bit |
| `DUPLO-1.0.0-win-ia32.zip` | Windows 32-bit |
| `DUPLO-1.0.0-linux-x64.zip` | Linux 64-bit |
| `DUPLO-1.0.0-mac-arm64.zip` | macOS Apple Silicon |
| `DUPLO-1.0.0-mac-x64.zip` | macOS Intel |

Confronta l’hash con `SHA256SUMS.txt`. L’eseguibile non è firmato: su Windows usa **Ulteriori informazioni → Esegui comunque**. Su macOS: tasto destro → Apri.

Linux **32-bit non è disponibile**: Electron 33 non pubblica più un runtime Linux ia32.

## Cosa c’è in questa build

- Scansione duplicati: dimensione, hash SHA-256/MD5, nome, estensione, data
- Overlay drag & drop a tutta finestra (path nativo nel preload, solo cartelle)
- Menu nativo it/en/es/fr, categorie file, splitter, Ricerca Avanzata, nomi simili
- Guida in-app, log persistenti, rinomina a tema, pulizia con conferma (niente export JSON/CSV)
- Identità **DUPLO** (`DUPLO.exe`, `appId` `com.duplo.app`)

Eliminazione **definitiva** (niente Cestino). Conferma sempre prima della pulizia.

Manuale: `README.md` in questo zip e pulsante **Guida** nell’app. Dettaglio: [CHANGELOG.md](../CHANGELOG.md).
