package http

import (
	"snapshot/internal/service"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, mygormSvc service.MygormService, redisSvc service.RedisService) {
	registerProductsRoutes(api, mygormSvc)
	registerOrdersRoutes(api, mygormSvc, redisSvc)
	registerAuthRoutes(api)
}
