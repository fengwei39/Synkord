// Package diff computes line-level text differences between two contract versions.
package diff

import "strings"

// LineType classifies a diff line.
type LineType string

const (
	LineContext LineType = "context"
	LineAdded   LineType = "added"
	LineRemoved LineType = "removed"
)

// Line is one line in a diff hunk.
type Line struct {
	Type    LineType `json:"type"`
	OldNum  int      `json:"oldNum,omitempty"` // 1-based; 0 for pure additions
	NewNum  int      `json:"newNum,omitempty"` // 1-based; 0 for pure removals
	Content string   `json:"content"`
}

// Hunk is a contiguous block of changes with surrounding context.
type Hunk struct {
	OldStart int    `json:"oldStart"`
	NewStart int    `json:"newStart"`
	Lines    []Line `json:"lines"`
}

// Stats summarises the diff.
type Stats struct {
	Added   int `json:"added"`
	Removed int `json:"removed"`
}

// Result is the full diff between two versions.
type Result struct {
	From  string `json:"from"`
	To    string `json:"to"`
	Hunks []Hunk `json:"hunks"`
	Stats Stats  `json:"stats"`
}

const contextSize = 3

// Compute returns the line-level diff between fromContent and toContent.
func Compute(fromVersion, toVersion, fromContent, toContent string) *Result {
	a := splitLines(fromContent)
	b := splitLines(toContent)

	edits := lcs(a, b)
	hunks := buildHunks(edits, a, b)

	stats := Stats{}
	for _, h := range hunks {
		for _, l := range h.Lines {
			switch l.Type {
			case LineAdded:
				stats.Added++
			case LineRemoved:
				stats.Removed++
			}
		}
	}

	return &Result{From: fromVersion, To: toVersion, Hunks: hunks, Stats: stats}
}

// ─── edit script ─────────────────────────────────────────────────────────────

type opKind int

const (
	opEqual  opKind = iota
	opInsert        // in b only
	opDelete        // in a only
)

type edit struct {
	op   opKind
	aIdx int
	bIdx int
}

// lcs builds an edit list using LCS dynamic programming (O(n*m)).
// Suitable for contract files which are typically small-to-medium.
func lcs(a, b []string) []edit {
	m, n := len(a), len(b)
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}
	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if a[i-1] == b[j-1] {
				dp[i][j] = dp[i-1][j-1] + 1
			} else if dp[i-1][j] > dp[i][j-1] {
				dp[i][j] = dp[i-1][j]
			} else {
				dp[i][j] = dp[i][j-1]
			}
		}
	}

	edits := make([]edit, 0, m+n)
	i, j := m, n
	for i > 0 || j > 0 {
		if i > 0 && j > 0 && a[i-1] == b[j-1] {
			edits = append(edits, edit{op: opEqual, aIdx: i - 1, bIdx: j - 1})
			i--
			j--
		} else if j > 0 && (i == 0 || dp[i][j-1] >= dp[i-1][j]) {
			edits = append(edits, edit{op: opInsert, bIdx: j - 1})
			j--
		} else {
			edits = append(edits, edit{op: opDelete, aIdx: i - 1})
			i--
		}
	}

	// reverse
	for l, r := 0, len(edits)-1; l < r; l, r = l+1, r-1 {
		edits[l], edits[r] = edits[r], edits[l]
	}
	return edits
}

// ─── hunk builder ────────────────────────────────────────────────────────────

func buildHunks(edits []edit, a, b []string) []Hunk {
	type rawLine struct {
		edit
		oldNum int
		newNum int
	}

	// Assign line numbers
	lines := make([]rawLine, 0, len(edits))
	oldN, newN := 0, 0
	for _, e := range edits {
		rl := rawLine{edit: e}
		switch e.op {
		case opEqual:
			oldN++
			newN++
			rl.oldNum = oldN
			rl.newNum = newN
		case opDelete:
			oldN++
			rl.oldNum = oldN
		case opInsert:
			newN++
			rl.newNum = newN
		}
		lines = append(lines, rl)
	}

	// Find changed positions
	changed := make([]bool, len(lines))
	for i, l := range lines {
		changed[i] = l.op != opEqual
	}

	// Expand context around changed lines
	inHunk := make([]bool, len(lines))
	for i, c := range changed {
		if c {
			lo := i - contextSize
			if lo < 0 {
				lo = 0
			}
			hi := i + contextSize
			if hi >= len(lines) {
				hi = len(lines) - 1
			}
			for k := lo; k <= hi; k++ {
				inHunk[k] = true
			}
		}
	}

	// Build hunks from inHunk spans
	var hunks []Hunk
	i := 0
	for i < len(lines) {
		if !inHunk[i] {
			i++
			continue
		}
		// Start of a hunk
		start := i
		for i < len(lines) && inHunk[i] {
			i++
		}
		span := lines[start:i]

		hunk := Hunk{}
		for _, rl := range span {
			switch rl.op {
			case opEqual:
				if hunk.OldStart == 0 {
					hunk.OldStart = rl.oldNum
					hunk.NewStart = rl.newNum
				}
				hunk.Lines = append(hunk.Lines, Line{
					Type:    LineContext,
					OldNum:  rl.oldNum,
					NewNum:  rl.newNum,
					Content: a[rl.aIdx],
				})
			case opDelete:
				if hunk.OldStart == 0 {
					hunk.OldStart = rl.oldNum
				}
				hunk.Lines = append(hunk.Lines, Line{
					Type:    LineRemoved,
					OldNum:  rl.oldNum,
					Content: a[rl.aIdx],
				})
			case opInsert:
				if hunk.NewStart == 0 {
					hunk.NewStart = rl.newNum
				}
				hunk.Lines = append(hunk.Lines, Line{
					Type:    LineAdded,
					NewNum:  rl.newNum,
					Content: b[rl.bIdx],
				})
			}
		}
		if len(hunk.Lines) > 0 {
			hunks = append(hunks, hunk)
		}
	}

	return hunks
}

func splitLines(s string) []string {
	if s == "" {
		return []string{}
	}
	lines := strings.Split(s, "\n")
	// Remove trailing empty line from final newline
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}
