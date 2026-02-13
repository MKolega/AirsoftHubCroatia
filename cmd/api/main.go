package main

import (
	"log"

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
	router := gin.Default()

	// Serve locally stored thumbnails
	router.Static("/uploads", "./uploads")

	router.GET("/", handlers.HomeHandler)

	router.GET("/events", handlers.EventsHandler)
	router.POST("/events", handlers.CreateEventHandler)
	router.PUT("/events/:id", handlers.UpdateEventHandler)
	router.DELETE("/events/:id", handlers.DeleteEventHandler)

	//API Routes
	api := router.Group("/api")
	{
		api.GET("/events", handlers.EventsHandler)
		api.POST("/events", handlers.CreateEventHandler)
		api.PUT("/events/:id", handlers.UpdateEventHandler)
		api.DELETE("/events/:id", handlers.DeleteEventHandler)
		api.POST("/auth/register", handlers.RegisterHandler)
		api.POST("/auth/login", handlers.LoginHandler)
		api.GET("/auth/me", handlers.MeHandler)
	}

	if err := router.Run(cfg.Address); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
