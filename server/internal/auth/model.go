package auth

import "time"

type User struct {
	ID           string    `db:"id"            json:"id"`
	Email        string    `db:"email"         json:"email"`
	PasswordHash *string   `db:"password_hash" json:"-"`
	DisplayName  string    `db:"display_name"  json:"displayName"`
	CreatedAt    time.Time `db:"created_at"    json:"createdAt"`
}

type GitEmail struct {
	ID        string `db:"id"         json:"id"`
	UserID    string `db:"user_id"    json:"userId"`
	Email     string `db:"email"      json:"email"`
	IsPrimary bool   `db:"is_primary" json:"isPrimary"`
}

// Request types

type RegisterRequest struct {
	Email       string `json:"email"       binding:"required,email"`
	Password    string `json:"password"    binding:"required,min=6"`
	DisplayName string `json:"displayName" binding:"required"`
}

type LoginRequest struct {
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type AddGitEmailRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// Response types

type UserResponse struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	CreatedAt   time.Time `json:"createdAt"`
}

type TokenResponse struct {
	Token string       `json:"token"`
	User  UserResponse `json:"user"`
}

func userToResponse(u *User) UserResponse {
	return UserResponse{
		ID:          u.ID,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		CreatedAt:   u.CreatedAt,
	}
}
