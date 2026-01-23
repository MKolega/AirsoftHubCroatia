package types

type Event struct {
	ID          int     `bun:"id,pk,autoincrement" json:"id"`
	Name        string  `bun:"name,notnull" json:"name"`
	Date        string  `bun:"date" json:"date"`
	Description string  `bun:"description" json:"description"`
	Location    string  `bun:"location" json:"location"`
	Lat         float64 `bun:"lat" json:"lat"`
	Lng         float64 `bun:"lng" json:"lng"`
}
