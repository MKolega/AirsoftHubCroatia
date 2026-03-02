package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/MKolega/AirsoftHubCroatia/internal/db"
	"github.com/MKolega/AirsoftHubCroatia/internal/storage"
	"github.com/MKolega/AirsoftHubCroatia/types"
	"github.com/gin-gonic/gin"
)

func dayBounds(t time.Time) (time.Time, time.Time) {
	y, m, d := t.Date()
	loc := t.Location()
	start := time.Date(y, m, d, 0, 0, 0, 0, loc)
	end := start.AddDate(0, 0, 1)
	return start, end
}

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

func MyEventsHandler(c *gin.Context) {
	email, ok := emailFromAuthHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Sign in required"})
		return
	}

	events, err := db.GetEventsByCreatorEmailAllStatuses(email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch your events"})
		return
	}

	c.JSON(http.StatusOK, events)
}

func CreateEventHandler(c *gin.Context) {
	contentType := c.GetHeader("Content-Type")
	creatorEmail, ok := emailFromAuthHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Sign in required to create events"})
		return
	}
	user, err := db.GetUserByEmail(creatorEmail)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	status := "pending"
	if user.IsAdmin {
		status = "approved"
	}
	start, end := dayBounds(time.Now())
	count, err := db.CountEventsByCreatorInRange(creatorEmail, start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate daily limit"})
		return
	}
	if count >= 2 {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Daily limit reached (2 events per day)"})
		return
	}

	if strings.Contains(contentType, "multipart/form-data") {
		name := strings.TrimSpace(c.PostForm("name"))
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Name is required"})
			return
		}

		detailed := strings.TrimSpace(c.PostForm("detailedDescription"))
		if detailed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Detailed description is required"})
			return
		}

		description := strings.TrimSpace(c.PostForm("description"))
		if utf8.RuneCountInString(description) > 400 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Small description must be 400 characters or less"})
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
			Status:              status,
			Name:                name,
			Description:         description,
			DetailedDescription: detailed,
			CreatorEmail:        creatorEmail,
			Location:            c.PostForm("location"),
			Date:                c.PostForm("date"),
			Lat:                 lat,
			Lng:                 lng,
			Category:            category,
			FacebookLink:        c.PostForm("facebookLink"),
		}

		fileHeader, err := c.FormFile("thumbnail")
		if err == nil && fileHeader != nil {
			const maxSize = 5 << 20 // 5 MiB
			url, err := storage.UploadThumbnail(c.Request.Context(), fileHeader, maxSize)
			if err != nil {
				status := http.StatusInternalServerError
				if storage.IsClientUploadError(err) {
					status = http.StatusBadRequest
				}
				c.JSON(status, gin.H{"error": err.Error()})
				return
			}
			event.Thumbnail = url
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

	event.Description = strings.TrimSpace(event.Description)
	event.DetailedDescription = strings.TrimSpace(event.DetailedDescription)
	if event.DetailedDescription == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Detailed description is required"})
		return
	}
	if utf8.RuneCountInString(event.Description) > 400 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Small description must be 400 characters or less"})
		return
	}

	event.Category = category
	event.CreatorEmail = creatorEmail
	event.Status = status
	if err := db.InsertEventToDB(&event); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create event"})
		return
	}
	c.JSON(http.StatusCreated, event)
}

func requireAdmin(c *gin.Context) (string, bool) {
	email, ok := emailFromAuthHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return "", false
	}
	user, err := db.GetUserByEmail(email)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return "", false
	}
	if !user.IsAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return "", false
	}
	return email, true
}

func AdminPendingReviewEventsHandler(c *gin.Context) {
	_, ok := requireAdmin(c)
	if !ok {
		return
	}

	events, err := db.GetPendingEventsFromDB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch pending events"})
		return
	}
	c.JSON(http.StatusOK, events)
}

func AdminApproveEventHandler(c *gin.Context) {
	adminEmail, ok := requireAdmin(c)
	if !ok {
		return
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event id"})
		return
	}

	if err := db.ReviewEvent(id, "approved", adminEmail, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to approve event"})
		return
	}

	c.Status(http.StatusNoContent)
}
func AdminRejectEventHandler(c *gin.Context) {
	adminEmail, ok := requireAdmin(c)
	if !ok {
		return
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event id"})
		return
	}

	var req types.AdminRejectRequest
	_ = c.ShouldBindJSON(&req)

	if err := db.ReviewEvent(id, "rejected", adminEmail, &req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reject event"})
		return
	}

	c.Status(http.StatusNoContent)
}

func UpdateEventHandler(c *gin.Context) {
	_, ok := requireAdmin(c)
	if !ok {
		return
	}

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

		detailed := strings.TrimSpace(c.PostForm("detailedDescription"))
		if detailed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Detailed description is required"})
			return
		}

		description := strings.TrimSpace(c.PostForm("description"))
		if utf8.RuneCountInString(description) > 400 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Small description must be 400 characters or less"})
			return
		}

		event := types.Event{
			Name:                name,
			Description:         description,
			DetailedDescription: detailed,
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
			url, err := storage.UploadThumbnail(c.Request.Context(), fileHeader, maxSize)
			if err != nil {
				status := http.StatusInternalServerError
				if storage.IsClientUploadError(err) {
					status = http.StatusBadRequest
				}
				c.JSON(status, gin.H{"error": err.Error()})
				return
			}
			event.Thumbnail = url
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

	event.Description = strings.TrimSpace(event.Description)
	event.DetailedDescription = strings.TrimSpace(event.DetailedDescription)
	if event.DetailedDescription == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Detailed description is required"})
		return
	}
	if utf8.RuneCountInString(event.Description) > 400 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Small description must be 400 characters or less"})
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
	_, ok := requireAdmin(c)
	if !ok {
		return
	}

	id := c.Param("id")
	err := db.DeleteEventFromDB(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete event"})
		return
	}
	c.Status(http.StatusNoContent)
}

func SaveEventHandler(c *gin.Context) {
	email, ok := emailFromAuthHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Sign in required"})
		return
	}

	user, err := db.GetUserByEmail(email)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event id"})
		return
	}

	if err := db.SaveEvent(user.ID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save event"})
		return
	}

	c.Status(http.StatusNoContent)
}

func UnsaveEventHandler(c *gin.Context) {
	email, ok := emailFromAuthHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Sign in required"})
		return
	}

	user, err := db.GetUserByEmail(email)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event id"})
		return
	}

	if err := db.UnsaveEvent(user.ID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unsave event"})
		return
	}

	c.Status(http.StatusNoContent)
}

func SavedEventsHandler(c *gin.Context) {
	email, ok := emailFromAuthHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Sign in required"})
		return
	}

	user, err := db.GetUserByEmail(email)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	events, err := db.GetSavedEventsForUser(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch saved events"})
		return
	}

	c.JSON(http.StatusOK, events)
}
