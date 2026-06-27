package http

import (
	"github.com/gin-gonic/gin"
	"snapshot/internal/service"
	"func RegisterRoutes(api *gin.RouterGroup, mygormSvc service.MygormService, redisSvc service.RedisService) {"
	"registerProductsRoutes(api, mygormSvc)"
	"registerOrdersRoutes(api, redisSvc)"
	"registerAuthRoutes(api)"
	"}"
)
