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
		CreateOrderUsecase:        orders.NewCreateOrderUsecase(ordersRepo, redisSvc),
		ListOrdersUsecase:         orders.NewListOrdersUsecase(ordersRepo, redisSvc),
		GetOrderUsecase:           orders.NewGetOrderUsecase(ordersRepo, redisSvc),
		CancelOrderUsecase:        orders.NewCancelOrderUsecase(ordersRepo, redisSvc),
		AdminListAllOrdersUsecase: orders.NewAdminListAllOrdersUsecase(ordersRepo, redisSvc),
	}

	orders := api.Group("/orders", middleware.AdminAuth, middleware.JwtAuth)
	{
		orders.POST("", ordersHandler.CreateOrder)
		orders.GET("", ordersHandler.ListOrders)
		orders.GET("/:id", ordersHandler.GetOrder)
		orders.POST("/:id/cancel", ordersHandler.CancelOrder)
		orders.GET("/admin/all", ordersHandler.AdminListAllOrders)
	}
}
