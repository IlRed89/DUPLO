# DupFinder

Trova **file duplicati per contenuto** (hash SHA-256) e ti aiuta a recuperare spazio su disco in sicurezza: elenco, report JSON/CSV, spostamento o eliminazione dei doppioni.

- Veloce: prima raggruppa per dimensione, poi confronta gli hash (concorrenza su tutti i core)
- Sicuro: due file sono "duplicati" solo se il contenuto è **byte-identico**
- Senza sorprese: `clean` senza `--yes` è sempre una simulazione

## Download (Windows)

Vai su [**Releases**](https://github.com/IlRed89/DupFinder/releases), scarica `DupFinder-windows-amd64.exe` dall'ultima release e aprilo da PowerShell o Prompt dei comandi. Nessuna installazione richiesta.

## Uso

```powershell
# Cerca duplicati nella cartella Foto
.\DupFinder-windows-amd64.exe scan C:\Foto

# Solo file sopra 1 MB, con report JSON e CSV
.\DupFinder-windows-amd64.exe scan C:\Foto --min-size 1MB --json report.json --csv report.csv

# Solo immagini, saltando le cartelle di sistema
.\DupFinder-windows-amd64.exe scan C:\Foto --ext jpg,png,heic --exclude-dir node_modules,.git

# Simulazione pulizia (non tocca nulla): tiene la copia più recente
.\DupFinder-windows-amd64.exe clean C:\Foto --keep newest --dry-run

# Pulizia vera: chiede conferma interattiva (digita SI)
.\DupFinder-windows-amd64.exe clean C:\Foto --keep oldest --yes

# Sposta i doppioni in una cartella invece di eliminarli
.\DupFinder-windows-amd64.exe clean C:\Foto --move-to C:\DaRivedere --yes
```

Su Linux/macOS la sintassi è identica (`./dupfinder scan /home/nome/Foto ...`).

### Opzioni di `scan`

| Opzione | Descrizione |
|---|---|
| `--min-size 1KB` | Ignora i file più piccoli (accetta `KB`, `MB`, `GB`, `TB`) |
| `--ext jpg,png` | Considera solo queste estensioni |
| `--exclude-dir nomi` | Salta le cartelle con questi nomi |
| `--hidden` | Includi anche file/cartelle nascosti |
| `--json file` | Salva il report in JSON |
| `--csv file` | Salva il report in CSV |
| `--quiet` | Mostra solo il riepilogo |

### Opzioni di `clean`

| Opzione | Descrizione |
|---|---|
| `--keep newest\|oldest\|first` | Quale copia tenere (default: `newest`) |
| `--move-to CARTELLA` | Sposta i doppioni qui invece di eliminarli |
| `--dry-run` | Mostra cosa succederebbe senza toccare nulla |
| `--yes` | Richiesto per procedere davvero (più conferma interattiva) |

## Compilare dai sorgenti

Serve [Go](https://go.dev/dl/) 1.22+:

```bash
go test ./...
go build -o dupfinder .

# Eseguibile Windows (cross-compilazione da Linux/macOS)
GOOS=windows GOARCH=amd64 go build -o DupFinder-windows-amd64.exe .
```

## Come funziona

1. **Indicizzazione**: scorre le cartelle e raggruppa i file per dimensione (una dimensione unica = mai un duplicato).
2. **Hash veloce**: sui gruppi rimasti calcola l'hash dei primi 64 KB per scartare i falsi positivi.
3. **Hash completo**: calcola lo SHA-256 dell'intero contenuto, in parallelo.
4. **Report**: i file con stesso SHA-256 sono duplicati, ordinati per spazio recuperabile.

## Licenza

MIT — vedi [LICENSE](LICENSE).
