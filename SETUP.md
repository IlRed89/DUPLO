# Setup di DUPLO

**Versione 1.0.0** · Windows, macOS e Linux

DUPLO non è un unico exe portatile: la release è una **cartella** con l'eseguibile e i file di runtime (dll, pak, risorse). Estrai tutto lo zip e avvia `DUPLO.exe` **dalla stessa cartella**. Se sposti solo l'exe, l'app non parte.

## Download

File dalla [pagina Releases](https://github.com/IlRed89/DUPLO/releases/latest):

| File | Sistema |
| --- | --- |
| `DUPLO-1.0.0-win-x64.zip` | Windows 64-bit |
| `DUPLO-1.0.0-win-ia32.zip` | Windows 32-bit |
| `DUPLO-1.0.0-linux-x64.zip` | Linux 64-bit |

Confronta l'hash con `SHA256SUMS.txt` nella stessa release.

## Windows

1. Scarica `DUPLO-1.0.0-win-x64.zip` (64-bit) oppure `DUPLO-1.0.0-win-ia32.zip` (32-bit).
2. Estrai lo zip in una cartella tua (Desktop, Programmi, USB…).
3. Entra nella cartella estratta e fai doppio clic su **DUPLO.exe**.
4. Se compare **Windows ha protetto il PC** (SmartScreen): **Ulteriori informazioni** → **Esegui comunque**. L'eseguibile non è firmato.

Lo zip contiene una cartella **con lo stesso nome dell'archivio** (es. `DUPLO-1.0.0-win-x64`), non `win-unpacked`. Dentro trovi `DUPLO.exe` e le `.dll`. Non spostare solo l'exe.

## Linux

1. Scarica `DUPLO-1.0.0-linux-x64.zip`.
2. Estrai e avvia `./DUPLO` (`chmod +x DUPLO` se serve).

Linux 32-bit non è disponibile (Electron 33 non pubblica più un runtime ia32).

## macOS

La cartella unpacked va compilata su un Mac:

```bash
git clone https://github.com/IlRed89/DUPLO.git
cd DUPLO
npm install
npm run dist:mac
```

Dentro l'output trovi `DUPLO.app`.

## Dopo l'avvio

Manuale completo: [README.md](README.md) (anche dal pulsante **Guida** nell'app, o **Aiuto → Guida**, F1).

Licenza MIT. Autore: Fabio Rossi ([IlRed89](https://github.com/IlRed89/DUPLO)).
