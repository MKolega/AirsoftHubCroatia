package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"

	"github.com/MKolega/AirsoftHubCroatia/types"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	_ "github.com/uptrace/bun/driver/pgdriver"
	"github.com/uptrace/bun/extra/bundebug"
)

var Bun *bun.DB

func CreateDatabase() (*sql.DB, error) {
	_ = godotenv.Load()
	var (
		dbname = os.Getenv("DB_NAME")
		dbuser = os.Getenv("DB_USER")
		dbpass = os.Getenv("DB_PASS")
		dbhost = os.Getenv("DB_HOST")
		uri    = fmt.Sprintf("postgres://%s:%s@%s:5431/%s?sslmode=disable", dbuser, dbpass, dbhost, dbname)
	)
	db, err := sql.Open("postgres", uri)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %v", err)
	}
	return db, nil

}

func Init() error {
	db, err := CreateDatabase()
	if err != nil {
		return err
	}
	Bun = bun.NewDB(db, pgdialect.New())
	Bun.AddQueryHook(bundebug.NewQueryHook())

	err = CreateEventsTable()
	if err != nil {
		return err
	}
	err = SeedEventsTable()
	if err != nil {
		return err
	}
	return nil
}

func CreateEventsTable() error {
	query := `CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            lat DOUBLE PRECISION,
            lng DOUBLE PRECISION,
            location TEXT,
            date DATE
        );`
	_, err := Bun.ExecContext(context.Background(), query)
	return err
}

func GetEventsFromDB() ([]types.Event, error) {
	var events []types.Event
	err := Bun.NewSelect().Model(&events).Order("date").Scan(context.Background())
	if err != nil {
		return nil, err
	}
	return events, nil
}

func SeedEventsTable() error {
	count, err := Bun.NewSelect().Model((*types.Event)(nil)).Count(context.Background())
	if err != nil {
		return err
	}
	if count > 0 {
		// Table already seeded
		return nil
	}
	events := []types.Event{
		{Name: "Event 1", Description: "Desc 1", Lat: 45.0, Lng: 16.0, Date: "2024-07-01"},
		{Name: "Event 2", Description: "Desc 2", Lat: 46.0, Lng: 17.0, Date: "2024-07-15"},
	}
	_, err = Bun.NewInsert().Model(&events).Exec(context.Background())
	return err
}

func InsertEventToDB(event *types.Event) error {
	_, err := Bun.NewInsert().Model(event).Exec(context.Background())
	return err
}

func UpdateEventInDB(id string, event *types.Event) error {
	_, err := Bun.NewUpdate().Model(event).Where("id = ?", id).Exec(context.Background())
	return err
}

func DeleteEventFromDB(id string) error {
	_, err := Bun.NewDelete().Model((*types.Event)(nil)).Where("id = ?", id).Exec(context.Background())
	return err
}
