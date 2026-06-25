package services

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/synkord/core/config"
	"github.com/synkord/core/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func CheckPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

type Claims struct {
	UserID   string `json:"sub"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

func GenerateToken(cfg *config.Config, user *models.User) (string, error) {
	claims := Claims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     string(user.Role),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(8 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWTSecret))
}

func ParseToken(cfg *config.Config, tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(cfg.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func CreateUser(db *gorm.DB, username, password, role string) (*models.User, error) {
	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}
	user := &models.User{
		Username:       username,
		HashedPassword: hash,
		Role:           models.UserRole(role),
		IsActive:       true,
	}
	if err := db.Create(user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

func AuthenticateUser(db *gorm.DB, username, password string) (*models.User, error) {
	var user models.User
	if err := db.Where("username = ?", username).First(&user).Error; err != nil {
		return nil, errors.New("invalid credentials")
	}
	if !user.IsActive {
		return nil, errors.New("user is inactive")
	}
	if !CheckPassword(password, user.HashedPassword) {
		return nil, errors.New("invalid credentials")
	}
	return &user, nil
}

func ListUsers(db *gorm.DB) ([]models.User, error) {
	var users []models.User
	if err := db.Order("username").Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

func UpdateUserRole(db *gorm.DB, userID string, role string) (*models.User, error) {
	var user models.User
	if err := db.First(&user, "id = ?", userID).Error; err != nil {
		return nil, err
	}
	user.Role = models.UserRole(role)
	if err := db.Save(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}
