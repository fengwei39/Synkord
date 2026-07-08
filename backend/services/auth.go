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

const (
	AccessTokenTTL  = 15 * time.Minute
	RefreshTokenTTL = 30 * 24 * time.Hour
)

func GenerateToken(cfg *config.Config, user *models.User) (string, error) {
	return generateTokenWithTTL(cfg, user, AccessTokenTTL)
}

func GenerateRefreshToken(cfg *config.Config, user *models.User) (string, error) {
	return generateTokenWithTTL(cfg, user, RefreshTokenTTL)
}

func generateTokenWithTTL(cfg *config.Config, user *models.User, ttl time.Duration) (string, error) {
	claims := Claims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     string(user.Role),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
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
	return CreateUserWithEmail(db, username, "", password, role)
}

func CreateUserWithEmail(db *gorm.DB, username, email, password, role string) (*models.User, error) {
	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}
	user := &models.User{
		Username:       username,
		Email:          email,
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

// ChangeOwnPassword 修改当前用户密码（需校验旧密码）
func ChangeOwnPassword(db *gorm.DB, userID, oldPwd, newPwd string) error {
	var user models.User
	if err := db.First(&user, "id = ?", userID).Error; err != nil {
		return errors.New("user not found")
	}
	if !CheckPassword(oldPwd, user.HashedPassword) {
		return errors.New("old password is incorrect")
	}
	hash, err := HashPassword(newPwd)
	if err != nil {
		return err
	}
	return db.Model(&user).Update("hashed_password", hash).Error
}
