// DupFinder finds files with identical content (SHA-256) and helps you
// reclaim disk space safely: list, export, move or delete the duplicates.
//
//	Usage:
//	  dupfinder scan <cartella>... [opzioni]
//	  dupfinder clean <cartella>... [opzioni]
//	  dupfinder --version
package main

import (
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/IlRed89/DupFinder/internal/finder"
)

// version is set at build time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "errore:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		usage()
		return fmt.Errorf("specifica un comando (scan o clean)")
	}
	switch args[0] {
	case "scan":
		return runScan(args[1:])
	case "clean":
		return runClean(args[1:])
	case "-h", "--help", "help":
		usage()
		return nil
	case "-v", "--version", "version":
		fmt.Println("dupfinder", version)
		return nil
	default:
		if !strings.HasPrefix(args[0], "-") {
			// Bare path: treat as `scan <paths...>`.
			return runScan(args)
		}
		usage()
		return fmt.Errorf("comando non riconosciuto: %q", args[0])
	}
}

func usage() {
	fmt.Print(`DupFinder — trova file duplicati per contenuto (SHA-256)

Uso:
  dupfinder scan <cartella>... [opzioni]    cerca duplicati
  dupfinder clean <cartella>... [opzioni]   elimina/sposta duplicati
  dupfinder --version                       mostra la versione

Esempi:
  dupfinder scan C:\Foto
  dupfinder scan C:\Foto --min-size 1MB --json report.json
  dupfinder clean C:\Foto --keep newest --dry-run
  dupfinder clean C:\Foto --keep oldest --move-to C:\DaRivedere --yes

Opzioni di 'scan':  --min-size, --ext, --exclude-dir, --hidden,
                    --json <file>, --csv <file>, --quiet
Opzioni di 'clean': --keep newest|oldest|first, --move-to <cartella>,
                    --dry-run, --yes (senza --yes non tocca nulla)
`)
}

type scanFlags struct {
	fs         *flag.FlagSet
	minSize    string
	ext        string
	excludeDir string
	hidden     bool
	jsonOut    string
	csvOut     string
	quiet      bool
}

// splitArgs partitions argv into flag tokens and positional paths so that
// options may appear before or after the folders
// (e.g. both `scan --json r.json DIR` and `scan DIR --json r.json` work).
func splitArgs(args []string, boolFlags map[string]bool, valueFlags map[string]bool) (flags []string, positionals []string) {
	for i := 0; i < len(args); i++ {
		tok := args[i]
		if tok == "--" {
			positionals = append(positionals, args[i+1:]...)
			break
		}
		if strings.HasPrefix(tok, "-") && tok != "-" {
			name := strings.TrimLeft(tok, "-")
			if eq := strings.Index(name, "="); eq >= 0 {
				name = name[:eq]
			}
			flags = append(flags, tok)
			if valueFlags[name] && !strings.Contains(tok, "=") && i+1 < len(args) {
				i++
				flags = append(flags, args[i])
			}
			continue
		}
		_ = boolFlags
		positionals = append(positionals, tok)
	}
	return flags, positionals
}

func newScanFlags(args []string) (*scanFlags, []string, error) {
	s := &scanFlags{fs: flag.NewFlagSet("scan", flag.ContinueOnError)}
	s.fs.StringVar(&s.minSize, "min-size", "1", "dimensione minima (es. 1KB, 10MB, 2GB)")
	s.fs.StringVar(&s.ext, "ext", "", "solo queste estensioni, separate da virgola (es. jpg,png)")
	s.fs.StringVar(&s.excludeDir, "exclude-dir", "", "cartelle da saltare, separate da virgola")
	s.fs.BoolVar(&s.hidden, "hidden", false, "includi file/cartelle nascosti")
	s.fs.StringVar(&s.jsonOut, "json", "", "salva il report in JSON nel file indicato")
	s.fs.StringVar(&s.csvOut, "csv", "", "salva il report in CSV nel file indicato")
	s.fs.BoolVar(&s.quiet, "quiet", false, "mostra solo il riepilogo")
	flagArgs, positional := splitArgs(args,
		map[string]bool{"hidden": true, "quiet": true},
		map[string]bool{"min-size": true, "ext": true, "exclude-dir": true, "json": true, "csv": true})
	if err := s.fs.Parse(flagArgs); err != nil {
		return nil, nil, err
	}
	return s, append(positional, s.fs.Args()...), nil
}

func runScan(args []string) error {
	s, roots, err := newScanFlags(args)
	if err != nil {
		return err
	}
	if len(roots) == 0 {
		return fmt.Errorf("uso: dupfinder scan <cartella>... [opzioni]")
	}
	for _, r := range roots {
		if fi, err := os.Stat(r); err != nil || !fi.IsDir() {
			return fmt.Errorf("cartella non valida: %q", r)
		}
	}

	minSize, err := finder.ParseSize(s.minSize)
	if err != nil {
		return err
	}
	opt := finder.Options{
		MinSize:       minSize,
		Extensions:    splitSet(s.ext),
		ExcludeDirs:   splitSet(s.excludeDir),
		IncludeHidden: s.hidden,
		Progress:      func(msg string) { fmt.Fprintln(os.Stderr, "…", msg) },
	}
	if s.quiet {
		opt.Progress = nil
	}

	res, err := finder.Scan(roots, opt)
	if err != nil {
		return err
	}

	if s.jsonOut != "" {
		f, err := os.Create(s.jsonOut)
		if err != nil {
			return err
		}
		werr := finder.WriteJSON(f, res)
		cerr := f.Close()
		if werr != nil {
			return werr
		}
		if cerr != nil {
			return cerr
		}
		fmt.Println("Report JSON salvato in", s.jsonOut)
	}
	if s.csvOut != "" {
		if err := finder.WriteCSV(s.csvOut, res); err != nil {
			return err
		}
		fmt.Println("Report CSV salvato in", s.csvOut)
	}
	if s.quiet {
		fmt.Printf("%d gruppi, %d file, %s recuperabili\n",
			len(res.Groups), res.TotalFiles(), finder.FormatBytes(res.TotalWasted()))
		return nil
	}
	finder.PrintHuman(os.Stdout, res)
	return nil
}

