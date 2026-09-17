# DUPLO — Manuale d'uso

**Versione 1.0.0** · Windows (64-bit e 32-bit) e Linux 64-bit · applicazione desktop Electron (cartella unpacked)

Changelog: [CHANGELOG.md](CHANGELOG.md) · Release: [github.com/IlRed89/DUPLO/releases](https://github.com/IlRed89/DUPLO/releases)

DUPLO trova i file duplicati sul computer e ti aiuta a eliminarli in sicurezza. Non si ferma al nome: può confrontare **dimensione**, **contenuto** (hash SHA-256 o MD5), **estensione**, **nome** e **data di modifica**. Due file sono considerati identici solo se superano i criteri che hai selezionato.

Questo file è il manuale dell'applicazione. Lo trovi anche **dentro il programma**: in alto a destra apri **Guida**, oppure dal menu nativo **Aiuto → Guida (README)** (F1).

Indice:

1. [Avvio](#avvio)
2. [Flusso consigliato](#flusso-consigliato-prima-volta)
3. [Interfaccia](#interfaccia)
4. [Come funziona la scansione](#come-funziona-la-scansione)
5. [Risultati](#risultati-originale-e-duplicati)
6. [Esportazione](#esportazione)
7. [File di log (troubleshooting)](#file-di-log-troubleshooting)
8. [Consigli, FAQ, limitazioni](#consigli-pratici)
9. [Architettura](#architettura)
10. [Sviluppo e compilazione](#sviluppo-e-compilazione)
11. [Lifecycle & Release Policy](#lifecycle--release-policy-obbligatoria)
12. [Licenza](#licenza)

---

## Avvio

DUPLO **non è un unico exe portatile**: la release contiene una **cartella** con l'eseguibile e i file di runtime (dll, pak, risorse). Devi estrarre tutto lo zip e avviare `DUPLO.exe` **dalla stessa cartella**. Se sposti solo l'exe, l'app non parte.

1. Scarica `DUPLO-1.0.0-win-x64.zip` (64-bit) o `DUPLO-1.0.0-win-ia32.zip` (32-bit) dalla [pagina Releases](https://github.com/IlRed89/DUPLO/releases/latest).
2. Estrai lo zip in una cartella tua (Desktop, Programmi, USB…).
3. Entra nella cartella estratta e fai doppio clic su **DUPLO.exe**.
4. Se compare **Windows SmartScreen**, leggi il riquadro [SmartScreen e firma del codice](#windows-smartscreen-e-firma-del-codice) qui sotto.

Lo zip contiene una cartella **con lo stesso nome dell'archivio** (es. `DUPLO-1.0.0-win-x64`), non `win-unpacked`. Dentro trovi `DUPLO.exe` e le `.dll`. Non spostare solo l'exe.

### Tabella di compatibilità

| Piattaforma | Architettura | Artefatto della release | Supporto |
|---|---|---|---|
| Windows 10 / 11 | **x64 (64-bit)** | `DUPLO-1.0.0-win-x64.zip` | Sì |
| Windows 10 / 11 | **x86 (32-bit / ia32)** | `DUPLO-1.0.0-win-ia32.zip` | Sì |
| Windows ARM64 | arm64 | — | Non in questa release |
| Linux | x64 | `DUPLO-1.0.0-linux-x64.zip` | Sì |
| Linux | x86 32-bit | — | No (Electron 33 non pubblica runtime ia32) |
| macOS | — | build locale `npm run dist:mac` | Solo compilazione su Mac |

Su Linux scarica lo zip, estrai e avvia `./DUPLO` (`chmod +x DUPLO` se serve). Su macOS la cartella unpacked va compilata su un Mac: dentro trovi `DUPLO.app`.

---

## Windows SmartScreen e firma del codice

**Non esiste un bypass “via codice” di SmartScreen.** Windows tratta come non attendibili gli `.exe` scaricati da Internet se **non sono firmati** con un certificato Authenticode rilasciato da una CA riconosciuta (o se il file è troppo nuovo e ha pochi download). DUPLO, di default, **non è firmato**: è un progetto open source senza certificato a pagamento.

### Cosa fare se vedi “Windows ha protetto il PC”

1. Clicca **Ulteriori informazioni**.
2. Clicca **Esegui comunque**.
3. Confronta l’hash dello zip con `SHA256SUMS.txt` nella release, così sai di avere il file originale.

Non disattivare SmartScreen a livello di sistema. Non rinominare l’exe per “ingannarlo”: non funziona e riduce la tracciabilità.

### Come firmare l’eseguibile (se hai un certificato)

Serve un certificato Authenticode (file `.pfx` / `.p12`) e la password. Dalla root del progetto, **su Windows**:

```bash
set WIN_CSC_FILE=C:\\percorso\\certificato.pfx
set WIN_CSC_PASSWORD=la-tua-password
```

In `package.json` i campi `win.certificateFile` e `win.certificatePassword` leggono queste variabili (`${env.WIN_CSC_FILE}`, `${env.WIN_CSC_PASSWORD}`). Imposta anche `signAndEditExecutable` a `true` nella sezione `win` (resta `false` nelle build Linux/CI, dove la firma Windows non è disponibile).

In alternativa electron-builder riconosce le variabili standard `CSC_LINK` (path o URL del certificato) e `CSC_KEY_PASSWORD`.

Dopo la firma, SmartScreen può comunque comparire per qualche giorno finché il certificato non accumula reputazione. Un certificato EV riduce di molto l’avviso; un certificato self-signed **non** toglie SmartScreen.

DUPLO **non** usa FFmpeg: gli hash sono solo SHA-256/MD5 con il modulo nativo `crypto` di Node.js. Non installare binari extra.

---

## Icona Windows (`build/icon.ico`)

L’eseguibile prende l’icona da **`build/icon.ico`** (`build.win.icon` in `package.json`). **Devi avere questo file nel repo prima di `npm run dist:win`**: se manca, Windows mostra l’icona Electron di default.

- Per rigenerarla dal PNG master: `npm run icons` (scrive `build/icon.ico` e `build/icon.icns`).
- In build Linux→Windows electron-builder non lancia rcedit (`signAndEditExecutable: false`). Lo hook `scripts/applyWinIcon.js` timbra comunque il `.ico` sull’exe con `resedit`.

---

## Flusso consigliato (prima volta)

1. Aggiungi le cartelle da analizzare (Foto, Download, Documenti…): **Aggiungi Cartella** oppure **trascinale ovunque nella finestra** da Esplora file / Finder. Compare un overlay a tutto schermo («Trascina qui le cartelle»). Puoi aggiungerne più di una: DUPLO confronta anche i file che stanno in cartelle diverse. I singoli file trascinati vengono ignorati.
2. Lascia attivi **Stessa Dimensione** e **Hash Contenuto (2-Step)**. Così trovi copie identiche anche se i nomi sono diversi (`foto.jpg` e `copia di foto.jpg`).
3. Clicca **Avvia Scansione** e attendi la barra di avanzamento.
4. Leggi i gruppi: la riga verde **Originale** è quella che verrà conservata; le righe rosse **Duplicato** sono le copie in più.
5. Controlla i percorsi (icona cartella) prima di cancellare.
6. Elimina un singolo duplicato con l'icona cestino, oppure usa **Pulizia Rapida Duplicati** per togliere tutte le copie in un colpo solo (con conferma).
7. Se vuoi solo un elenco, esporta **CSV** (si apre con Excel) o **JSON**.

Finché non confermi, **nessun file viene cancellato**.
