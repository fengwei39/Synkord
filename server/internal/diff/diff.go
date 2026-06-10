// Package diff computes field-level differences between two contract pack versions.
package diff

import (
	"encoding/json"
	"fmt"
	"reflect"
)

// ChangeType represents the kind of change for a field or entity.
type ChangeType string

const (
	ChangeAdded    ChangeType = "added"
	ChangeRemoved  ChangeType = "removed"
	ChangeModified ChangeType = "modified"
)

// FieldDiff describes a single field change.
type FieldDiff struct {
	Change ChangeType  `json:"change"`
	Type   string      `json:"type,omitempty"`   // present for added/removed
	Before interface{} `json:"before,omitempty"` // present for modified
	After  interface{} `json:"after,omitempty"`  // present for modified
}

// EntityDiff describes the changes within one entity.
type EntityDiff struct {
	Change    ChangeType            `json:"change"`
	Fields    map[string]*FieldDiff `json:"fields,omitempty"`
	Relations map[string]*FieldDiff `json:"relations,omitempty"`
}

// Result is the full diff between two versions.
type Result struct {
	From     string                 `json:"from"`
	To       string                 `json:"to"`
	Entities map[string]*EntityDiff `json:"entities"`
}

// contractDoc is a minimal parse of a contract-v1 JSON document.
type contractDoc struct {
	Pack     string                            `json:"pack"`
	Version  string                            `json:"version"`
	Entities map[string]map[string]interface{} `json:"entities"`
}

func parseDoc(content string) (*contractDoc, error) {
	var doc contractDoc
	if err := json.Unmarshal([]byte(content), &doc); err != nil {
		return nil, fmt.Errorf("parse contract: %w", err)
	}
	return &doc, nil
}

// Compute returns the structured diff between fromContent and toContent.
// Both must be valid contract-v1 JSON strings. Returns an empty entities map
// when there are no changes.
func Compute(fromVersion, toVersion, fromContent, toContent string) (*Result, error) {
	fromDoc, err := parseDoc(fromContent)
	if err != nil {
		return nil, fmt.Errorf("from: %w", err)
	}
	toDoc, err := parseDoc(toContent)
	if err != nil {
		return nil, fmt.Errorf("to: %w", err)
	}

	result := &Result{
		From:     fromVersion,
		To:       toVersion,
		Entities: make(map[string]*EntityDiff),
	}

	// Entities in "from" — may be removed or modified
	for entityName, fromEntity := range fromDoc.Entities {
		toEntity, exists := toDoc.Entities[entityName]
		if !exists {
			result.Entities[entityName] = entityAllRemoved(fromEntity)
			continue
		}
		if ed := diffEntity(fromEntity, toEntity); ed != nil {
			result.Entities[entityName] = ed
		}
	}

	// Entities only in "to" — added
	for entityName, toEntity := range toDoc.Entities {
		if _, exists := fromDoc.Entities[entityName]; !exists {
			result.Entities[entityName] = entityAllAdded(toEntity)
		}
	}

	return result, nil
}

// entityAllAdded returns an EntityDiff marking all fields as added.
func entityAllAdded(entity map[string]interface{}) *EntityDiff {
	ed := &EntityDiff{Change: ChangeAdded, Fields: make(map[string]*FieldDiff)}
	if fields, ok := entity["fields"].(map[string]interface{}); ok {
		for fname, fval := range fields {
			typeName := extractType(fval)
			ed.Fields[fname] = &FieldDiff{Change: ChangeAdded, Type: typeName}
		}
	}
	if rels, ok := entity["relations"].(map[string]interface{}); ok {
		ed.Relations = make(map[string]*FieldDiff)
		for rname := range rels {
			ed.Relations[rname] = &FieldDiff{Change: ChangeAdded}
		}
	}
	return ed
}

// entityAllRemoved returns an EntityDiff marking all fields as removed.
func entityAllRemoved(entity map[string]interface{}) *EntityDiff {
	ed := &EntityDiff{Change: ChangeRemoved, Fields: make(map[string]*FieldDiff)}
	if fields, ok := entity["fields"].(map[string]interface{}); ok {
		for fname, fval := range fields {
			typeName := extractType(fval)
			ed.Fields[fname] = &FieldDiff{Change: ChangeRemoved, Type: typeName}
		}
	}
	if rels, ok := entity["relations"].(map[string]interface{}); ok {
		ed.Relations = make(map[string]*FieldDiff)
		for rname := range rels {
			ed.Relations[rname] = &FieldDiff{Change: ChangeRemoved}
		}
	}
	return ed
}

// diffEntity computes field-level changes between two entity objects.
// Returns nil if there are no differences.
func diffEntity(fromEntity, toEntity map[string]interface{}) *EntityDiff {
	ed := &EntityDiff{Change: ChangeModified}

	fieldDiffs := diffObjectMap(
		asStringMap(fromEntity["fields"]),
		asStringMap(toEntity["fields"]),
	)
	relDiffs := diffObjectMap(
		asStringMap(fromEntity["relations"]),
		asStringMap(toEntity["relations"]),
	)

	if len(fieldDiffs) == 0 && len(relDiffs) == 0 {
		return nil
	}
	if len(fieldDiffs) > 0 {
		ed.Fields = fieldDiffs
	}
	if len(relDiffs) > 0 {
		ed.Relations = relDiffs
	}
	return ed
}

// diffObjectMap computes diffs for a map of field or relation objects.
func diffObjectMap(from, to map[string]interface{}) map[string]*FieldDiff {
	diffs := make(map[string]*FieldDiff)

	for name, fromVal := range from {
		toVal, exists := to[name]
		if !exists {
			diffs[name] = &FieldDiff{Change: ChangeRemoved, Type: extractType(fromVal)}
			continue
		}
		if !reflect.DeepEqual(fromVal, toVal) {
			diffs[name] = &FieldDiff{
				Change: ChangeModified,
				Before: fromVal,
				After:  toVal,
			}
		}
	}

	for name, toVal := range to {
		if _, exists := from[name]; !exists {
			diffs[name] = &FieldDiff{Change: ChangeAdded, Type: extractType(toVal)}
		}
	}

	return diffs
}

// extractType pulls the "type" string from a field definition map.
func extractType(v interface{}) string {
	m, ok := v.(map[string]interface{})
	if !ok {
		return ""
	}
	t, _ := m["type"].(string)
	return t
}

// asStringMap safely casts interface{} to map[string]interface{}.
func asStringMap(v interface{}) map[string]interface{} {
	if v == nil {
		return map[string]interface{}{}
	}
	m, ok := v.(map[string]interface{})
	if !ok {
		return map[string]interface{}{}
	}
	return m
}
