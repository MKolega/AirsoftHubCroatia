package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/MKolega/AirsoftHubCroatia/internal/config"
	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

type limiterEntry struct {
	lim      *rate.Limiter
	lastSeen time.Time
}

var authLimiters = struct {
	mu sync.Mutex
	m  map[string]*limiterEntry
}{m: make(map[string]*limiterEntry)}

func authLimiterConfig() (rpm int, burst int) {
	rpmStr := strings.TrimSpace(config.GetEnv("AUTH_RATE_LIMIT_RPM", "20"))
	burstStr := strings.TrimSpace(config.GetEnv("AUTH_RATE_LIMIT_BURST", "40"))

	rpm, err := strconv.Atoi(rpmStr)
	if err != nil || rpm <= 0 {
		rpm = 20
	}
	burst, err = strconv.Atoi(burstStr)
	if err != nil || burst <= 0 {
		burst = 40
	}
	return rpm, burst
}

// Limits by client IP to reduce brute force attempts.
func AuthRateLimit() gin.HandlerFunc {
	rpm, burst := authLimiterConfig()
	interval := time.Minute / time.Duration(rpm)
	if interval <= 0 {
		interval = time.Minute
	}

	cleanupAfter := 30 * time.Minute

	return func(c *gin.Context) {
		key := strings.TrimSpace(c.ClientIP())
		if key == "" {
			key = "unknown"
		}

		now := time.Now()

		authLimiters.mu.Lock()
		entry := authLimiters.m[key]
		if entry == nil {
			entry = &limiterEntry{lim: rate.NewLimiter(rate.Every(interval), burst), lastSeen: now}
			authLimiters.m[key] = entry
		} else {
			entry.lastSeen = now
		}

	
		if len(authLimiters.m) > 2000 {
			for k, v := range authLimiters.m {
				if now.Sub(v.lastSeen) > cleanupAfter {
					delete(authLimiters.m, k)
				}
			}
		}
		authLimiters.mu.Unlock()

		if !entry.lim.Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests, please try again later"})
			return
		}

		c.Next()
	}
}
