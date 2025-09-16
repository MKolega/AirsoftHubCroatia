package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	_ "github.com/uptrace/bun/driver/pgdriver"
	"github.com/uptrace/bun/extra/bundebug"
)

var db *sql.DB
var Bun *bun.DB

func CreateDatabase() (*sql.DB, error) {
	godotenv.Load()
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
