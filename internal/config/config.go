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
	_ = godotenv.Load()

	cfg := Config{
		Address: GetEnv("APP_ADDRESS", ":8080"),
		DBUrl:   GetEnv("DATABASE_URL", "postgres://user:pass@localhost:5431/airsoftdb?sslmode=disable"),
	}
	return cfg
}

func GetEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
