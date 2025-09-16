package types

type Event struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Date        string  `json:"date"`
	Description string  `json:"description"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
}
