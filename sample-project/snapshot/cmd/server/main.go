package main

import (
	"context"
	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
	"net/http"
	"os"
	"os/signal"
	"reflect"
	"snapshot/internal/service"
	"strings"
	"syscall"
	"time"
	genroutes "snapshot/internal/http"
)

func main() {
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
	api := r.Group("/api/v1")
	genroutes.RegisterRoutes(api, mygormSvc, redisSvc)

	addr := os.Getenv("PORT")
	if addr == "" {
		addr = ":8080"
	}
	if !strings.HasPrefix(addr, ":") {
		addr = ":" + addr
	}

	srv := &http.Server{
		Addr:    addr,
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
