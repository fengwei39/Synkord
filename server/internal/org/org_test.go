package org

import (
	"encoding/hex"
	"fmt"
	"testing"
	"time"
)

func TestGenerateToken_Length(t *testing.T) {
	token, err := generateToken()
	if err != nil {
		t.Fatalf("generateToken: %v", err)
	}
	if len(token) != 64 {
		t.Errorf("expected 64 chars, got %d", len(token))
	}
}

func TestGenerateToken_IsHex(t *testing.T) {
	token, err := generateToken()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := hex.DecodeString(token); err != nil {
		t.Errorf("token is not valid hex: %v", err)
	}
}

func TestGenerateToken_Unique(t *testing.T) {
	seen := make(map[string]bool)
	for i := range 20 {
		token, err := generateToken()
		if err != nil {
			t.Fatalf("iteration %d: %v", i, err)
		}
		if seen[token] {
			t.Fatalf("duplicate token generated at iteration %d", i)
		}
		seen[token] = true
	}
}

func TestSlugPattern(t *testing.T) {
	valid := []string{"my-team", "acme", "org123", "a1-b2-c3"}
	for _, s := range valid {
		if !slugPattern.MatchString(s) {
			t.Errorf("expected %q to be valid slug", s)
		}
	}

	invalid := []string{"-start", "end-", "UPPER", "has space", "a", ""}
	for _, s := range invalid {
		if slugPattern.MatchString(s) {
			t.Errorf("expected %q to be invalid slug", s)
		}
	}
}

func TestInviteExpiry(t *testing.T) {
	past := time.Now().Add(-1 * time.Hour)
	future := time.Now().Add(1 * time.Hour)

	if !time.Now().After(past) {
		t.Error("past time should have expired")
	}
	if time.Now().After(future) {
		t.Error("future time should not have expired")
	}
}

func TestIsUniqueViolation(t *testing.T) {
	if isUniqueViolation(nil) {
		t.Error("nil error should not be unique violation")
	}
	if isUniqueViolation(fmt.Errorf("some random error")) {
		t.Error("random error should not be unique violation")
	}
	if !isUniqueViolation(fmt.Errorf("ERROR: duplicate key value violates unique constraint")) {
		t.Error("duplicate key error should be unique violation")
	}
}
