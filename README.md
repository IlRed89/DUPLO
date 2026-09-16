# DUPLO — Manuale d'uso

**Versione 1.1.4** · Windows (64-bit e 32-bit) e Linux 64-bit · applicazione desktop Electron (cartella unpacked)

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

1. Scarica `DUPLO-1.1.4-win.zip` (64-bit) o `DUPLO-1.1.4-ia32-win.zip` (32-bit) dalla [pagina Releases](https://github.com/IlRed89/DUPLO/releases/latest).
2. Estrai lo zip in una cartella tua (Desktop, Programmi, USB…).
3. Entra nella cartella estratta e fai doppio clic su **DUPLO.exe**.
4. Se compare **Windows SmartScreen**, leggi il riquadro [SmartScreen e firma del codice](#windows-smartscreen-e-firma-del-codice) qui sotto.

Lo zip Windows è **piatto**: dopo l’estrazione trovi `DUPLO.exe` e le `.dll` **nella stessa cartella**, senza una sottocartella padre. Non spostare solo l’exe.

### Tabella di compatibilità

| Piattaforma | Architettura | Artefatto della release | Supporto |
|---|---|---|---|
| Windows 10 / 11 | **x64 (64-bit)** | `DUPLO-1.1.4-win.zip` | Sì |
| Windows 10 / 11 | **x86 (32-bit / ia32)** | `DUPLO-1.1.4-ia32-win.zip` | Sì |
| Windows ARM64 | arm64 | — | Non in questa release |
| Linux | x64 | `DUPLO-1.1.4-linux-x64.zip` | Sì |
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
set WIN_CSC_FILE=C:\percorso\certificato.pfx
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

---

## Interfaccia

### Intestazione e menu nativo

- **Italiano / English** — cambia la lingua della barra dei menu di sistema (File, Modifica, Visualizza, Finestra, Aiuto). L'interfaccia della finestra resta in italiano.
- **Guida** — apre questo manuale dentro l'applicazione. Stessa voce nel menu **Aiuto** (F1). Da lì puoi aprire `README.md` con il visualizzatore di testo del sistema.
- **File di Log** — mostra il percorso del diario tecnico (utile se qualcosa non funziona). Anche **Aiuto → Apri cartella dei log**.

Il divisore verticale tra la sidebar e i risultati si **trascina**: tieni premuto il mouse sul bordo e muovi. I listener `mousemove` / `mouseup` sono sul documento, così il tracciamento non si perde se il cursore esce dalla striscia da 6 px.

### Cartelle da analizzare

- **Aggiungi Cartella** apre la finestra nativa del sistema (Esplora file / Finder).
- **Trascina** una o più cartelle **ovunque nella finestra** (non solo sul rettangolo dell'elenco). Compare l'overlay «Trascina qui le cartelle».
  - Percorso nativo: il preload intercetta il `drop` nel mondo isolato e chiama `webUtils.getPathForFile(file)` sul **File nativo** (non clonato). Il Renderer legge lo stash con `consumeDroppedPaths()`. Alias: `window.duploAPI` / `window.api`. In Electron recente `File.path` è vuoto con `contextIsolation`.
  - `dragenter` / `dragover` su `window` + document + overlay: `preventDefault` e `dropEffect = 'copy'` (senza `stopPropagation` sul `dragover`, altrimenti Chromium non spara il `drop`). Su Windows, senza `preventDefault` compare l'icona di divieto.
  - Overlay anti-flicker: contatore `dragenter`/`dragleave` e `pointer-events: none` sull'overlay e su tutti i figli (testi/icone).
  - Il Main valida ogni path con `fs.promises.stat` (`validate-and-add-folder`): solo directory; i file singoli vengono ignorati e loggati.
- Ogni cartella compare nell'elenco: puoi toglierne una sola o **Rimuovi Tutte**.
- DUPLO scende in tutte le sottocartelle.
- I collegamenti simbolici non vengono seguiti, per evitare di contare due volte lo stesso file o di entrare in cicli.
- Se una cartella è protetta (`EPERM`, `EACCES`, `EBUSY`), viene saltata in silenzio e la scansione continua.

### Parametri di confronto

I criteri si combinano in **AND**: un file entra in un gruppo solo se soddisfa **tutti** quelli spuntati. Serve **almeno un** parametro, altrimenti la scansione viene rifiutata.

| Parametro | Cosa fa | Quando usarlo |
| --- | --- | --- |
| **Stessa Dimensione** (consigliato) | Raggruppa i file con lo stesso numero di byte. È istantaneo e scarta subito quasi tutto. | Sempre, salvo casi rarissimi. |
| **Hash Contenuto (2-Step)** (consigliato) | Verifica che il contenuto sia identico byte per byte. | Quando ti serve la certezza (foto, video, documenti copiati). |
| **Stesso Nome File** | Richiede il nome identico (`vacanze.jpg` ≠ `vacanze (1).jpg`). | Solo se cerchi copie con lo stesso nome. |
| **Nomi Simili (Fuzzy)** | Raggruppa nomi con similarità ≥ 80% (Levenshtein + Dice; ignora remix tra parentesi). | `Canzone.mp3` e `Canzone (Remix).mp3`. Se è attivo anche **Stesso Nome**, vince l’esatto. Con **Hash** restano uniti solo se il contenuto è identico: per i remix “solo nome”, togli Hash. |
| **Stessa Estensione** | Richiede la stessa estensione (non distingue maiuscole: `.JPG` = `.jpg`). | Per limitare il confronto a un tipo di file. |
| **Stessa Data di Modifica** | Richiede lo stesso timestamp di ultima scrittura. | Se cerchi copie fatte nello stesso istante; esclude i file ricopiati più tardi. |

**Combinazione consigliata per pulire il disco:** Dimensione + Hash.

**Combinazione da evitare:** solo Nome, senza Hash. Due file con lo stesso nome possono avere contenuti diversi.

### Filtri avanzati

- **Dimensione minima (KB)** — ignora i file più piccoli. Utile per non perdere tempo su miniature e file di sistema da pochi byte. `0` = nessun limite.
- **Algoritmo Hash** — `SHA-256` (predefinito, più sicuro) oppure `MD5` (un po' più veloce). Per trovare duplicati entrambi vanno bene.
- **Categoria file** — tendina con elenco fisso di estensioni (non si digita a mano):
  - **Tutti i file** — nessun filtro.
  - **Immagini** — `.jpg, .jpeg, .png, .gif, .bmp, .webp`
  - **Audio** — `.mp3, .wav, .flac, .aac`
  - **Documenti** — `.pdf, .doc, .docx, .xls, .xlsx, .txt`
  - **Video** — `.mp4, .mkv, .avi, .mov`
- **Includi cartelle e file nascosti** — spunta solo se vuoi analizzare anche elementi che iniziano con `.` o che Windows marca come nascosti.

### Ricerca Avanzata (accordion)

Apri **Ricerca Avanzata** sotto i filtri per restringere ulteriormente l’indicizzazione (i file esclusi finiscono nel log):

- **Formato esatto** — estensioni digitate a mano (`.txt, .csv`). Se il campo non è vuoto **sostituisce** la categoria.
- **Modificato dal / fino al** — confronta `mtime` del file con l’intervallo (giornata locale). Se inverti le date, DUPLO le scambia e lo scrive nel log.
- **Dimensione minima / massima** — in KB o MB (tendina Unità). Si combina con “Dim. Minima (KB)” prendendo il limite più restrittivo.
- **Azzera Filtri e Ricerca** — svuota cartelle, ripristina i default e pulisce i risultati senza chiudere l’app.

---

## Come funziona la scansione

Per non leggere terabyte inutili DUPLO lavora a stadi:

1. **Indicizzazione** — elenca i file nelle cartelle scelte, applicando dimensione minima, estensioni e file nascosti.
2. **Pre-filtro** — raggruppa per dimensione (e, se richiesti, nome, estensione, data). I file con dimensione unica escono subito.
3. **Hash parziale** — sui candidati legge solo il **primo megabyte**. Se la testa è diversa, non è un duplicato.
4. **Hash completo** — solo sui file ancora uguali calcola SHA-256 o MD5 a blocchi da 64 KB, in streaming. Non carica l'intero file in RAM: va bene anche per video da diversi gigabyte.

La barra in alto mostra la fase, la percentuale e il file in esame. **Interrompi Scansione** ferma il lavoro: i file sul disco restano intatti.

Le statistiche, a scansione finita:

- **File analizzati** — quanti file sono stati presi in considerazione.
- **Gruppi duplicati** — insiemi di copie dello stesso contenuto.
- **File duplicati** — copie in più (in un gruppo di 3 file ce ne sono 2).
- **Spazio recuperabile** — quanto libereresti tenendo una sola copia per gruppo.

---

## Risultati: originale e duplicati

In ogni gruppo:

- la prima riga, verde, è l'**Originale** (il primo file incontrato durante la scansione);
- le altre, rosse, sono **Duplicati**.

Cosa puoi fare su ogni riga:

- cliccare il percorso o l'icona cartella per aprire Esplora file / Finder sulla posizione;
- sul duplicato, cliccare il cestino per eliminare **solo quel file**, dopo una conferma.

**Pulizia Rapida Duplicati** elimina tutte le copie rosse di tutti i gruppi e lascia gli originali. Chiede conferma. L'eliminazione è **definitiva**: i file non passano dal Cestino.

Prima di una pulizia di massa conviene esportare il report e aprire qualche cartella a campione.

---

## Esportazione

- **Esporta CSV** — una riga per file, con gruppo, hash, dimensione, percorso e data. Si apre con Excel, LibreOffice o Fogli Google.
- **Esporta JSON** — stesso contenuto in formato strutturato, utile per script.

Nessuna esportazione modifica i file analizzati.

---

## File di log (troubleshooting)

DUPLO usa **electron-log**. In sviluppo scrive anche in console; in produzione (e comunque sempre) scrive su **file persistente** con rotazione automatica (circa 5 MB per file).

Livello: `debug`. Viene registrato l’avvio (OS, architettura, versioni Node/Electron), ogni cartella aggiunta, ogni cambio filtro, inizio/fine scansione, file/cartelle ignorati per permessi (`EPERM`, `EACCES`, `EBUSY`), hash parziale e completo, export, eliminazioni, errori UI.

### Dove sono i file

Il nome cartella dell’app è `duplo` (campo `name` in `package.json`). Percorsi predefiniti di electron-log:

| Sistema | Percorso |
| --- | --- |
| **Windows** | `%USERPROFILE%\AppData\Roaming\duplo\logs\main.log` |
| **macOS** | `~/Library/Logs/duplo/main.log` |
| **Linux** | `~/.config/duplo/logs/main.log` |

Come aprirli in un clic:

- Nell’app: pulsante **File di Log** (mostra il path esatto su *questa* macchina).
- **Windows:** `Win + R` → incolla `%USERPROFILE%\AppData\Roaming\duplo\logs` → Invio.
- **macOS:** Finder → Vai → Vai alla cartella… → `~/Library/Logs/duplo`.
- **Linux:** file manager o `xdg-open ~/.config/duplo/logs`.

Nella stessa cartella possono comparire file ruotati (`main.old.log` o simili). Allega **tutta la cartella** `logs` a una issue su GitHub.

### Cosa cercare nel log

Esempi di righe utili:

- `[Scanner] Impossibile leggere directory ... [EACCES]` — cartella protetta, la scansione è andata avanti.
- `[Hasher] Errore lettura hash parziale ... [EBUSY]` — file in uso, saltato.
- `[RendererUI] Avvio scansione con criteri:` — conferma dei filtri scelti.
- `Scansione interrotta` — l’utente ha premuto Interrompi.

Se l’app non parte, il log potrebbe non esistere ancora: in quel caso indica sistema operativo, versione scaricata e messaggio SmartScreen/antivirus.

---

## Consigli pratici

- Parti da una cartella tua (Foto, Download). Evita `C:\Windows` o le cartelle di sistema: non è il caso d'uso e i permessi bloccano gran parte dei file.
- Per le foto: Dimensione + Hash e categoria **Immagini**. (HEIC/RAW non sono nella lista fissa: usa **Tutti i file** se ti servono.)
- Per i download: Dimensione + Hash, dimensione minima `100` KB, così ignori i file piccolissimi.
- Se due cartelle si sovrappongono (una cartella e la sua sottocartella), i file non vengono contati due volte.
- Fai una copia di sicurezza prima di una pulizia su archivi importanti.

---

## Domande frequenti

**Due foto sembrano uguali ma DUPLO non le raggruppa.**  
L'hash è sul contenuto esatto. Un JPEG ricompresso, ruotato o salvato di nuovo non è un duplicato, anche se l'immagine “si vede uguale”.

**Ho due file con lo stesso nome e dimensioni diverse.**  
Non sono duplicati di contenuto. Con Hash attivo restano distinti. Se spunti solo Nome, comparirebbero insieme: è fuorviante, meglio non farlo.

**La scansione è lenta.**  
È normale su dischi meccanici o cartelle con centinaia di migliaia di file. L'hash completo parte solo sui candidati. Chiudi altri programmi che usano lo stesso disco.

**Posso annullare un'eliminazione?**  
No. DUPLO non sposta nel Cestino. Usa l'anteprima e l'esportazione prima della pulizia rapida.

**L'antivirus blocca l'eseguibile.**  
È un falso positivo frequente sugli exe non firmati. Confronta l'hash dello zip scaricato con `SHA256SUMS.txt` nella release. Non spostare `DUPLO.exe` fuori dalla cartella unpacked.

---

## Limitazioni

- Non analizza file in uso esclusivo dal sistema se il sistema operativo rifiuta la lettura.
- Non “deduplica” i file lasciando un collegamento: elimina le copie oppure lascia tutto com'è.
- Non confronta il contenuto “simile” (immagini quasi uguali, documenti con piccole modifiche).
- L'etichetta Originale è la prima occorrenza trovata, non necessariamente il file più vecchio.

---

## Architettura

Due processi Electron, isolati:

```
Renderer (HTML/CSS/JS)  --preload.js / contextBridge-->  Main (Node.js)
        UI, progresso, risultati                         dialoghi nativi, scan, hash, log, disco
```

Il renderer **non** ha `nodeIntegration`. Parla solo con `window.duploAPI` (canali IPC in `preload.js`).

```
DUPLO/
├── main.js                      # ciclo di vita, BrowserWindow, handler IPC
├── preload.js                   # contextBridge (API sicura verso il renderer)
├── package.json                 # dipendenze e configurazione electron-builder
├── LICENSE                      # MIT
├── README.md                    # questo file (anche extraResource nel pacchetto)
├── build/
│   ├── icon.svg                 # master vettoriale (lente + due documenti)
│   ├── icon.png                 # Linux / tray (512×512)
│   ├── icon.ico                 # Windows — OBBLIGATORIO prima di dist:win
│   └── icon.icns                # macOS
├── scripts/
│   ├── generate-icons.js        # PNG → ICO + ICNS (`npm run icons`)
│   ├── flattenWinZip.js         # ZIP Windows piatto (archiver, exe/dll in radice)
│   └── applyWinIcon.js          # afterPack: timbra icon.ico su DUPLO.exe
└── src/
    ├── logger.js                # electron-log (console + file)
    ├── hasher.js                # crypto nativo: chunk 1 MB, poi stream SHA-256/MD5
    ├── scanner.js               # walk cross-platform, filtri, raggruppamento
    ├── dropFilter.js            # drop: fs.promises.stat, solo directory
    ├── fileCategories.js        # estensioni hardcoded della tendina Categoria
    ├── advancedFilters.js       # parsing formato esatto, date, KB/MB
    ├── fuzzyName.js             # similarità nomi (Levenshtein + Dice, soglia 80%)
    ├── nativeMenu.js            # menu nativo it/en (Menu.buildFromTemplate)
    ├── readme.js                # risolve README.md in dev e nel pacchetto
    └── renderer/
        ├── index.html
        ├── styles.css
        ├── renderer.js          # eventi UI, splitter, overlay drop (counter + consumeDroppedPaths)
        ├── splitterMath.js      # clamp larghezza sidebar
        └── markdown.js          # rendering del manuale in-app
```

Pipeline di scansione (tutta asincrona, non blocca l’UI):

1. Normalizzazione path (`path.resolve` / `path.join`).
2. Walk con `fs.promises` + `withFileTypes`; symlink non seguiti.
3. Bucket per dimensione/nome/estensione/data.
4. Hash parziale 1 MB solo sui bucket con ≥ 2 file.
5. Hash completo in stream da 64 KB se il parziale coincide.
6. Errori di permesso: log `warn`, si passa oltre.

---

## Sviluppo e compilazione

Requisiti: **Node.js 20 o 22**, **npm 10+**.

```bash
git clone https://github.com/IlRed89/DUPLO.git
cd DUPLO
npm install
npm test
npm start
```

| Comando | Output |
| --- | --- |
| `npm start` | App in sviluppo |
| `npm test` | Test hasher, scanner, fuzzy, ZIP piatto, igiene package (niente FFmpeg), categorie, splitter, drop, menu, README |
| `npm run icons` | Rigenera `icon.ico` e `icon.icns` da `icon.png` — **esegui prima della build Windows se l’ico non c’è** |
| `npm run build -- --win zip --x64` | ZIP Windows 64-bit piatto in `dist/` (`DUPLO-<versione>-win-x64.zip`, poi riarrotato da `flattenWinZip.js`) |
| `npm run build -- --win zip --ia32` | ZIP Windows 32-bit piatto in `dist/` (`DUPLO-<versione>-win-ia32.zip`) |
| `npm run dist:win` | ZIP Windows 64-bit e 32-bit **piatti** (`DUPLO-1.1.4-win.zip` / `DUPLO-1.1.4-ia32-win.zip` dopo overlay CI, o i nomi electron-builder in `dist/`) |
| `npm run dist:linux` | `dist/linux-unpacked/` |
| `npm run dist:mac` | `dist/mac-unpacked/` (**solo su macOS**) |
| `npm run dist` | ZIP Windows (x64+ia32) + cartella Linux unpacked |

La finestra non si può rimpicciolire sotto **920×700** px (`minWidth` / `minHeight`): così header, sidebar e risultati non si sovrappongono. Il layout usa flex/grid e media query per adattarsi alle risoluzioni più strette.

Gli ZIP Windows vengono riarrotati da `scripts/flattenWinZip.js` (`archiver`, hook `afterAllArtifactBuild`): in radice ci sono `DUPLO.exe` e le dll, **senza** cartella padre (`DUPLO-win32-x64` o simile).

Runtime: solo `electron-log`. `electron` / `electron-builder` / `archiver` / `resedit` / `png2icons` sono `devDependencies`. Nessun binario FFmpeg nel pacchetto.

La build Windows da Linux non firma l’exe (`signAndEditExecutable: false`). L’icona viene comunque applicata da `applyWinIcon.js`. Per firmare vedi [SmartScreen e firma del codice](#windows-smartscreen-e-firma-del-codice).

---

## Lifecycle & Release Policy (obbligatoria)

Ogni modifica, funzione, bugfix o chiusura issue **non è completa** finché non sono eseguite **tutte e quattro** le sezioni seguenti. Il lavoro si chiude solo con documentazione allineata, versione SemVer, zip Windows 32/64 bit e una **nuova GitHub Release** scaricabile.

### 1. Aggiornamento documentazione (Docs-as-Code)

- **`README.md`**: istruzioni, requisiti, architettura, tabella di compatibilità, nomi zip della versione corrente.
- **`CHANGELOG.md`**: voce `## [X.Y.Z] - YYYY-MM-DD` in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) (`Added` / `Changed` / `Fixed` / `Removed`).
- **`package.json`**: incrementare `version` (patch per bugfix, minor per feature, major per breaking).
- JSDoc + log su ogni canale IPC o metodo nuovo. Badge UI (`src/renderer/index.html`) allineato a `vX.Y.Z`.
- Note di release in `docs/RELEASE-vX.Y.Z.md` (usate dalla pipeline overlay).

Identità prodotto: **DUPLO** (`name` / `productName` / `executableName` / `app.setName` / titolo finestra / Task Manager).

### 2. Preparazione degli asset ZIP (32/64 bit, senza cartelle intermedie)

Da Windows, Node 20/22, dopo `npm ci` e `npm run icons` se manca `build/icon.ico`:

```bash
npm run build -- --win zip --x64
npm run build -- --win zip --ia32
```

`npm run build` è l’alias di `electron-builder`. Gli ZIP Windows vengono riarrotati da `scripts/flattenWinZip.js` (`afterAllArtifactBuild`): **exe e dll in radice**, senza cartella padre `DUPLO-win32-x64`.

File pronti in `dist/`:

| Comando | File generato (electron-builder) | Cartella unpacked di origine |
| --- | --- | --- |
| `--win zip --x64` | `dist/DUPLO-<version>-win-x64.zip` | `dist/win-unpacked/` |
| `--win zip --ia32` | `dist/DUPLO-<version>-win-ia32.zip` | `dist/win-ia32-unpacked/` |

Sulla GitHub Release i nomi pubblicati dalla pipeline overlay sono piatti e versionati:

- `DUPLO-1.1.4-win.zip` (Windows 64-bit)
- `DUPLO-1.1.4-ia32-win.zip` (Windows 32-bit)
- `DUPLO-1.1.4-linux-x64.zip` (Linux 64-bit)
- `SHA256SUMS.txt`

Non sovrascrivere mai il tag `v1.0.0` (runtime di base della pipeline overlay).

### 3. Sincronizzazione Git & tagging

Blocco sequenziale (Conventional Commits). Tipi: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

```bash
git status
git add .
git commit -m "<tipo>(scope): descrizione puntuale in formato Conventional Commits>"
git tag -a vX.Y.Z -m "Release vX.Y.Z: sintesi novità"
git push origin main
git push origin vX.Y.Z
```

Esempio per questa versione:

```bash
git status
git add .
git commit -m "chore(branding): allinea identità prodotto a DUPLO 1.1.4"
git tag -a v1.1.4 -m "Release v1.1.4: identità prodotto DUPLO su ogni file"
git push origin main
git push origin v1.1.4
```

### 4. GitHub Release

Ogni ciclo deve chiudersi con una **nuova** release `https://github.com/IlRed89/DUPLO/releases/tag/vX.Y.Z` e zip scaricabili (win x64, win ia32, linux x64). Un push su `package.json` / `README.md` / `CHANGELOG.md` / `src/**` / `main.js` / `preload.js` avvia il workflow overlay (`rebrand-asar-release.yml`), che crea o aggiorna il tag `v$(package.json version)` **senza** toccare `v1.0.0`.

---

## Licenza

DUPLO è distribuito con licenza **MIT**. Vedi il file [LICENSE](LICENSE).

Autore: Fabio Rossi ([IlRed89](https://github.com/IlRed89/DUPLO)).
