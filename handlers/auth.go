package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/MKolega/AirsoftHubCroatia/internal/config"
	"github.com/MKolega/AirsoftHubCroatia/internal/db"
	"github.com/MKolega/AirsoftHubCroatia/types"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type authRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResponse struct {
	Token string `json:"token"`
	Email string `json:"email"`
}

func normalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func jwtSecret() []byte {
	secret := config.GetEnv("AUTH_JWT_SECRET", "dev-secret-change-me")
	return []byte(secret)
}

func issueToken(email string) (string, error) {
	claims := jwt.MapClaims{
		"sub":   email,
		"email": email,
		"iat":   time.Now().Unix(),
		"exp":   time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret())
}

func RegisterHandler(c *gin.Context) {
	var req authRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	email := normalizeEmail(req.Email)
	password := strings.TrimSpace(req.Password)
	if email == "" || !strings.Contains(email, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid email"})
		return
	}
	if len(password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 6 characters"})
		return
	}

	if _, err := db.GetUserByEmail(email); err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already in use"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
		return
	}

	user := &types.User{Email: email, PasswordHash: string(hash)}
	if err := db.InsertUser(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
		return
	}

	tok, err := issueToken(email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to sign in"})
		return
	}

	c.JSON(http.StatusCreated, authResponse{Token: tok, Email: email})
}

func LoginHandler(c *gin.Context) {
	var req authRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	email := normalizeEmail(req.Email)
	password := strings.TrimSpace(req.Password)
	if email == "" || password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email and password are required"})
		return
	}

	user, err := db.GetUserByEmail(email)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	tok, err := issueToken(email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to sign in"})
		return
	}

	c.JSON(http.StatusOK, authResponse{Token: tok, Email: email})
}
