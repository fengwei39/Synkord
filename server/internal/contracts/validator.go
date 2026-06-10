package contracts

// ValidateContent previously enforced JSON Schema validation.
// Contracts now accept any text format (markdown, YAML, JSON, etc.).
// This function is kept as a hook for future optional validation.
func ValidateContent(_ string) error {
	return nil
}
