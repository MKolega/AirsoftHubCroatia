package handlers

import (
	"net/http"

	"github.com/MKolega/AirsoftHubCroatia/internal/db"
	"github.com/MKolega/AirsoftHubCroatia/types"
	"github.com/gin-gonic/gin"
)

func HomeHandler(c *gin.Context) {
	c.String(http.StatusOK, "Welcome to the Airsoft Hub Croatia")

}

func EventsHandler(c *gin.Context) {
	events, err := db.GetEventsFromDB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch events"})
		return
	}
	c.JSON(http.StatusOK, events)
}

func CreateEventHandler(c *gin.Context) {
	var event types.Event
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}
	err := db.InsertEventToDB(&event)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create event"})
		return
	}
	c.JSON(http.StatusCreated, event)
}

func UpdateEventHandler(c *gin.Context) {
	id := c.Param("id")
	var event types.Event
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}
	err := db.UpdateEventInDB(id, &event)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update event"})
		return
	}
	c.JSON(http.StatusOK, event)
}

func DeleteEventHandler(c *gin.Context) {
	id := c.Param("id")
	err := db.DeleteEventFromDB(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete event"})
		return
	}
	c.Status(http.StatusNoContent)
}
