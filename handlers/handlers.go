package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/MKolega/AirsoftHubCroatia/internal/db"
	"github.com/MKolega/AirsoftHubCroatia/types"
	"github.com/gin-gonic/gin"
)

var allowedEventCategories = map[string]struct{}{
	"24h":      {},
	"12h":      {},
	"Skirmish": {},
}

func normalizeCategory(raw string) (string, bool) {
	cat := strings.TrimSpace(raw)
	if cat == "" {
		cat = "Skirmish"
	}
	_, ok := allowedEventCategories[cat]
	return cat, ok
}

func randomHex(bytesLen int) (string, error) {
	b := make([]byte, bytesLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

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
	contentType := c.GetHeader("Content-Type")
	if strings.Contains(contentType, "multipart/form-data") {
		name := strings.TrimSpace(c.PostForm("name"))
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Name is required"})
			return
		}

		category, ok := normalizeCategory(c.PostForm("category"))
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid category"})
			return
		}
		latStr := strings.TrimSpace(c.PostForm("lat"))
		lngStr := strings.TrimSpace(c.PostForm("lng"))
		lat, err := strconv.ParseFloat(latStr, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid lat"})
			return
		}
		lng, err := strconv.ParseFloat(lngStr, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid lng"})
			return
		}

		event := types.Event{
			Name:                name,
			Description:         c.PostForm("description"),
			DetailedDescription: c.PostForm("detailedDescription"),
			Location:            c.PostForm("location"),
			Date:                c.PostForm("date"),
			Lat:                 lat,
			Lng:                 lng,
			Category:            category,
			FacebookLink:        c.PostForm("facebookLink"),
		}
		if email, ok := emailFromAuthHeader(c); ok {
			event.CreatorEmail = email
		}

		fileHeader, err := c.FormFile("thumbnail")
		if err == nil && fileHeader != nil {
			const maxSize = 5 << 20 // 5 MiB
			if fileHeader.Size > maxSize {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Thumbnail too large (max 5MB)"})
				return
			}

			mime := fileHeader.Header.Get("Content-Type")
			if mime != "" && !strings.HasPrefix(mime, "image/") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Thumbnail must be an image"})
				return
			}

			if err := os.MkdirAll("uploads", 0o755); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare upload dir"})
				return
			}

			rnd, err := randomHex(16)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate filename"})
				return
			}
			ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
			if ext == "" {
				ext = ".img"
			}
			filename := fmt.Sprintf("%s%s", rnd, ext)
			dst := filepath.Join("uploads", filename)

			if err := c.SaveUploadedFile(fileHeader, dst); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save thumbnail"})
				return
			}

			event.Thumbnail = "/uploads/" + filename
		}

		if err := db.InsertEventToDB(&event); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create event"})
			return
		}
		c.JSON(http.StatusCreated, event)
		return
	}

	var event types.Event
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":        "Invalid input",
			"details":      err.Error(),
			"content_type": contentType,
		})
		return
	}
	category, ok := normalizeCategory(event.Category)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid category"})
		return
	}
	event.Category = category
	if email, ok := emailFromAuthHeader(c); ok {
		event.CreatorEmail = email
	}
	if err := db.InsertEventToDB(&event); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create event"})
		return
	}
	c.JSON(http.StatusCreated, event)
}

func UpdateEventHandler(c *gin.Context) {
	id := c.Param("id")
	contentType := c.GetHeader("Content-Type")
	if strings.Contains(contentType, "multipart/form-data") {
		name := strings.TrimSpace(c.PostForm("name"))
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Name is required"})
			return
		}

		category, ok := normalizeCategory(c.PostForm("category"))
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid category"})
			return
		}
		latStr := strings.TrimSpace(c.PostForm("lat"))
		lngStr := strings.TrimSpace(c.PostForm("lng"))
		lat, err := strconv.ParseFloat(latStr, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid lat"})
			return
		}
		lng, err := strconv.ParseFloat(lngStr, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid lng"})
			return
		}

		event := types.Event{
			Name:                name,
			Description:         c.PostForm("description"),
			DetailedDescription: c.PostForm("detailedDescription"),
			Location:            c.PostForm("location"),
			Date:                c.PostForm("date"),
			Lat:                 lat,
			Lng:                 lng,
			Category:            category,
			FacebookLink:        c.PostForm("facebookLink"),
		}

		columns := []string{"name", "description", "detailed_description", "location", "date", "lat", "lng", "category", "facebook_link"}

		fileHeader, err := c.FormFile("thumbnail")
		if err == nil && fileHeader != nil {
			const maxSize = 5 << 20 // 5 MiB
			if fileHeader.Size > maxSize {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Thumbnail too large (max 5MB)"})
				return
			}

			mime := fileHeader.Header.Get("Content-Type")
			if mime != "" && !strings.HasPrefix(mime, "image/") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Thumbnail must be an image"})
				return
			}

			if err := os.MkdirAll("uploads", 0o755); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare upload dir"})
				return
			}

			rnd, err := randomHex(16)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate filename"})
				return
			}
			ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
			if ext == "" {
				ext = ".img"
			}
			filename := fmt.Sprintf("%s%s", rnd, ext)
			dst := filepath.Join("uploads", filename)

			if err := c.SaveUploadedFile(fileHeader, dst); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save thumbnail"})
				return
			}

			event.Thumbnail = "/uploads/" + filename
			columns = append(columns, "thumbnail")
		}

		if err := db.UpdateEventInDBColumns(id, &event, columns...); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update event", "details": err.Error()})
			return
		}
		c.JSON(http.StatusOK, event)
		return
	}

	var event types.Event
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":        "Invalid input",
			"details":      err.Error(),
			"content_type": contentType,
		})
		return
	}
	category, ok := normalizeCategory(event.Category)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid category"})
		return
	}
	event.Category = category
	columns := []string{"name", "description", "detailed_description", "location", "date", "lat", "lng", "category", "facebook_link"}
	if event.Thumbnail != "" {
		columns = append(columns, "thumbnail")
	}
	if err := db.UpdateEventInDBColumns(id, &event, columns...); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update event", "details": err.Error()})
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
