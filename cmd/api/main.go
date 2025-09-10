package api

import (
	"log"

	_ "github.com/MKolega/AirsoftHubCroatia/internal/db"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)
import "net/http"

func main() {
	if err := godotenv.Load(); err != nil {
		log.Fatal(err)
	}
	router := gin.Default()

	router.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "pong",
		})
	})

	if err := router.Run(":8080"); err != nil {
		log.Fatal("Failed to run server:", err)
	}

}
