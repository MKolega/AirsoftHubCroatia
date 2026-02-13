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

type registerRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	Username    string `json:"username"`
	AirsoftClub string `json:"airsoftClub"`
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

func emailFromAuthHeader(c *gin.Context) (string, bool) {
	authz := strings.TrimSpace(c.GetHeader("Authorization"))
	if authz == "" {
		return "", false
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(authz, prefix) {
		return "", false
	}
	tok := strings.TrimSpace(strings.TrimPrefix(authz, prefix))
	if tok == "" {
		return "", false
	}

	parsed, err := jwt.Parse(tok, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, jwt.ErrTokenSignatureInvalid
		}
		return jwtSecret(), nil
	})
	if err != nil || parsed == nil || !parsed.Valid {
		return "", false
	}

	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return "", false
	}
	if email, ok := claims["email"].(string); ok {
		email = normalizeEmail(email)
		if email != "" {
			return email, true
		}
	}
	if sub, ok := claims["sub"].(string); ok {
		sub = normalizeEmail(sub)
		if sub != "" {
			return sub, true
		}
	}
	return "", false
}

func RegisterHandler(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	email := normalizeEmail(req.Email)
	password := strings.TrimSpace(req.Password)
	username := strings.TrimSpace(req.Username)
	club := strings.TrimSpace(req.AirsoftClub)
	if email == "" || !strings.Contains(email, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid email"})
		return
	}
	if len(password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 6 characters"})
		return
	}
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username is required"})
		return
	}
	if club == "" {
		club = "No Club/Freelancer"
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

	user := &types.User{Email: email, Username: username, AirsoftClub: club, PasswordHash: string(hash)}
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

func MeHandler(c *gin.Context) {
	email, ok := emailFromAuthHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	user, err := db.GetUserByEmail(email)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	club := strings.TrimSpace(user.AirsoftClub)
	if club == "" {
		club = "No Club/Freelancer"
	}
	c.JSON(http.StatusOK, gin.H{
		"email":        user.Email,
		"username":     user.Username,
		"airsoft_club": club,
	})
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
