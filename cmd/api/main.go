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
	if err := godotenv.Load(); err != nil {
		log.Fatal(err)
	}

	if err := db.Init(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	if err := db.CreateEventsTable(); err != nil {
		log.Fatal("Failed to create events table:", err)
	}
	cfg := config.Load()
	router := gin.Default()

	router.GET("/", handlers.HomeHandler)
	router.GET("/events", handlers.EventsHandler)
	router.POST("/events", handlers.CreateEventHandler)
	router.PUT("/events/:id", handlers.UpdateEventHandler)
	router.DELETE("/events/:id", handlers.DeleteEventHandler)
	if err := router.Run(cfg.Address); err != nil {
		log.Fatal("Failed to run server:", err)
	}

}
