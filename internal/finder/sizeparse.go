package finder

import (
	"fmt"
	"strconv"
	"strings"
)

// ParseSize parses strings like "1024", "10KB", "5 MB", "2GB", "1TB".
// A bare number means bytes. Suffixes are powers of 1024.
func ParseSize(s string) (int64, error) {
	s = strings.TrimSpace(strings.ToUpper(s))
	if s == "" {
		return 0, fmt.Errorf("dimensione vuota")
	}
	mult := int64(1)
	for _, suf := range []struct {
		suffix string
		mult   int64
	}{
		{"TB", 1 << 40}, {"GB", 1 << 30}, {"MB", 1 << 20}, {"KB", 1 << 10},
		{"T", 1 << 40}, {"G", 1 << 30}, {"M", 1 << 20}, {"K", 1 << 10},
		{"B", 1},
	} {
		if strings.HasSuffix(s, suf.suffix) {
			mult = suf.mult
			s = strings.TrimSpace(strings.TrimSuffix(s, suf.suffix))
			break
		}
	}
	n, err := strconv.ParseFloat(s, 64)
	if err != nil || n < 0 {
		return 0, fmt.Errorf("dimensione non valida: %q (es. 1KB, 10MB, 2GB)", s)
	}
	return int64(n * float64(mult)), nil
}
