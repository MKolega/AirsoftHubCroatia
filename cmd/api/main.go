package main

import (
	"log"
	"strings"

	"github.com/MKolega/AirsoftHubCroatia/handlers"
	"github.com/MKolega/AirsoftHubCroatia/internal/config"
	"github.com/MKolega/AirsoftHubCroatia/internal/db"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	if err := db.Init(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	if err := db.CreateEventsTable(); err != nil {
		log.Fatalf("Failed to create events table: %v", err)
	}
	cfg := config.Load()
	if strings.TrimSpace(config.GetEnv("AUTH_JWT_SECRET", "")) == "" {
		log.Fatalf("AUTH_JWT_SECRET is required")
	}
	router := gin.Default()

	router.GET("/", handlers.HomeHandler)

	router.GET("/events", handlers.EventsHandler)
	router.POST("/events", handlers.LimitRequestBody(7<<20), handlers.CreateEventHandler)
	router.PUT("/events/:id", handlers.LimitRequestBody(7<<20), handlers.UpdateEventHandler)
	router.DELETE("/events/:id", handlers.DeleteEventHandler)

	//API Routes
	api := router.Group("/api")
	{
		api.GET("/maintenance", handlers.MaintenanceStatusHandler)
		api.Use(handlers.MaintenanceGate())

		api.GET("/events", handlers.EventsHandler)
		api.GET("/my-events", handlers.MyEventsHandler)
		api.POST("/events", handlers.LimitRequestBody(7<<20), handlers.CreateEventHandler)
		api.PUT("/events/:id", handlers.LimitRequestBody(7<<20), handlers.UpdateEventHandler)
		api.DELETE("/events/:id", handlers.DeleteEventHandler)
		api.POST("/events/:id/save", handlers.SaveEventHandler)
		api.DELETE("/events/:id/save", handlers.UnsaveEventHandler)
		api.GET("/saved-events", handlers.SavedEventsHandler)
		api.POST("/auth/register", handlers.AuthRateLimit(), handlers.RegisterHandler)
		api.POST("/auth/login", handlers.AuthRateLimit(), handlers.LoginHandler)
		api.GET("/auth/me", handlers.MeHandler)
		api.PUT("/auth/me", handlers.UpdateMeHandler)
		api.GET("/admin/review-events", handlers.AdminPendingReviewEventsHandler)
		api.POST("/admin/review-events/:id/approve", handlers.AdminApproveEventHandler)
		api.POST("/admin/review-events/:id/reject", handlers.AdminRejectEventHandler)
	}

	if err := router.Run(cfg.Address); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
