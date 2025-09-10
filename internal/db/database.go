package db

import (
	"database/sql"
	"fmt"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"os"
)

var db *sql.DB

func CreateDatabase() (*sql.DB, error) {
	godotenv.Load()
	var (
		dbname = os.Getenv("DB_NAME")
		dbuser = os.Getenv("DB_USER")
		dbpass = os.Getenv("DB_PASS")
		dbhost = os.Getenv("DB_HOST")
		uri    = fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=5432", dbhost, dbuser, dbpass, dbname)
	)
	db, err := sql.Open("postgres", uri)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %v", err)
	}
	return db, nil
}
