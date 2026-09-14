// Package finder implements duplicate-file detection.
//
// Strategy (fast and safe):
//  1. walk the trees and group candidate files by size (files with a unique
//     size can never be duplicates, so they are discarded immediately);
//  2. for size groups with 2+ files, hash the first 64 KB (quick hash) to
//     prune files that only share the size;
//  3. hash the full content (SHA-256) of the survivors, concurrently;
//  4. files sharing the same full hash are reported as duplicates.
package finder

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
)

// partialHashBytes is how many leading bytes are hashed in the prune pass.
const partialHashBytes = 64 * 1024

// Options controls the scan behaviour.
type Options struct {
	// MinSize discards files smaller than this (in bytes).
	MinSize int64
	// Extensions, when non-empty, keeps only files with these extensions
	// (with or without leading dot, case-insensitive).
	Extensions map[string]bool
	// ExcludeDirs skips directories with these names (case-insensitive).
	ExcludeDirs map[string]bool
	// IncludeHidden also scans hidden files/dirs (dot prefix).
	IncludeHidden bool
	// Progress, when non-nil, is called with human-readable status updates.
	Progress func(msg string)
}

// Group is a set of files with identical content.
type Group struct {
	Hash  string   `json:"hash"`
	Size  int64    `json:"size"`
	Files []string `json:"files"`
}

// Wasted returns how many bytes could be freed by keeping a single copy.
func (g Group) Wasted() int64 {
	if len(g.Files) < 2 {
		return 0
	}
	return int64(len(g.Files)-1) * g.Size
}

// Result is the outcome of a Scan.
type Result struct {
	Groups      []Group `json:"groups"`
	FilesSeen   int     `json:"files_seen"`
	FilesHashed int     `json:"files_hashed"`
	BytesHashed int64   `json:"bytes_hashed"`
}

// TotalWasted sums reclaimable bytes across all groups.
func (r Result) TotalWasted() int64 {
	var total int64
	for _, g := range r.Groups {
		total += g.Wasted()
	}
	return total
}

// TotalFiles counts every file that is part of a duplicate group.
func (r Result) TotalFiles() int {
	n := 0
	for _, g := range r.Groups {
		n += len(g.Files)
	}
	return n
}

func (o Options) progress(msg string) {
	if o.Progress != nil {
		o.Progress(msg)
	}
}

func (o Options) excludedDir(name string) bool {
	if len(o.ExcludeDirs) == 0 {
		return false
	}
	return o.ExcludeDirs[strings.ToLower(name)]
}

func isHidden(name string) bool {
	return strings.HasPrefix(name, ".")
}

// job is a single file awaiting hashing.
type job struct {
	path string
	size int64
}

func (j job) sizeString() string {
	return itoa(j.size)
}

// Scan walks roots and returns groups of files with identical content.
func Scan(roots []string, opt Options) (Result, error) {
	var res Result

	bySize := make(map[int64][]string)
	for _, root := range roots {
		err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil // skip unreadable entries, keep going
			}
			name := d.Name()
			if d.IsDir() {
				if !opt.IncludeHidden && isHidden(name) && path != root {
					return filepath.SkipDir
				}
				if opt.excludedDir(name) {
					return filepath.SkipDir
				}
				return nil
			}
			if !opt.IncludeHidden && isHidden(name) {
				return nil
			}
			if d.Type()&fs.ModeSymlink != 0 {
				return nil
			}
			if len(opt.Extensions) > 0 {
				ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
				if !opt.Extensions[ext] && !opt.Extensions["."+ext] {
					return nil
				}
			}
			info, err := d.Info()
			if err != nil || !info.Mode().IsRegular() {
				return nil
			}
			if info.Size() < opt.MinSize {
				return nil
			}
			bySize[info.Size()] = append(bySize[info.Size()], path)
			res.FilesSeen++
			return nil
		})
		if err != nil {
			return res, err
		}
	}
	opt.progress("indicizzazione completata")

	// Keep only size groups that can contain duplicates.
	var quickJobs []job
	for size, paths := range bySize {
		if len(paths) > 1 {
			for _, p := range paths {
				quickJobs = append(quickJobs, job{p, size})
			}
		}
	}
	sort.Slice(quickJobs, func(i, j int) bool { return quickJobs[i].path < quickJobs[j].path })

	// Pass 2: quick (partial) hash to prune same-size-but-different files.
	quickHashes := hashFiles(quickJobs, true)
	byQuick := make(map[string][]job)
	for i, j := range quickJobs {
		byQuick[j.sizeString()+":"+quickHashes[i]] = append(byQuick[j.sizeString()+":"+quickHashes[i]], j)
	}

	// Pass 3: full hash of the survivors.
	var fullJobs []job
	for _, group := range byQuick {
		if len(group) > 1 {
			fullJobs = append(fullJobs, group...)
		}
	}
	opt.progress("hash in corso")
	fullHashes := hashFiles(fullJobs, false)
	res.FilesHashed = len(fullJobs)

	byFull := make(map[string]*Group)
	var order []string
	for i, j := range fullJobs {
		if fullHashes[i] == "" {
			continue // unreadable file: skip silently
		}
		res.BytesHashed += j.size
		key := j.sizeString() + ":" + fullHashes[i]
		g, ok := byFull[key]
		if !ok {
			g = &Group{Hash: fullHashes[i], Size: j.size}
			byFull[key] = g
			order = append(order, key)
		}
		g.Files = append(g.Files, j.path)
	}

	sort.Strings(order)
	for _, key := range order {
		g := byFull[key]
		if len(g.Files) < 2 {
			continue
		}
		sort.Strings(g.Files)
		res.Groups = append(res.Groups, *g)
	}

	sort.Slice(res.Groups, func(i, j int) bool {
		if res.Groups[i].Wasted() != res.Groups[j].Wasted() {
			return res.Groups[i].Wasted() > res.Groups[j].Wasted()
		}
		return res.Groups[i].Hash < res.Groups[j].Hash
	})

	return res, nil
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var buf [32]byte
	pos := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		pos--
		buf[pos] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}

// hashFiles hashes every job concurrently. When partial is true only the
// first partialHashBytes are read. A "" entry marks an unreadable file.
func hashFiles(jobs []job, partial bool) []string {
	out := make([]string, len(jobs))
	if len(jobs) == 0 {
		return out
	}

	workers := runtime.NumCPU()
	if workers < 1 {
		workers = 1
	}
	if workers > len(jobs) {
		workers = len(jobs)
	}

	idx := make(chan int, len(jobs))
	for i := range jobs {
		idx <- i
	}
	close(idx)

	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range idx {
				h, err := hashOne(jobs[i].path, partial)
				if err != nil {
					out[i] = ""
					continue
				}
				out[i] = h
			}
		}()
	}
	wg.Wait()
	return out
}

func hashOne(path string, partial bool) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	var r io.Reader = f
	if partial {
		r = io.LimitReader(f, partialHashBytes)
	}
	if _, err := io.Copy(h, r); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
