# DupFinder — Manuale d'uso

**Versione 1.0.0** · Windows, macOS e Linux · applicazione desktop Electron (cartella unpacked)

DupFinder trova i file duplicati sul computer e ti aiuta a eliminarli in sicurezza. Non si ferma al nome: può confrontare **dimensione**, **contenuto** (hash SHA-256 o MD5), **estensione**, **nome** e **data di modifica**. Due file sono considerati identici solo se superano i criteri che hai selezionato.

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
11. [Licenza](#licenza)

---

## Avvio

DupFinder **non è un unico exe portatile**: la release contiene una **cartella** con l'eseguibile e i file di runtime (dll, pak, risorse). Devi estrarre tutto lo zip e avviare `DupFinder.exe` **dalla stessa cartella**. Se sposti solo l'exe, l'app non parte.

1. Scarica `DupFinder-1.0.0-win.zip` (64-bit) o `DupFinder-1.0.0-ia32-win.zip` (32-bit) dalla [pagina Releases](https://github.com/IlRed89/DupFinder/releases/latest).
2. Estrai lo zip in una cartella tua (Desktop, Programmi, USB…).
3. Entra nella cartella estratta e fai doppio clic su **DupFinder.exe**.
4. Windows può mostrare SmartScreen perché l'eseguibile non è firmato: scegli **Ulteriori informazioni** e poi **Esegui comunque**.

Su Linux scarica `DupFinder-linux-x64.zip`, estrai e avvia `./DupFinder` da `linux-unpacked` (`chmod +x DupFinder` se serve). Su macOS la cartella unpacked va compilata su un Mac (`npm run dist:mac`): dentro trovi `DupFinder.app`.

---

## Flusso consigliato (prima volta)

1. Aggiungi le cartelle da analizzare (Foto, Download, Documenti…): **Aggiungi Cartella** oppure **trascinale** da Esplora file / Finder sull'elenco a sinistra. Puoi aggiungerne più di una: DupFinder confronta anche i file che stanno in cartelle diverse. I singoli file trascinati vengono ignorati.
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
- **Trascina** una o più cartelle sull'elenco tratteggiato. DupFinder verifica ogni path con `fs.statSync`: accetta solo directory, logga e scarta file o percorsi illeggibili.
- Ogni cartella compare nell'elenco: puoi toglierne una sola o **Rimuovi Tutte**.
- DupFinder scende in tutte le sottocartelle.
- I collegamenti simbolici non vengono seguiti, per evitare di contare due volte lo stesso file o di entrare in cicli.
- Se una cartella è protetta (`EPERM`, `EACCES`, `EBUSY`), viene saltata in silenzio e la scansione continua.

### Parametri di confronto

I criteri si combinano in **AND**: un file entra in un gruppo solo se soddisfa **tutti** quelli spuntati. Serve **almeno un** parametro, altrimenti la scansione viene rifiutata.

| Parametro | Cosa fa | Quando usarlo |
| --- | --- | --- |
| **Stessa Dimensione** (consigliato) | Raggruppa i file con lo stesso numero di byte. È istantaneo e scarta subito quasi tutto. | Sempre, salvo casi rarissimi. |
| **Hash Contenuto (2-Step)** (consigliato) | Verifica che il contenuto sia identico byte per byte. | Quando ti serve la certezza (foto, video, documenti copiati). |
| **Stesso Nome File** | Richiede il nome identico (`vacanze.jpg` ≠ `vacanze (1).jpg`). | Solo se cerchi copie con lo stesso nome. |
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
- **Modificato dal / fino al** — confronta `mtime` del file con l’intervallo (giornata locale). Se inverti le date, DupFinder le scambia e lo scrive nel log.
- **Dimensione minima / massima** — in KB o MB (tendina Unità). Si combina con “Dim. Minima (KB)” prendendo il limite più restrittivo.
- **Azzera Filtri e Ricerca** — svuota cartelle, ripristina i default e pulisce i risultati senza chiudere l’app.

---

## Come funziona la scansione

Per non leggere terabyte inutili DupFinder lavora a stadi:

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

DupFinder usa **electron-log**. In sviluppo scrive anche in console; in produzione (e comunque sempre) scrive su **file persistente** con rotazione automatica (circa 5 MB per file).

Livello: `debug`. Viene registrato l’avvio (OS, architettura, versioni Node/Electron), ogni cartella aggiunta, ogni cambio filtro, inizio/fine scansione, file/cartelle ignorati per permessi (`EPERM`, `EACCES`, `EBUSY`), hash parziale e completo, export, eliminazioni, errori UI.

### Dove sono i file

Il nome cartella dell’app è `dupfinder` (campo `name` in `package.json`). Percorsi predefiniti di electron-log:

| Sistema | Percorso |
| --- | --- |
| **Windows** | `%USERPROFILE%\AppData\Roaming\dupfinder\logs\main.log` |
| **macOS** | `~/Library/Logs/dupfinder/main.log` |
| **Linux** | `~/.config/dupfinder/logs/main.log` |

Come aprirli in un clic:

- Nell’app: pulsante **File di Log** (mostra il path esatto su *questa* macchina).
- **Windows:** `Win + R` → incolla `%USERPROFILE%\AppData\Roaming\dupfinder\logs` → Invio.
- **macOS:** Finder → Vai → Vai alla cartella… → `~/Library/Logs/dupfinder`.
- **Linux:** file manager o `xdg-open ~/.config/dupfinder/logs`.

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

**Due foto sembrano uguali ma DupFinder non le raggruppa.**  
L'hash è sul contenuto esatto. Un JPEG ricompresso, ruotato o salvato di nuovo non è un duplicato, anche se l'immagine “si vede uguale”.

**Ho due file con lo stesso nome e dimensioni diverse.**  
Non sono duplicati di contenuto. Con Hash attivo restano distinti. Se spunti solo Nome, comparirebbero insieme: è fuorviante, meglio non farlo.

**La scansione è lenta.**  
È normale su dischi meccanici o cartelle con centinaia di migliaia di file. L'hash completo parte solo sui candidati. Chiudi altri programmi che usano lo stesso disco.

**Posso annullare un'eliminazione?**  
No. DupFinder non sposta nel Cestino. Usa l'anteprima e l'esportazione prima della pulizia rapida.

**L'antivirus blocca l'eseguibile.**  
È un falso positivo frequente sugli exe non firmati. Confronta l'hash dello zip scaricato con `SHA256SUMS.txt` nella release. Non spostare `DupFinder.exe` fuori dalla cartella unpacked.

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

Il renderer **non** ha `nodeIntegration`. Parla solo con `window.dupFinderAPI` (canali IPC in `preload.js`).

```
DupFinder/
├── main.js                      # ciclo di vita, BrowserWindow, handler IPC
├── preload.js                   # contextBridge (API sicura verso il renderer)
├── package.json                 # dipendenze e configurazione electron-builder
├── LICENSE                      # MIT
├── README.md                    # questo file (anche extraResource nel pacchetto)
├── build/
│   ├── icon.svg                 # master vettoriale (lente + due documenti)
│   ├── icon.png                 # Linux / tray (512×512)
│   ├── icon.ico                 # Windows
│   └── icon.icns                # macOS
├── scripts/
│   └── generate-icons.js        # PNG → ICO + ICNS (`npm run icons`)
└── src/
    ├── logger.js                # electron-log (console + file)
    ├── hasher.js                # chunk 1 MB, poi stream SHA-256/MD5
    ├── scanner.js               # walk cross-platform, filtri, raggruppamento
    ├── dropFilter.js            # drop: statSync, solo directory
    ├── fileCategories.js        # estensioni hardcoded della tendina Categoria
    ├── advancedFilters.js       # parsing formato esatto, date, KB/MB
    ├── nativeMenu.js            # menu nativo it/en (Menu.buildFromTemplate)
    ├── readme.js                # risolve README.md in dev e nel pacchetto
    └── renderer/
        ├── index.html
        ├── styles.css
        ├── renderer.js          # eventi UI, splitter, drag & drop
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
git clone https://github.com/IlRed89/DupFinder.git
cd DupFinder
npm install
npm test
npm start
```

| Comando | Output |
| --- | --- |
| `npm start` | App in sviluppo |
| `npm test` | Test hasher, scanner, categorie, splitter, drop, menu, README |
| `npm run icons` | Rigenera `icon.ico` e `icon.icns` da `icon.png` |
| `npm run dist:win` | ZIP Windows 64-bit e 32-bit (`DupFinder-1.0.0-win.zip`, `DupFinder-1.0.0-ia32-win.zip`) |
| `npm run dist:linux` | `dist/linux-unpacked/` |
| `npm run dist:mac` | `dist/mac-unpacked/` (**solo su macOS**) |
| `npm run dist` | ZIP Windows (x64+ia32) + cartella Linux unpacked |

La finestra non si può rimpicciolire sotto **920×700** px (`minWidth` / `minHeight`): così header, sidebar e risultati non si sovrappongono. Il layout usa flex/grid e media query per adattarsi alle risoluzioni più strette.

Per distribuire Windows: usa i `.zip` prodotti da electron-builder (contengono exe + runtime). L'utente deve lanciare `DupFinder.exe` **dentro** la cartella estratta.

`README.md` viene copiato nelle risorse del pacchetto (`extraResources`) e letto dalla voce **Guida**.

La build Windows da Linux non firma l’exe (`signAndEditExecutable: false`) e non richiede Wine perché il target è `dir`, non un installer.

---

## Licenza

DupFinder è distribuito con licenza **MIT**. Vedi il file [LICENSE](LICENSE).

Autore: Fabio Rossi ([IlRed89](https://github.com/IlRed89/DupFinder)).
