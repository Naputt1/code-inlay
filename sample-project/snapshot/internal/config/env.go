package config

import (
	"github.com/joho/godotenv"
	"log"
	"os"
	"strings"
)

type Config struct {
	// Server listen port
	PORT string
}

func Load() Config {
	if err := godotenv.Load(); err != nil {
		log.Println(".env file not loaded, using system env vars:", err)
	}
	var cfg Config

	cfg.PORT = os.Getenv("PORT")
	if cfg.PORT == "" {
		cfg.PORT = "8080"
	}
	if !strings.HasPrefix(cfg.PORT, ":") {
		cfg.PORT = ":" + cfg.PORT
	}
	return cfg
}
