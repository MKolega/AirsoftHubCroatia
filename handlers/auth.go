package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/MKolega/AirsoftHubCroatia/internal/config"
	"github.com/MKolega/AirsoftHubCroatia/internal/db"
	"github.com/MKolega/AirsoftHubCroatia/types"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

func normalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func emailInCSVList(email string, rawList string) bool {
	if email == "" {
		return false
	}
	for _, p := range strings.Split(strings.TrimSpace(rawList), ",") {
		if normalizeEmail(p) == email {
			return true
		}
	}
	return false
}

type authClaims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

type jwtSettings struct {
	secret   []byte
	ttl      time.Duration
	issuer   string
	audience string
}

var (
	jwtSettingsOnce sync.Once
	jwtSettingsVal  jwtSettings
	jwtSettingsErr  error
)

func getJWTSettings() (jwtSettings, error) {
	jwtSettingsOnce.Do(func() {
		secret := strings.TrimSpace(config.GetEnv("AUTH_JWT_SECRET", ""))
		if secret == "" {
			jwtSettingsErr = errors.New("AUTH_JWT_SECRET is required")
			return
		}

		ttlMinutes := strings.TrimSpace(config.GetEnv("AUTH_JWT_TTL_MINUTES", "120"))
		mins, err := strconv.Atoi(ttlMinutes)
		if err != nil || mins <= 0 {
			jwtSettingsErr = errors.New("AUTH_JWT_TTL_MINUTES must be a positive integer")
			return
		}

		jwtSettingsVal = jwtSettings{
			secret:   []byte(secret),
			ttl:      time.Duration(mins) * time.Minute,
			issuer:   strings.TrimSpace(config.GetEnv("AUTH_JWT_ISSUER", "")),
			audience: strings.TrimSpace(config.GetEnv("AUTH_JWT_AUDIENCE", "")),
		}
	})
	return jwtSettingsVal, jwtSettingsErr
}

func issueToken(email string) (string, error) {
	s, err := getJWTSettings()
	if err != nil {
		return "", err
	}

	now := time.Now()
	claims := authClaims{
		Email: email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   email,
			Issuer:    s.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.ttl)),
		},
	}
	if s.audience != "" {
		claims.Audience = jwt.ClaimStrings{s.audience}
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
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

	s, err := getJWTSettings()
	if err != nil {
		return "", false
	}

	claims := new(authClaims)
	options := []jwt.ParserOption{
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
	}
	if s.issuer != "" {
		options = append(options, jwt.WithIssuer(s.issuer))
	}
	if s.audience != "" {
		options = append(options, jwt.WithAudience(s.audience))
	}

	parsed, err := jwt.ParseWithClaims(tok, claims, func(token *jwt.Token) (interface{}, error) {
		return s.secret, nil
	}, options...)
	if err != nil || parsed == nil || !parsed.Valid {
		return "", false
	}

	email := normalizeEmail(claims.Email)
	if email != "" {
		return email, true
	}

	sub := normalizeEmail(claims.Subject)
	if sub != "" {
		return sub, true
	}

	return "", false
}

func RegisterHandler(c *gin.Context) {
	if maintenanceEnabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Under maintenance"})
		return
	}

	var req types.RegisterRequest
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

	isAdmin := emailInCSVList(email, config.GetEnv("ADMIN_EMAILS", ""))
	isMaintenanceUser := emailInCSVList(email, config.GetEnv("MAINTENANCE_USER_EMAILS", ""))

	if _, err := db.GetUserByEmail(email); err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already in use"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
		return
	}

	user := &types.User{
		Email:             email,
		Username:          username,
		AirsoftClub:       club,
		IsAdmin:           isAdmin,
		IsMaintenanceUser: isMaintenanceUser,
		PasswordHash:      string(hash),
	}
	if err := db.InsertUser(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
		return
	}

	tok, err := issueToken(email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to sign in"})
		return
	}

	c.JSON(http.StatusCreated, types.AuthResponse{Token: tok, Email: email})
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
		"email":               user.Email,
		"username":            user.Username,
		"airsoft_club":        club,
		"is_admin":            user.IsAdmin,
		"is_maintenance_user": user.IsMaintenanceUser,
	})
}

func UpdateMeHandler(c *gin.Context) {
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

	var req types.UpdateMeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	username := strings.TrimSpace(req.Username)
	club := strings.TrimSpace(req.AirsoftClub)
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username is required"})
		return
	}
	if club == "" {
		club = "No Club/Freelancer"
	}

	taken, err := db.UsernameTaken(username, user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate username"})
		return
	}
	if taken {
		c.JSON(http.StatusConflict, gin.H{"error": "Username already taken"})
		return
	}

	if err := db.UpdateUserProfile(user.ID, username, club); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"email":               user.Email,
		"username":            username,
		"airsoft_club":        club,
		"is_admin":            user.IsAdmin,
		"is_maintenance_user": user.IsMaintenanceUser,
	})
}

func LoginHandler(c *gin.Context) {
	var req types.AuthRequest
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

	if maintenanceEnabled() && !user.IsAdmin && !user.IsMaintenanceUser {
		c.JSON(http.StatusForbidden, gin.H{"error": "Under maintenance: restricted access"})
		return
	}

	tok, err := issueToken(email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to sign in"})
		return
	}

	c.JSON(http.StatusOK, types.AuthResponse{Token: tok, Email: email})
}