type cleanFlags struct {
	fs      *flag.FlagSet
	keep    string
	moveTo  string
	dryRun  bool
	confirm bool
	minSize string
	ext     string
	exclDir string
	hidden  bool
}

func runClean(args []string) error {
	c := &cleanFlags{fs: flag.NewFlagSet("clean", flag.ContinueOnError)}
	c.fs.StringVar(&c.keep, "keep", "newest", "quale copia tenere: newest, oldest o first")
	c.fs.StringVar(&c.moveTo, "move-to", "", "sposta i duplicati qui invece di eliminarli")
	c.fs.BoolVar(&c.dryRun, "dry-run", false, "mostra cosa succederebbe senza toccare nulla")
	c.fs.BoolVar(&c.confirm, "yes", false, "conferma: senza questo flag non viene toccato nulla")
	c.fs.StringVar(&c.minSize, "min-size", "1", "dimensione minima (es. 1KB, 10MB, 2GB)")
	c.fs.StringVar(&c.ext, "ext", "", "solo queste estensioni, separate da virgola")
	c.fs.StringVar(&c.exclDir, "exclude-dir", "", "cartelle da saltare, separate da virgola")
	c.fs.BoolVar(&c.hidden, "hidden", false, "includi file/cartelle nascosti")
	flagArgs, positional := splitArgs(args,
		map[string]bool{"dry-run": true, "yes": true, "hidden": true},
		map[string]bool{"keep": true, "move-to": true, "min-size": true, "ext": true, "exclude-dir": true})
	if err := c.fs.Parse(flagArgs); err != nil {
		return err
	}
	roots := append(positional, c.fs.Args()...)
	if len(roots) == 0 {
		return fmt.Errorf("uso: dupfinder clean <cartella>... [--keep newest|oldest|first] [--move-to DIR] [--yes]")
	}

	minSize, err := finder.ParseSize(c.minSize)
	if err != nil {
		return err
	}
	opt := finder.Options{
		MinSize:       minSize,
		Extensions:    splitSet(c.ext),
		ExcludeDirs:   splitSet(c.exclDir),
		IncludeHidden: c.hidden,
		Progress:      func(msg string) { fmt.Fprintln(os.Stderr, "…", msg) },
	}
	res, err := finder.Scan(roots, opt)
	if err != nil {
		return err
	}
	if len(res.Groups) == 0 {
		fmt.Println("Nessun duplicato trovato: nulla da fare.")
		return nil
	}

	plans, err := finder.PlanClean(res.Groups, finder.KeepPolicy(strings.ToLower(c.keep)))
	if err != nil {
		return err
	}
	action := "eliminati"
	if c.moveTo != "" {
		action = "spostati in " + c.moveTo
	}
	fmt.Printf("%d file duplicati (%s), %s se confermi.\n\n",
		len(plans), finder.FormatBytes(sumPlans(plans)), action)
	for _, p := range plans {
		fmt.Printf("  %s  (tengo %s)\n", p.Remove, p.Keep)
	}
	fmt.Println()

	if c.dryRun || !c.confirm {
		fmt.Println("[SIMULAZIONE] Nulla è stato modificato. Aggiungi --yes per procedere davvero.")
		return nil
	}

	fmt.Println("Conferma digitando SI e premendo Invio:")
	var answer string
	if _, err := fmt.Scanln(&answer); err != nil {
		return fmt.Errorf("operazione annullata")
	}
	if strings.TrimSpace(strings.ToUpper(answer)) != "SI" {
		return fmt.Errorf("operazione annullata")
	}

	if c.moveTo != "" {
		moved, err := finder.ApplyMove(plans, c.moveTo, os.Stdout)
		if err != nil {
			return err
		}
		fmt.Printf("\nSpostati %s in %s.\n", finder.FormatBytes(moved), c.moveTo)
	} else {
		freed, err := finder.ApplyDelete(plans, os.Stdout)
		if err != nil {
			return err
		}
		fmt.Printf("\nLiberati %s.\n", finder.FormatBytes(freed))
	}
	return nil
}

func sumPlans(plans []finder.CleanPlan) int64 {
	var total int64
	for _, p := range plans {
		total += p.Size
	}
	return total
}

// splitSet turns "a, b,c" into a lowercase set.
func splitSet(s string) map[string]bool {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	set := make(map[string]bool)
	for _, part := range strings.Split(s, ",") {
		part = strings.ToLower(strings.TrimSpace(part))
		if part != "" {
			set[part] = true
		}
	}
	return set
}
