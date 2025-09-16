package handlers

import (
	"net/http"

	_ "github.com/MKolega/AirsoftHubCroatia/internal/db"
	"github.com/gin-gonic/gin"
)

func HomeHandler(c *gin.Context) {
	c.String(http.StatusOK, "Welcome to the Airsoft Hub Croatia")

}

/*
func EventsHandler(c *gin.Context) {
	events := db.GetEventsFromDB()
	c.JSON(http.StatusOK, events)
}
*/
