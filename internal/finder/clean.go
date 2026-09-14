package finder

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// KeepPolicy decides which copy survives a Clean.
type KeepPolicy string

const (
	KeepNewest KeepPolicy = "newest"
	KeepOldest KeepPolicy = "oldest"
	KeepFirst  KeepPolicy = "first"
)

// CleanPlan is a single deletion/move decided by PlanClean.
type CleanPlan struct {
	Keep   string `json:"keep"`
	Remove string `json:"remove"`
	Size   int64  `json:"size"`
}

// PlanClean decides, for every duplicate group, which file to keep and which
// to remove according to policy. Nothing is touched on disk.
func PlanClean(groups []Group, policy KeepPolicy) ([]CleanPlan, error) {
	var plans []CleanPlan
	for _, g := range groups {
		keep, err := pickKeep(g.Files, policy)
		if err != nil {
			return nil, err
		}
		for _, f := range g.Files {
			if f == keep {
				continue
			}
			var size int64 = g.Size
			if fi, err := os.Stat(f); err == nil {
				size = fi.Size()
			}
			plans = append(plans, CleanPlan{Keep: keep, Remove: f, Size: size})
		}
	}
	sort.Slice(plans, func(i, j int) bool { return plans[i].Remove < plans[j].Remove })
	return plans, nil
}

func pickKeep(files []string, policy KeepPolicy) (string, error) {
	if len(files) == 0 {
		return "", fmt.Errorf("gruppo vuoto")
	}
	switch policy {
	case KeepFirst:
		sorted := append([]string(nil), files...)
		sort.Strings(sorted)
		return sorted[0], nil
	case KeepNewest, KeepOldest, "":
		type entry struct {
			path string
			mod  time.Time
		}
		entries := make([]entry, 0, len(files))
		for _, f := range files {
			fi, err := os.Stat(f)
			if err != nil {
				continue
			}
			entries = append(entries, entry{f, fi.ModTime()})
		}
		if len(entries) == 0 {
			return "", fmt.Errorf("nessun file leggibile nel gruppo")
		}
		sort.Slice(entries, func(i, j int) bool {
			if entries[i].mod.Equal(entries[j].mod) {
				return entries[i].path < entries[j].path
			}
			if policy == KeepOldest {
				return entries[i].mod.Before(entries[j].mod)
			}
			return entries[i].mod.After(entries[j].mod) // newest (default)
		})
		return entries[0].path, nil
	default:
		return "", fmt.Errorf("criterio --keep non valido: %q (usa newest, oldest o first)", string(policy))
	}
}

// ApplyDelete removes every plan.Remove file, returns freed bytes.
func ApplyDelete(plans []CleanPlan, log io.Writer) (int64, error) {
	var freed int64
	for _, p := range plans {
		if err := os.Remove(p.Remove); err != nil {
			fmt.Fprintf(log, "ERRORE %-60s %v\n", p.Remove, err)
			continue
		}
		freed += p.Size
		fmt.Fprintf(log, "eliminato %s (tenuto %s)\n", p.Remove, p.Keep)
	}
	return freed, nil
}

// ApplyMove moves every plan.Remove file into destDir (flattened with a
// numeric suffix on collisions), returns moved bytes.
func ApplyMove(plans []CleanPlan, destDir string, log io.Writer) (int64, error) {
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return 0, err
	}
	var moved int64
	for _, p := range plans {
		dst := filepath.Join(destDir, filepath.Base(p.Remove))
		if _, err := os.Stat(dst); err == nil {
			dst = uniqueName(destDir, filepath.Base(p.Remove))
		}
		if err := os.Rename(p.Remove, dst); err != nil {
			fmt.Fprintf(log, "ERRORE %-60s %v\n", p.Remove, err)
			continue
		}
		moved += p.Size
		fmt.Fprintf(log, "spostato %s -> %s (tenuto %s)\n", p.Remove, dst, p.Keep)
	}
	return moved, nil
}

func uniqueName(dir, base string) string {
	ext := filepath.Ext(base)
	stem := base[:len(base)-len(ext)]
	for i := 2; ; i++ {
		candidate := filepath.Join(dir, fmt.Sprintf("%s_%d%s", stem, i, ext))
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}
}
