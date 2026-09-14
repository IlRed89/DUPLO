# DupFinder 🔍✨

[![Electron Version](https://img.shields.io/badge/Electron-33.x-47848F?logo=electron)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#)
[![Release](https://img.shields.io/github/v/release/IlRed89/DupFinder)](https://github.com/IlRed89/DupFinder/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**DupFinder** è un'applicazione desktop grafica, moderna, portatile e multipiattaforma (**Windows, macOS, Linux**) progettata per trovare ed eliminare in sicurezza i file duplicati sul tuo computer. 

Sviluppata con un'interfaccia utente ultra user-friendly (**GUI scura, intuitiva e reattiva**), consente di scansionare più cartelle contemporaneamente e combinare parametri avanzati di confronto per garantire che vengano individuati solo file **veramente identici**.

---

## 📸 Caratteristiche Principali

- 🖥️ **Interfaccia Grafica Moderna & Intuitiva**:
  - Selezione visiva delle cartelle con finestre di dialogo native del sistema operativo.
  - Monitoraggio in tempo reale della scansione con barra di avanzamento a due stadi.
  - Statistiche immediate: totale file analizzati, gruppi duplicati, numero di doppioni e **spazio esatto recuperabile**.
- ⚡ **Algoritmo di Confronto a Due Stadi ad Alte Prestazioni**:
  1. **Pre-Filtro Rapido**: Raggruppamento per dimensione esatta in byte (elimina subito tutti i file a dimensione univoca).
  2. **Hash Parziale (Chunk 1MB)**: Legge e confronta solo la testa dei file candidati per scartare rapidamente falsi positivi senza sovraccaricare il disco.
  3. **Hash Completo (SHA-256 o MD5)**: Hashing asincrono a blocchi da 64KB tramite stream Node.js (garantisce corrispondenza byte-per-byte senza mai esaurire la memoria RAM, anche per file da diversi Gigabyte).
- ⚙️ **Parametri di Confronto Flessibili**:
  - **Dimensione file** (raccomandato come primo filtro istantaneo)
  - **Hash del contenuto** (SHA-256 sicuro o MD5 veloce)
  - **Stesso nome esatto**
  - **Stessa estensione**
  - **Data di ultima modifica**
  - Filtri per dimensione minima in KB, estensioni incluse/escluse e file nascosti.
- 🧹 **Gestione Sicura dei Duplicati**:
  - Anteprima con distinzione automatica tra file **Originale** (verde) e **Duplicato** (rosso).
  - Apertura immediata della cartella contenitore nel file manager nativo (Windows Explorer, macOS Finder, Linux File Manager).
  - Eliminazione mirata del singolo file con dialogo di conferma preventiva.
  - Funzione **Pulizia Rapida**: elimina automaticamente tutti i duplicati conservando solo l'originale con un clic.
- 📊 **Esportazione Report**:
  - Salvataggio dei risultati in formato **JSON** e **CSV**.
- 🛡️ **Antiproiettile sui Permessi di Sistema**:
  - Gestione specifica e silenziosa degli errori `EPERM`, `EACCES`, `EBUSY` su cartelle protette di Windows, macOS e Linux. La scansione prosegue sui percorsi accessibili senza mai arrestarsi o andare in crash.
- 📝 **Logging Totale & Troubleshooting**:
  - Sistema di tracciamento capillare con `electron-log`: ogni operazione, scansione, calcolo hash o azione utente viene salvata su un file di log fisico persistente.

---

## 📥 Download Eseguibile Portatile (Windows)

Non serve installare nulla: scarica l'eseguibile standalone pronto all'uso:

👉 [**Scarica DupFinder-windows-portable.exe**](https://github.com/IlRed89/DupFinder/releases/latest)

Basta fare doppio clic sul file `.exe` per avviare subito l'applicazione.

---

## 🗺️ Dove Trovare i File di Log (Troubleshooting e Diagnostica)

In produzione e durante l'uso quotidiano, **DupFinder** registra tutti gli eventi su file persistenti con rotazione automatica (max 5MB). In caso di anomalie o per inviare segnalazioni su GitHub, i file di log si trovano nei seguenti percorsi nativi:

### 🪟 Windows
```
%USERPROFILE%\AppData\Roaming\dupfinder\logs\main.log
```
*(Puoi incollare `%USERPROFILE%\AppData\Roaming\dupfinder\logs` nella barra degli indirizzi di Esplora Risorse per aprirlo direttamente)*

### 🍎 macOS
```
~/Library/Logs/dupfinder/main.log
```

### 🐧 Linux
```
~/.config/dupfinder/logs/main.log
```

> 💡 **Suggerimento:** All'interno dell'applicazione puoi cliccare sul pulsante **"File di Log"** in alto a destra per visualizzare istantaneamente il percorso esatto sul tuo computer.

---

## 🧱 Architettura del Progetto

```
DupFinder/
├── build/                     # Asset grafici e icone multipiattaforma
│   ├── icon.svg               # Master vettoriale (Lente d'ingrandimento + documenti)
│   ├── icon.png               # Icona PNG 512x512
│   ├── icon.ico               # Icona Windows multi-risoluzione
│   └── icon.icns              # Icona nativa Apple macOS
├── src/
│   ├── logger.js              # Configurazione logging persistente (electron-log)
│   ├── hasher.js              # Hashing a due stadi (partial chunk 1MB + full stream)
│   ├── scanner.js             # Motore di navigazione filesystem, normalizzazione e filtri
│   ├── scanner.test.js        # Test di unità automatizzati Node.js
│   └── renderer/              # Frontend Interfaccia Grafica (GUI)
│       ├── index.html         # Struttura semantica desktop
│       ├── styles.css         # Tema scuro moderno, animazioni e layout reattivo
│       └── renderer.js        # Gestione eventi UI, progress bar, modali e IPC
├── main.js                    # Main Process di Electron (ciclo di vita, IPC, finestre)
├── preload.js                 # Bridge IPC sicuro con contextBridge (contextIsolation attivo)
├── package.json               # Dipendenze, script di build e config electron-builder
└── .github/workflows/         # Pipeline CI/CD GitHub Actions per release automatizzate
```

---

## 💻 Sviluppo Locale e Compilazione

### Requisiti
- **Node.js** 20+ o 22+
- **npm** 10+

### 1. Clonare e installare le dipendenze
```bash
git clone https://github.com/IlRed89/DupFinder.git
cd DupFinder
npm install
```

### 2. Avviare i test unitari del motore
```bash
npm test
```

### 3. Avviare l'applicazione in modalità sviluppo
```bash
npm start
```

### 4. Compilazione dei Pacchetti Distribuiti (`electron-builder`)

- **Eseguibile Windows Portatile (`.exe`)**:
  ```bash
  npm run dist:win-portable
  ```
- **Immagine Linux Portatile (`.AppImage`)**:
  ```bash
  npm run dist:linux
  ```
- **Pacchetto Installatore macOS (`.dmg`)**:
  ```bash
  npm run dist:mac
  ```

Tutti i file compilati verranno generati all'interno della cartella `dist/`.

---

## 📄 Licenza

Distribuito sotto licenza **MIT**. Consulta il file [LICENSE](LICENSE) per tutti i dettagli.
