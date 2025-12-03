package middleware

import (
	"net/http"

	"github.com/monzim/db_proxy/v1/internal/config"
	"github.com/rs/cors"
)

// NewCORSMiddleware creates a new CORS middleware handler using the rs/cors library.
// It configures CORS based on the provided CORSConfig from environment variables.
func NewCORSMiddleware(cfg *config.CORSConfig) func(http.Handler) http.Handler {
	c := cors.New(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   cfg.AllowedMethods,
		AllowedHeaders:   cfg.AllowedHeaders,
		ExposedHeaders:   cfg.ExposedHeaders,
		AllowCredentials: cfg.AllowCredentials,
		MaxAge:           cfg.MaxAge,
		Debug:            cfg.Debug,
	})

	return c.Handler
}

// NewCORSHandler creates a CORS handler that wraps an http.Handler.
// Use this when you need to wrap the entire router.
func NewCORSHandler(cfg *config.CORSConfig, handler http.Handler) http.Handler {
	c := cors.New(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   cfg.AllowedMethods,
		AllowedHeaders:   cfg.AllowedHeaders,
		ExposedHeaders:   cfg.ExposedHeaders,
		AllowCredentials: cfg.AllowCredentials,
		MaxAge:           cfg.MaxAge,
		Debug:            cfg.Debug,
	})

	return c.Handler(handler)
}
