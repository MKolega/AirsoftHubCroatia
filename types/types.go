package types

type Event struct {
	ID                  int     `bun:"id,pk,autoincrement" json:"id"`
	Name                string  `bun:"name,notnull" json:"name"`
	Date                string  `bun:"date" json:"date"`
	Description         string  `bun:"description" json:"description"`
	DetailedDescription string  `bun:"detailed_description" json:"detailed_description,omitempty"`
	Location            string  `bun:"location" json:"location"`
	Lat                 float64 `bun:"lat" json:"lat"`
	Lng                 float64 `bun:"lng" json:"lng"`
	Category            string  `bun:"category" json:"category,omitempty"`
	FacebookLink        string  `bun:"facebook_link" json:"facebook_link,omitempty"`
	Thumbnail           string  `bun:"thumbnail" json:"thumbnail,omitempty"`
}
