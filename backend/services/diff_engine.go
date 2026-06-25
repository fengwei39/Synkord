package services

import (
	"encoding/json"
	"fmt"
	"strings"
)

type BreakingChange struct {
	EntityName string `json:"entity_name"`
	ChangeType string `json:"change_type"`
	Path       string `json:"path"`
	OldValue   string `json:"old_value,omitempty"`
	NewValue   string `json:"new_value,omitempty"`
	Severity   string `json:"severity"`
}

type DiffResult struct {
	ServiceName      string           `json:"service_name"`
	OldVersion       string           `json:"old_version"`
	NewVersion       string           `json:"new_version"`
	Changes          []BreakingChange `json:"changes"`
	AffectedProjects []string         `json:"affected_projects"`
	IsBreaking       bool             `json:"is_breaking"`
}

func DetectBreakingChanges(oldSpec, newSpec, serviceName, oldVersion, newVersion string, affectedProjects []string) *DiffResult {
	result := &DiffResult{
		ServiceName:      serviceName,
		OldVersion:       oldVersion,
		NewVersion:       newVersion,
		AffectedProjects: affectedProjects,
	}

	var oldMap, newMap map[string]interface{}
	if err := json.Unmarshal([]byte(oldSpec), &oldMap); err != nil {
		result.Changes = append(result.Changes, BreakingChange{
			EntityName: "schema", ChangeType: "parse_error", Path: "$",
			OldValue: err.Error(), Severity: "breaking",
		})
		result.IsBreaking = true
		return result
	}
	if err := json.Unmarshal([]byte(newSpec), &newMap); err != nil {
		result.Changes = append(result.Changes, BreakingChange{
			EntityName: "schema", ChangeType: "parse_error", Path: "$",
			NewValue: err.Error(), Severity: "breaking",
		})
		result.IsBreaking = true
		return result
	}

	oldProps, _ := oldMap["properties"].(map[string]interface{})
	newProps, _ := newMap["properties"].(map[string]interface{})
	oldRequired := toStringSet(oldMap["required"])
	newRequired := toStringSet(newMap["required"])

	// 1. Removed fields
	for key, oldVal := range oldProps {
		if _, ok := newProps[key]; !ok {
			oldJSON, _ := json.Marshal(oldVal)
			result.Changes = append(result.Changes, BreakingChange{
				EntityName: key, ChangeType: "field_removed",
				Path:     fmt.Sprintf("$.properties.%s", key),
				OldValue: string(oldJSON), Severity: "breaking",
			})
		}
	}

	// 2. Type changes
	for key, oldVal := range oldProps {
		if newVal, ok := newProps[key]; ok {
			oldObj, _ := oldVal.(map[string]interface{})
			newObj, _ := newVal.(map[string]interface{})
			oldType := fmt.Sprintf("%v", oldObj["type"])
			newType := fmt.Sprintf("%v", newObj["type"])
			if oldType != newType {
				result.Changes = append(result.Changes, BreakingChange{
					EntityName: key, ChangeType: "type_changed",
					Path:     fmt.Sprintf("$.properties.%s.type", key),
					OldValue: oldType, NewValue: newType, Severity: "breaking",
				})
			}
		}
	}

	// 3. Enum changes
	for key, oldVal := range oldProps {
		if newVal, ok := newProps[key]; ok {
			oldObj, _ := oldVal.(map[string]interface{})
			newObj, _ := newVal.(map[string]interface{})
			if oldObj["enum"] != nil && newObj["enum"] != nil {
				oldEnum := fmt.Sprintf("%v", oldObj["enum"])
				newEnum := fmt.Sprintf("%v", newObj["enum"])
				if oldEnum != newEnum {
					result.Changes = append(result.Changes, BreakingChange{
						EntityName: key, ChangeType: "enum_changed",
						Path:     fmt.Sprintf("$.properties.%s.enum", key),
						OldValue: oldEnum, NewValue: newEnum, Severity: "breaking",
					})
				}
			}
		}
	}

	// 4. Required fields added
	for key := range newRequired {
		if !oldRequired[key] {
			result.Changes = append(result.Changes, BreakingChange{
				EntityName: key, ChangeType: "required_added",
				Path: "$.required", OldValue: "optional", NewValue: "required", Severity: "breaking",
			})
		}
	}

	// 5. Nested entity changes
	oldNested := getNestedEntities(oldMap, "$")
	newNested := getNestedEntities(newMap, "$")
	for path, oldEntity := range oldNested {
		if newEntity, ok := newNested[path]; ok {
			oldNP, _ := oldEntity["properties"].(map[string]interface{})
			newNP, _ := newEntity["properties"].(map[string]interface{})
			for nk := range oldNP {
				if _, ok := newNP[nk]; !ok {
					result.Changes = append(result.Changes, BreakingChange{
						EntityName: nk, ChangeType: "nested_changed",
						Path:     fmt.Sprintf("%s.%s", path, nk),
						OldValue: "present", NewValue: "removed", Severity: "breaking",
					})
				}
			}
		}
	}

	for _, c := range result.Changes {
		if c.Severity == "breaking" {
			result.IsBreaking = true
			break
		}
	}

	return result
}

func getNestedEntities(schema map[string]interface{}, prefix string) map[string]map[string]interface{} {
	result := make(map[string]map[string]interface{})
	props, _ := schema["properties"].(map[string]interface{})
	for key, val := range props {
		path := fmt.Sprintf("%s.%s", prefix, key)
		obj, _ := val.(map[string]interface{})
		if obj["type"] == "object" && obj["properties"] != nil {
			result[path] = obj
			nested := getNestedEntities(obj, path)
			for k, v := range nested {
				result[k] = v
			}
		}
	}
	return result
}

type ValidateResult struct {
	IsValid  bool     `json:"is_valid"`
	Errors   []string `json:"errors"`
	Warnings []string `json:"warnings"`
}

func ValidateEntityUsage(codeSnippet string, entitySchemas []string) *ValidateResult {
	result := &ValidateResult{IsValid: true}

	for _, schemaStr := range entitySchemas {
		var schema map[string]interface{}
		if err := json.Unmarshal([]byte(schemaStr), &schema); err != nil {
			continue
		}

		entityName := "unknown"
		if title, ok := schema["title"].(string); ok {
			entityName = title
		}

		required := toStringSet(schema["required"])
		for field := range required {
			if !strings.Contains(codeSnippet, field) {
				result.Warnings = append(result.Warnings,
					fmt.Sprintf("Required field '%s' from entity '%s' not found in code", field, entityName))
			}
		}

		props, _ := schema["properties"].(map[string]interface{})
		for propName, propVal := range props {
			if strings.Contains(codeSnippet, propName) {
				propObj, _ := propVal.(map[string]interface{})
				if deprecated, _ := propObj["deprecated"].(bool); deprecated {
					result.Warnings = append(result.Warnings,
						fmt.Sprintf("Deprecated field '%s' from entity '%s' used in code", propName, entityName))
				}
			}
		}
	}

	return result
}
