# DUPLO 1.1.3

Protocollo permanente di release: ogni modifica chiude il ciclo solo con README/CHANGELOG/versione, ZIP Windows 32/64 bit, tag Git e una **nuova GitHub Release** scaricabile. Estrai lo zip e avvia `DUPLO.exe` / `DUPLO` **nella stessa cartella**.

## Download

| File | Sistema |
| --- | --- |
| `DUPLO-1.1.3-win.zip` | Windows 64-bit |
| `DUPLO-1.1.3-ia32-win.zip` | Windows 32-bit |
| `DUPLO-1.1.3-linux-x64.zip` | Linux 64-bit |

Confronta l’hash con `SHA256SUMS.txt`. L’eseguibile non è firmato: su Windows usa **Ulteriori informazioni → Esegui comunque**.

## Cosa c’è in questa build

- Policy Docs-as-Code + Conventional Commits + tagging `vX.Y.Z` documentata nel README
- Comandi ufficiali ZIP: `npm run build -- --win zip --x64` e `--ia32` (zip piatti in `dist/`)
- Drag & drop cartelle della 1.1.2 (path nativo nel preload, contatore anti-flicker, solo directory)
- Menu nativo it/en, categorie, splitter, Ricerca Avanzata, guida e log

Eliminazione **definitiva** (niente Cestino). Conferma sempre prima della pulizia.

Manuale: `README.md` nello zip e pulsante **Guida** nell’app. Dettaglio: [CHANGELOG.md](../CHANGELOG.md).
