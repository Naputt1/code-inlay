package http

import (
	"snapshot/internal/middleware"
	"snapshot/internal/orders"
	"snapshot/internal/service"

	"github.com/gin-gonic/gin"
)

func registerOrdersRoutes(api *gin.RouterGroup, mygormSvc service.MygormService, redisSvc service.RedisService) {
	if mygormSvc == nil {
		panic("mygormSvc must not be nil")
	}
	if redisSvc == nil {
		panic("redisSvc must not be nil")
	}

	ordersRepo := orders.NewOrdersRepository(mygormSvc.DB())

	ordersHandler := &orders.OrdersHandler{
		CreateUsecase:             orders.NewCreateUsecase(ordersRepo, redisSvc),
		ListUsecase:               orders.NewListUsecase(ordersRepo, redisSvc),
		GetUsecase:                orders.NewGetUsecase(ordersRepo, redisSvc),
		CancelUsecase:             orders.NewCancelUsecase(ordersRepo, redisSvc),
		AdminListAllOrdersUsecase: orders.NewAdminListAllOrdersUsecase(ordersRepo, redisSvc),
	}

	orders := api.Group("/orders", middleware.AdminAuth, middleware.JwtAuth)
	{
		orders.POST("", ordersHandler.Create)
		orders.GET("", ordersHandler.List)
		orders.GET("/:id", ordersHandler.Get)
		orders.POST("/:id/cancel", ordersHandler.Cancel)
		orders.GET("/track-ws", ordersHandler.TrackOrder)
		orders.GET("/admin/all", ordersHandler.AdminListAllOrders)
	}
}
