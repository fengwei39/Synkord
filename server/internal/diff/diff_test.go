package diff

import (
	"encoding/json"
	"testing"
)

// ─── fixtures ─────────────────────────────────────────────────────────────────

const v100 = `{
  "pack": "auth-pack",
  "version": "1.0.0",
  "entities": {
    "User": {
      "table": "users",
      "fields": {
        "id":    { "type": "uuid",    "primary": true },
        "email": { "type": "string",  "unique": true  },
        "age":   { "type": "int"                      }
      }
    }
  }
}`

const v110 = `{
  "pack": "auth-pack",
  "version": "1.1.0",
  "entities": {
    "User": {
      "table": "users",
      "fields": {
        "id":    { "type": "uuid",    "primary": true },
        "email": { "type": "string",  "unique": true  },
        "phone": { "type": "string"                   }
      }
    }
  }
}`

const v120 = `{
  "pack": "auth-pack",
  "version": "1.2.0",
  "entities": {
    "User": {
      "table": "users",
      "fields": {
        "id":    { "type": "uuid",    "primary": true },
        "email": { "type": "string"                   },
        "phone": { "type": "string"                   }
      }
    },
    "Token": {
      "table": "tokens",
      "fields": {
        "id":    { "type": "uuid",    "primary": true },
        "value": { "type": "string"                   }
      }
    }
  }
}`

// ─── field-level tests ────────────────────────────────────────────────────────

func TestDiff_FieldAdded(t *testing.T) {
	result, err := Compute("1.0.0", "1.1.0", v100, v110)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	user, ok := result.Entities["User"]
	if !ok {
		t.Fatal("expected User entity in diff")
	}
	phone, ok := user.Fields["phone"]
	if !ok {
		t.Fatal("expected phone field in diff")
	}
	if phone.Change != ChangeAdded {
		t.Errorf("phone change = %q, want %q", phone.Change, ChangeAdded)
	}
	if phone.Type != "string" {
		t.Errorf("phone type = %q, want string", phone.Type)
	}
}

func TestDiff_FieldRemoved(t *testing.T) {
	result, err := Compute("1.0.0", "1.1.0", v100, v110)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	user := result.Entities["User"]
	age, ok := user.Fields["age"]
	if !ok {
		t.Fatal("expected age field in diff")
	}
	if age.Change != ChangeRemoved {
		t.Errorf("age change = %q, want %q", age.Change, ChangeRemoved)
	}
	if age.Type != "int" {
		t.Errorf("age type = %q, want int", age.Type)
	}
}

func TestDiff_FieldModified(t *testing.T) {
	result, err := Compute("1.1.0", "1.2.0", v110, v120)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	user, ok := result.Entities["User"]
	if !ok {
		t.Fatal("expected User entity in diff")
	}
	email, ok := user.Fields["email"]
	if !ok {
		t.Fatal("expected email in diff (attribute changed)")
	}
	if email.Change != ChangeModified {
		t.Errorf("email change = %q, want %q", email.Change, ChangeModified)
	}
	if email.Before == nil || email.After == nil {
		t.Error("modified field must have before/after")
	}
}

func TestDiff_EntityAdded(t *testing.T) {
	result, err := Compute("1.1.0", "1.2.0", v110, v120)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	token, ok := result.Entities["Token"]
	if !ok {
		t.Fatal("expected Token entity in diff as added")
	}
	if token.Change != ChangeAdded {
		t.Errorf("Token entity change = %q, want %q", token.Change, ChangeAdded)
	}
	if _, hasID := token.Fields["id"]; !hasID {
		t.Error("Token entity should list its fields as added")
	}
}

func TestDiff_EntityRemoved(t *testing.T) {
	// go from v120 (has Token) back to v110 (no Token)
	result, err := Compute("1.2.0", "1.1.0", v120, v110)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	token, ok := result.Entities["Token"]
	if !ok {
		t.Fatal("expected Token entity in diff as removed")
	}
	if token.Change != ChangeRemoved {
		t.Errorf("Token entity change = %q, want %q", token.Change, ChangeRemoved)
	}
}

func TestDiff_NoDiff(t *testing.T) {
	result, err := Compute("1.0.0", "1.0.0", v100, v100)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Entities) != 0 {
		b, _ := json.MarshalIndent(result.Entities, "", "  ")
		t.Errorf("expected empty diff, got: %s", b)
	}
}

func TestDiff_UnchangedFieldsNotIncluded(t *testing.T) {
	result, err := Compute("1.0.0", "1.1.0", v100, v110)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	user := result.Entities["User"]
	if _, ok := user.Fields["id"]; ok {
		t.Error("unchanged 'id' field should not appear in diff")
	}
	if _, ok := user.Fields["email"]; ok {
		t.Error("unchanged 'email' field should not appear in diff")
	}
}

func TestCompute_VersionsInResult(t *testing.T) {
	result, err := Compute("1.0.0", "1.1.0", v100, v110)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.From != "1.0.0" {
		t.Errorf("From = %q, want 1.0.0", result.From)
	}
	if result.To != "1.1.0" {
		t.Errorf("To = %q, want 1.1.0", result.To)
	}
}
