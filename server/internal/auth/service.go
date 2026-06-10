package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrEmailTaken    = errors.New("email already registered")
	ErrInvalidCreds  = errors.New("invalid email or password")
	ErrUserNotFound  = errors.New("user not found")
)

type Service struct {
	db     *sqlx.DB
	secret string
}

func NewService(db *sqlx.DB, jwtSecret string) *Service {
	return &Service{db: db, secret: jwtSecret}
}

func (s *Service) Register(ctx context.Context, req RegisterRequest) (*TokenResponse, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	var user User
	err = s.db.QueryRowxContext(ctx,
		`INSERT INTO users (email, password_hash, display_name)
		 VALUES ($1, $2, $3)
		 RETURNING id, email, password_hash, display_name, created_at`,
		req.Email, string(hash), req.DisplayName,
	).StructScan(&user)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrEmailTaken
		}
		return nil, fmt.Errorf("insert user: %w", err)
	}

	token, err := generateToken(user.ID, s.secret)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	return &TokenResponse{Token: token, User: userToResponse(&user)}, nil
}

func (s *Service) Login(ctx context.Context, req LoginRequest) (*TokenResponse, error) {
	var user User
	err := s.db.QueryRowxContext(ctx,
		`SELECT id, email, password_hash, display_name, created_at
		 FROM users WHERE email = $1`,
		req.Email,
	).StructScan(&user)
	if err != nil {
		return nil, ErrInvalidCreds
	}

	if user.PasswordHash == nil {
		return nil, ErrInvalidCreds
	}
	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCreds
	}

	token, err := generateToken(user.ID, s.secret)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	return &TokenResponse{Token: token, User: userToResponse(&user)}, nil
}

func (s *Service) GetByID(ctx context.Context, id string) (*User, error) {
	var user User
	err := s.db.QueryRowxContext(ctx,
		`SELECT id, email, display_name, created_at FROM users WHERE id = $1`, id,
	).StructScan(&user)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return &user, nil
}

func (s *Service) AddGitEmail(ctx context.Context, userID string, req AddGitEmailRequest) (*GitEmail, error) {
	var ge GitEmail
	err := s.db.QueryRowxContext(ctx,
		`INSERT INTO git_emails (user_id, email)
		 VALUES ($1, $2)
		 ON CONFLICT (user_id, email) DO UPDATE SET email = EXCLUDED.email
		 RETURNING id, user_id, email, is_primary`,
		userID, req.Email,
	).StructScan(&ge)
	if err != nil {
		return nil, fmt.Errorf("insert git email: %w", err)
	}
	return &ge, nil
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key") || strings.Contains(msg, "unique constraint")
}
