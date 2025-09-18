package types

type Event struct {
	ID          int     `bun:"id,pk,autoincrement"`
	Name        string  `json:"name"`
	Date        string  `json:"date"`
	Description string  `json:"description"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
}
