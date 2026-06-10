package contracts

import (
	_ "embed"
	"fmt"
	"strings"

	"github.com/xeipuuv/gojsonschema"
)

//go:embed contract-v1.json
var schemaBytes []byte

var compiledSchema *gojsonschema.Schema

func init() {
	loader := gojsonschema.NewBytesLoader(schemaBytes)
	s, err := gojsonschema.NewSchema(loader)
	if err != nil {
		panic("failed to compile contract-v1.json schema: " + err.Error())
	}
	compiledSchema = s
}

// ValidateContent checks that content is valid JSON conforming to contract-v1 schema.
// Returns a human-readable error or nil.
func ValidateContent(content string) error {
	docLoader := gojsonschema.NewStringLoader(content)
	result, err := compiledSchema.Validate(docLoader)
	if err != nil {
		return fmt.Errorf("schema validation error: %w", err)
	}
	if !result.Valid() {
		msgs := make([]string, 0, len(result.Errors()))
		for _, e := range result.Errors() {
			msgs = append(msgs, e.String())
		}
		return fmt.Errorf("contract validation failed: %s", strings.Join(msgs, "; "))
	}
	return nil
}
