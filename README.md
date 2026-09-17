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
5. [Risultati](#risultati-gruppi-e-numerazione-progressiva)
6. [File di log (troubleshooting)](#file-di-log-troubleshooting)
7. [Consigli, FAQ, limitazioni](#consigli-pratici)
8. [Sviluppo](#sviluppo)
9. [Licenza](#licenza)

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
2. Spunta **esplicitamente** i parametri di confronto che vuoi usare (all'avvio **nessuna** casella è attiva). Per copie identiche anche con nomi diversi: **Stessa Dimensione** e **Hash Contenuto (2-Step)** (`foto.jpg` e `copia di foto.jpg`).
3. Clicca **Avvia Scansione** e attendi la barra di avanzamento. Senza almeno un criterio, compare un avviso a tema (non il dialog nativo del sistema).
4. Leggi i gruppi in ordine deterministico (dal file più pesante al più leggero): **Gruppo 1**, **Gruppo 2**, … Dentro ogni gruppo i file sono **File #1**, **File #2**, **File #3**… ordinati per data di modifica (il più vecchio è #1). DUPLO non etichetta alcun file come «originale».
5. Controlla i percorsi (il path è cliccabile) prima di cancellare.
6. **Seleziona dal 2° in poi** spunta File #2, #3, … e lascia File #1 deselezionato (toggle: un secondo click li toglie). Elimina un file con l'icona cestino, oppure usa **Pulizia Rapida Duplicati** per togliere dal 2° in poi di ogni gruppo (con conferma a tema).

Finché non confermi, **nessun file viene cancellato**.

---

## Interfaccia

### Intestazione e menu nativo

- **Lingua (Italiano / English / Español / Français)** — aggiorna subito tutti i testi dell'interfaccia (etichette, placeholder, tooltip, filtri avanzati, messaggi a schermo, modali) e ricostruisce la barra dei menu nativa (File, Modifica, Visualizza, Finestra, Aiuto). La preferenza è salvata in `localStorage`.
- **Tema (Chiaro / Scuro)** — alterna la palette CSS (`--bg-primary`, `--text-primary`, `--accent-color`, …) su pannelli, **modali a tema**, scrollbar, splitter e righe risultati. Avvisi, errori e conferme usano lo stesso overlay (niente `alert()` / `confirm()` / `prompt()` nativi). La scelta è persistita in `localStorage` e inviata al Main Process (`nativeTheme.themeSource`).
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

I criteri si combinano in **intersezione**: due file finiscono nello stesso cluster **solo se soddisfano contemporaneamente tutti** i parametri spuntati (es. Stesso Nome **e** Stessa Dimensione **e** Hash identico). Se un file coincide su un criterio ma differisce sugli altri selezionati, **non** viene raggruppato. All'avvio e dopo **Azzera Filtri** **nessuna** casella è spuntata: serve **almeno un** parametro scelto da te, altrimenti la scansione viene rifiutata con un avviso a tema. L'intestazione di ogni gruppo mostra i criteri applicati come **badge** (senza dicitura tecnica AND).

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
- **Azzera Filtri** — toglie tutte le spunte dai parametri di confronto e ripristina categoria/filtri avanzati. **Non** tocca l’elenco delle cartelle né i risultati già mostrati.
- **Azzera Ricerca** — pulisce solo il pannello risultati (gruppi, statistiche, barra di avanzamento) e ripristina il messaggio iniziale. Le cartelle già caricate restano, così puoi avviare subito una nuova scansione. Per togliere le cartelle usa **Rimuovi** / **Rimuovi Tutte** in alto.

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
- **Dimensione** — somma delle dimensioni dei file elencati nei gruppi.

---

## Risultati: gruppi e numerazione progressiva

I duplicati nel pannello di destra sono **sezionati per la combinazione di criteri** che ha determinato l'uguaglianza. L'intestazione mostra **badge** con le etichette vere (`Stessa Estensione`, `Stessa Dimensione`, `Hash`, …), senza la dicitura tecnica AND.

I **gruppi** sono ordinati in modo deterministico: prima per **dimensione decrescente**, a parità di size per nome del File #1. Ogni card ha un identificativo sequenziale **Gruppo 1**, **Gruppo 2**, **Gruppo 3**… senza salti.

Esempi di sezioni:

| Combinazione | Quando compare |
| --- | --- |
| **Stesso Contenuto (Hash MD5/SHA256)** | Hash attivo (da solo o insieme ad altri criteri) |
| **Stessa Dimensione** | Solo dimensione, senza hash |
| **Stesso Nome Esatto** | Solo nome esatto |
| **Stessa Estensione** | Solo estensione (non viene più etichettata come «Stessa Dimensione») |
| **Nomi Simili (Fuzzy Match)** | Similarità nomi ≥ 80% |
| **Stessa Dimensione • Stessa Estensione • Hash** | Tutti e tre spuntati: il cluster soddisfa l'intersezione |

Ogni macro-sezione ha intestazione tradotta, conteggio gruppi/file e si **comprime/espande**. Dentro restano i set identici (card di gruppo).

In ogni gruppo i file sono **File #1**, **File #2**, **File #3**… ordinati per data di modifica (poi path). DUPLO **non** può sapere quale sia l'«originale»: la numerazione è solo un ordine stabile. File #1 è il più vecchio del cluster.

Cosa puoi fare su ogni riga:

- spuntare la **checkbox** di un file singolo;
- usare **Seleziona dal 2° in poi** / **Deseleziona dal 2° in poi** (sezione o gruppo): toggle a due vie che lascia sempre deselezionato File #1 e spunta (o toglie) #2, #3, …;
- cliccare il **percorso** per aprire Esplora file / Finder sulla posizione (hover con sottolineatura e colore accento). I percorsi lunghi restano visibili per intero: la riga scorre in orizzontale (`overflow-x: auto`) e il tooltip nativo `title` mostra il path assoluto; i pulsanti e le checkbox non si comprimono (`flex-shrink: 0`);
- **Rinomina** (event delegation sul pannello risultati) apre un dialogo a tema *sopra* ogni overlay, con il nome attuale (senza path); alla conferma il Main rinomina con `fs.promises.rename` (retry su `EBUSY`) e l'UI aggiorna subito nome, percorso e apertura cartella. Gli stream di hash vengono chiusi (`destroy`) prima che la Promise di hashing si risolva, così Windows non tiene il file lockato;
- leggere la **data di modifica**;
- **Elimina** per cancellare **solo quel file**, dopo una conferma a tema.

**Elimina selezionati** toglie i file spuntati (se non ce n'è nessuno compare un avviso a tema). **Pulizia Rapida Duplicati** elimina dal 2° in poi di tutti i gruppi e lascia File #1. Chiedono conferma. L'eliminazione è **definitiva**: i file non passano dal Cestino.

---

## File di log (troubleshooting)

DUPLO usa **electron-log**. In sviluppo scrive anche in console; in produzione (e comunque sempre) scrive su **file persistente** con rotazione automatica (circa 5 MB per file).

Livello: `debug`. Viene registrato l’avvio (OS, architettura, versioni Node/Electron), ogni cartella aggiunta, ogni cambio filtro, inizio/fine scansione, file/cartelle ignorati per permessi (`EPERM`, `EACCES`, `EBUSY`), hash parziale e completo, rinomine, eliminazioni, errori UI.

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
No. DUPLO non sposta nel Cestino. Controlla i path e usa la conferma a tema prima della pulizia rapida.

**L'antivirus blocca l'eseguibile.**  
È un falso positivo frequente sugli exe non firmati. Confronta l'hash dello zip scaricato con `SHA256SUMS.txt` nella release. Non spostare `DUPLO.exe` fuori dalla cartella unpacked.

---

## Limitazioni

- Non analizza file in uso esclusivo dal sistema se il sistema operativo rifiuta la lettura.
- Non “deduplica” i file lasciando un collegamento: elimina le copie oppure lascia tutto com'è.
- Non confronta il contenuto “simile” (immagini quasi uguali, documenti con piccole modifiche).
- File #1 è il file più vecchio del gruppo (mtime), non necessariamente «l'originale» scelto da te.

---

## Sviluppo

Albero dei file, pipeline di scansione, comandi `npm` e protocollo di release: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Il ciclo Docs / ZIP / Git / GitHub Release è anche in [docs/RELEASE-PROTOCOL.md](docs/RELEASE-PROTOCOL.md).

---

## Licenza

DUPLO è distribuito con licenza **MIT**. Vedi il file [LICENSE](LICENSE).

Autore: Fabio Rossi ([IlRed89](https://github.com/IlRed89/DUPLO)).
