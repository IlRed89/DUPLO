package finder

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
)

// FormatBytes renders a byte count in human form (B, KB, MB, ...).
func FormatBytes(b int64) string {
	if b < 1024 {
		return fmt.Sprintf("%d B", b)
	}
	units := []string{"KB", "MB", "GB", "TB", "PB"}
	v := float64(b)
	u := -1
	for v >= 1024 && u < len(units)-1 {
		v /= 1024
		u++
	}
	return fmt.Sprintf("%.1f %s", v, units[u])
}

// PrintHuman writes the classic readable report to w.
func PrintHuman(w io.Writer, res Result) {
	fmt.Fprintf(w, "Duplicati: %d gruppi, %d file, %s recuperabili\n",
		len(res.Groups), res.TotalFiles(), FormatBytes(res.TotalWasted()))
	fmt.Fprintf(w, "Scansionati: %d file (%d con hash, %s letti)\n\n",
		res.FilesSeen, res.FilesHashed, FormatBytes(res.BytesHashed))

	if len(res.Groups) == 0 {
		fmt.Fprintln(w, "Nessun duplicato trovato.")
		return
	}
	for i, g := range res.Groups {
		fmt.Fprintf(w, "Gruppo %d — %s cad., %d file, %s sprecati [sha256:%.12s…]\n",
			i+1, FormatBytes(g.Size), len(g.Files), FormatBytes(g.Wasted()), g.Hash)
		for _, f := range g.Files {
			fmt.Fprintf(w, "  %s\n", f)
		}
		fmt.Fprintln(w)
	}
}

// WriteJSON writes the machine-readable report to w.
func WriteJSON(w io.Writer, res Result) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(res)
}

// WriteCSV writes one row per duplicated file to path.
func WriteCSV(path string, res Result) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	cw := csv.NewWriter(f)
	defer cw.Flush()
	if err := cw.Write([]string{"gruppo", "hash_sha256", "dimensione_byte", "file"}); err != nil {
		return err
	}
	for i, g := range res.Groups {
		for _, file := range g.Files {
			if err := cw.Write([]string{
				fmt.Sprintf("%d", i+1),
				g.Hash,
				fmt.Sprintf("%d", g.Size),
				file,
			}); err != nil {
				return err
			}
		}
	}
	return cw.Error()
}

// ShortHash trims a hex hash for display.
func ShortHash(h string) string {
	if len(h) > 12 {
		return h[:12] + "…"
	}
	return h
}
