package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Address string
	DBUrl   string
}

func Load() Config {
	_ = godotenv.Load() // load .env file if present

	cfg := Config{
		Address: getEnv("APP_ADDRESS", ":8080"),
		DBUrl:   getEnv("DATABASE_URL", "postgres://user:pass@localhost:54321airsoftdb?sslmode=disable"),
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
