package main

import (
	"github.com/gin-gonic/gin"
	"snapshot/internal/service"
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

	r := gin.Default()
	api := r.Group("/api/v1")
	genroutes.RegisterRoutes(api, mygormSvc, redisSvc)
	if err := r.Run(); err != nil {
		panic(err)
	}
}
