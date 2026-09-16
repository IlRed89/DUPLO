# DUPLO 1.0.0

Applicazione desktop Electron per trovare ed eliminare file duplicati (dimensione, hash SHA-256/MD5 a due step, nome, estensione, data).

## Download

**Non è un exe unico.** Estrai lo zip e avvia `DUPLO.exe` / `DUPLO` **nella stessa cartella** (serve insieme a dll/pak).

| File | Sistema |
| --- | --- |
| `DUPLO-1.0.0-win.zip` | Windows 64-bit |
| `DUPLO-1.0.0-ia32-win.zip` | Windows 32-bit |
| `DUPLO-linux-x64.zip` | Linux 64-bit |

Confronta l’hash con `SHA256SUMS.txt`. L’eseguibile non è firmato: su Windows usa **Ulteriori informazioni → Esegui comunque**.

Linux **32-bit non è disponibile**: Electron 33 non pubblica più un runtime Linux ia32. macOS: compila su un Mac con `npm run dist:mac`.

## Cosa c’è in questa build

- Menu nativo in italiano/inglese (tendina in alto a destra)
- Categorie file fisse (immagini, audio, documenti, video)
- Splitter trascinabile tra sidebar e risultati
- Trascina cartelle sull’elenco (i file singoli vengono ignorati)
- Ricerca Avanzata (estensioni, date, dimensione min/max)
- Guida in-app (README) e log persistenti

Eliminazione **definitiva** (niente Cestino). Conferma sempre prima della pulizia.

Manuale: `README.md` in questo zip e pulsante **Guida** nell’app.
