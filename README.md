# DupFinder — Manuale d'uso

**Versione 1.0.0** · Windows, macOS e Linux · applicazione desktop portatile

DupFinder trova i file duplicati sul computer e ti aiuta a eliminarli in sicurezza. Non si ferma al nome: può confrontare **dimensione**, **contenuto** (hash SHA-256 o MD5), **estensione**, **nome** e **data di modifica**. Due file sono considerati identici solo se superano i criteri che hai selezionato.

Questo file è il manuale dell'applicazione. Lo trovi anche **dentro il programma**: in alto a destra apri **Guida**.

---

## Avvio

Non serve installare nulla.

1. Scarica `DupFinder-windows-portable.exe` dalla [pagina Releases](https://github.com/IlRed89/DupFinder/releases/latest).
2. Fai doppio clic sul file. Si apre la finestra scura di DupFinder.
3. Windows può mostrare SmartScreen perché l'eseguibile non è firmato: scegli **Ulteriori informazioni** e poi **Esegui comunque**.

Su macOS e Linux usa il pacchetto della stessa release (`.dmg` o `.AppImage`).

---

## Flusso consigliato (prima volta)

1. Clicca **Aggiungi Cartella** e scegli la cartella da analizzare (Foto, Download, Documenti…). Puoi aggiungerne più di una: DupFinder confronta anche i file che stanno in cartelle diverse.
2. Lascia attivi **Stessa Dimensione** e **Hash Contenuto (2-Step)**. Così trovi copie identiche anche se i nomi sono diversi (`foto.jpg` e `copia di foto.jpg`).
3. Clicca **Avvia Scansione** e attendi la barra di avanzamento.
4. Leggi i gruppi: la riga verde **Originale** è quella che verrà conservata; le righe rosse **Duplicato** sono le copie in più.
5. Controlla i percorsi (icona cartella) prima di cancellare.
6. Elimina un singolo duplicato con l'icona cestino, oppure usa **Pulizia Rapida Duplicati** per togliere tutte le copie in un colpo solo (con conferma).
7. Se vuoi solo un elenco, esporta **CSV** (si apre con Excel) o **JSON**.

Finché non confermi, **nessun file viene cancellato**.

---

## Interfaccia

### Intestazione

- **Guida** — apre questo manuale dentro l'applicazione. Da lì puoi anche aprire il file `README.md` con il visualizzatore di testo del sistema.
- **File di Log** — mostra il percorso del diario tecnico (utile se qualcosa non funziona).

### Cartelle da analizzare

- **Aggiungi Cartella** apre la finestra nativa del sistema (Esplora file / Finder).
- Ogni cartella compare nell'elenco: puoi toglierne una sola o **Rimuovi Tutte**.
- DupFinder scende in tutte le sottocartelle.
- I collegamenti simbolici non vengono seguiti, per evitare di contare due volte lo stesso file o di entrare in cicli.
- Se una cartella è protetta (`EPERM`, `EACCES`, `EBUSY`), viene saltata in silenzio e la scansione continua.

### Parametri di confronto

I criteri si combinano in **AND**: un file entra in un gruppo solo se soddisfa **tutti** quelli spuntati.

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
- **Filtra per estensioni** — elenco separato da virgola, con o senza punto: `.jpg, png, mp4`. Vuoto = tutti i tipi.
- **Includi cartelle e file nascosti** — spunta solo se vuoi analizzare anche elementi che iniziano con `.` o che Windows marca come nascosti.

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

## File di log

Ogni scansione, errore di permesso e azione di pulizia viene scritta su disco, con rotazione automatica (massimo circa 5 MB).

Percorsi tipici:

- **Windows:** `%USERPROFILE%\AppData\Roaming\dupfinder\logs\main.log`
- **macOS:** `~/Library/Logs/dupfinder/main.log`
- **Linux:** `~/.config/dupfinder/logs/main.log`

Il pulsante **File di Log** in intestazione mostra il percorso esatto su questa macchina. Puoi allegare il file a una segnalazione su GitHub.

---

## Consigli pratici

- Parti da una cartella tua (Foto, Download). Evita `C:\Windows` o le cartelle di sistema: non è il caso d'uso e i permessi bloccano gran parte dei file.
- Per le foto: Dimensione + Hash, estensioni `.jpg, .jpeg, .png, .heic, .raw`.
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
È un falso positivo frequente sugli exe portatili non firmati. Confronta l'hash del file scaricato con `SHA256SUMS.txt` nella release.

---

## Limitazioni

- Non analizza file in uso esclusivo dal sistema se il sistema operativo rifiuta la lettura.
- Non “deduplica” i file lasciando un collegamento: elimina le copie oppure lascia tutto com'è.
- Non confronta il contenuto “simile” (immagini quasi uguali, documenti con piccole modifiche).
- L'etichetta Originale è la prima occorrenza trovata, non necessariamente il file più vecchio.

---

## Licenza

DupFinder è distribuito con licenza **MIT**. Vedi il file `LICENSE` nel repository.

Autore: Fabio Rossi ([IlRed89](https://github.com/IlRed89/DupFinder)).

---

## Per chi sviluppa

Requisiti: Node.js 20 o 22, npm 10.

```bash
git clone https://github.com/IlRed89/DupFinder.git
cd DupFinder
npm install
npm test
npm start
```

Pacchetti:

```bash
npm run dist:win-portable   # Windows .exe portatile
npm run dist:linux          # Linux .AppImage
npm run dist:mac            # macOS .dmg
```

I file finiscono in `dist/`. `README.md` viene incluso nell'applicazione (`extraResources`) e può essere letto dalla voce **Guida**.
