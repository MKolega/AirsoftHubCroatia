package handlers

import (
	"net/http"
	"strings"

	"github.com/MKolega/AirsoftHubCroatia/internal/config"
	"github.com/MKolega/AirsoftHubCroatia/internal/db"
	"github.com/gin-gonic/gin"
)

func maintenanceEnabled() bool {
	v := strings.TrimSpace(config.GetEnv("MAINTENANCE_MODE", "false"))
	if v == "" {
		return false
	}
	switch strings.ToLower(v) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}

func MaintenanceStatusHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"enabled": maintenanceEnabled()})
}

// MaintenanceGate blocks access to API routes when MAINTENANCE_MODE is enabled.
// Auth login + /auth/me are allowed so eligible users can sign in.
func MaintenanceGate() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !maintenanceEnabled() {
			c.Next()
			return
		}

		p := strings.TrimSpace(c.FullPath())
		if p == "" {
			p = strings.TrimSpace(c.Request.URL.Path)
		}

		if strings.HasSuffix(p, "/auth/login") || strings.HasSuffix(p, "/auth/me") {
			c.Next()
			return
		}

		if strings.HasSuffix(p, "/auth/register") {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Under maintenance"})
			c.Abort()
			return
		}

		email, ok := emailFromAuthHeader(c)
		if !ok {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Under maintenance"})
			c.Abort()
			return
		}

		user, err := db.GetUserByEmail(email)
		if err != nil || user == nil || (!user.IsAdmin && !user.IsMaintenanceUser) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Under maintenance"})
			c.Abort()
			return
		}

		c.Next()
	}
}
