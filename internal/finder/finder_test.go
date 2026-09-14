package finder

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestScanFindsDuplicates(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "a.txt"), "stesso contenuto")
	writeFile(t, filepath.Join(dir, "sub", "b.txt"), "stesso contenuto")
	writeFile(t, filepath.Join(dir, "c.txt"), "contenuto diverso!!")

	res, err := Scan([]string{dir}, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Groups) != 1 {
		t.Fatalf("attesi 1 gruppo, trovati %d", len(res.Groups))
	}
	if len(res.Groups[0].Files) != 2 {
		t.Fatalf("attesi 2 file nel gruppo, trovati %d", len(res.Groups[0].Files))
	}
	if res.Groups[0].Hash == "" {
		t.Fatal("hash mancante")
	}
}

func TestScanIgnoresUniqueSizes(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "a.txt"), "abc")
	writeFile(t, filepath.Join(dir, "b.txt"), "defgh")

	res, err := Scan([]string{dir}, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Groups) != 0 {
		t.Fatalf("attesi 0 gruppi, trovati %d", len(res.Groups))
	}
}

func TestScanSameSizeDifferentContent(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "a.bin"), "12345678")
	writeFile(t, filepath.Join(dir, "b.bin"), "87654321")

	res, err := Scan([]string{dir}, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Groups) != 0 {
		t.Fatalf("stessa dimensione ma contenuto diverso: attesi 0 gruppi, trovati %d", len(res.Groups))
	}
}

func TestScanFilters(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "a.jpg"), "immagine!!!")
	writeFile(t, filepath.Join(dir, "b.jpg"), "immagine!!!")
	writeFile(t, filepath.Join(dir, "c.txt"), "immagine!!!")

	res, err := Scan([]string{dir}, Options{Extensions: map[string]bool{"jpg": true}})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Groups) != 1 || len(res.Groups[0].Files) != 2 {
		t.Fatalf("filtro estensioni non rispettato: %+v", res.Groups)
	}

	res, err = Scan([]string{dir}, Options{MinSize: 1000})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Groups) != 0 {
		t.Fatalf("filtro min-size non rispettato: %+v", res.Groups)
	}
}

func TestPlanCleanPolicies(t *testing.T) {
	dir := t.TempDir()
	old := filepath.Join(dir, "old.txt")
	mid := filepath.Join(dir, "mid.txt")
	writeFile(t, old, "duplicato!")
	writeFile(t, mid, "duplicato!")
	writeFile(t, filepath.Join(dir, "new.txt"), "duplicato!")

	oldTime := time.Now().Add(-48 * time.Hour)
	midTime := time.Now().Add(-24 * time.Hour)
	if err := os.Chtimes(old, oldTime, oldTime); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(mid, midTime, midTime); err != nil {
		t.Fatal(err)
	}

	res, err := Scan([]string{dir}, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Groups) != 1 {
		t.Fatalf("atteso 1 gruppo, trovati %d", len(res.Groups))
	}

	plans, err := PlanClean(res.Groups, KeepNewest)
	if err != nil {
		t.Fatal(err)
	}
	if len(plans) != 2 {
		t.Fatalf("attesi 2 file da rimuovere, trovati %d", len(plans))
	}
	for _, p := range plans {
		if filepath.Base(p.Keep) != "new.txt" {
			t.Fatalf("KeepNewest: tenuto %s invece di new.txt", p.Keep)
		}
	}

	plans, err = PlanClean(res.Groups, KeepOldest)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range plans {
		if filepath.Base(p.Keep) != "old.txt" {
			t.Fatalf("KeepOldest: tenuto %s invece di old.txt", p.Keep)
		}
	}
}

func TestParseSize(t *testing.T) {
	cases := map[string]int64{
		"1":    1,
		"1KB":  1024,
		"10MB": 10 << 20,
		"2 GB": 2 << 30,
		"512b": 512,
	}
	for in, want := range cases {
		got, err := ParseSize(in)
		if err != nil {
			t.Fatalf("ParseSize(%q): %v", in, err)
		}
		if got != want {
			t.Fatalf("ParseSize(%q) = %d, atteso %d", in, got, want)
		}
	}
	if _, err := ParseSize("ciao"); err == nil {
		t.Fatal("ParseSize(\"ciao\") doveva fallire")
	}
}
