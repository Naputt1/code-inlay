package main

import (
	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
	"reflect"
	"snapshot/internal/service"
	"strings"
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
	if err := r.Run(); err != nil {
		panic(err)
	}
}
