package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"reflect"
	"snapshot/internal/config"
	genroutes "snapshot/internal/http"
	"snapshot/internal/service"
	"snapshot/pkg/runtime"
	"strings"
	"syscall"
	"time"

	cors "github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
)

func main() {
	cfg := config.Load()

	logger := runtime.NewLogger(runtime.LoggerConfig{
		Level:  "info",
		Format: "json",
	})
	runtime.SetDefaultLogger(logger)

	mygormSvc, err := service.NewMygormService()
	if err != nil {
		panic(err)
	}
	defer mygormSvc.Close()
	redisSvc, err := service.NewRedisService()
	if err != nil {
		panic(err)
	}
	defer redisSvc.Close()

	// Configure validator
	if v, ok := binding.Validator.Engine().(*validator.Validate); ok {
		v.RegisterTagNameFunc(func(fld reflect.StructField) string {
			name := strings.SplitN(fld.Tag.Get("json"), ",", 2)[0]
			if name == "-" || name == "" {
				return fld.Name
			}
			return name
		})
	}

	r := gin.Default()
	r.Use(runtime.RequestContextMiddleware())

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost" + cfg.PORT},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           86400,
	}))

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	r.GET("/readyz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	})
	api := r.Group("/api/v1")
	genroutes.RegisterRoutes(api, mygormSvc, redisSvc)

	srv := &http.Server{
		Addr:    cfg.PORT,
		Handler: r,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			panic(err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		panic(err)
	}
}
