package types

import "time"

type Event struct {
	ID                  int     `bun:"id,pk,autoincrement" json:"id"`
	Name                string  `bun:"name,notnull" json:"name"`
	Date                string  `bun:"date" json:"date"`
	Description         string  `bun:"description" json:"description"`
	DetailedDescription string  `bun:"detailed_description" json:"detailed_description,omitempty"`
	CreatorEmail        string  `bun:"creator_email" json:"creator_email,omitempty"`
	Location            string  `bun:"location" json:"location"`
	Lat                 float64 `bun:"lat" json:"lat"`
	Lng                 float64 `bun:"lng" json:"lng"`
	Category            string  `bun:"category" json:"category,omitempty"`
	FacebookLink        string  `bun:"facebook_link" json:"facebook_link,omitempty"`
	Thumbnail           string  `bun:"thumbnail" json:"thumbnail,omitempty"`
}

type User struct {
	ID           int       `bun:"id,pk,autoincrement" json:"id"`
	Email        string    `bun:"email,unique,notnull" json:"email"`
	Username     string    `bun:"username" json:"username"`
	AirsoftClub  string    `bun:"airsoft_club" json:"airsoft_club"`
	PasswordHash string    `bun:"password_hash,notnull" json:"-"`
	CreatedAt    time.Time `bun:"created_at,notnull" json:"created_at"`
}
