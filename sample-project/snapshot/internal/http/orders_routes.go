package http

import (
	"github.com/gin-gonic/gin"
	"snapshot/internal/middleware"
	"snapshot/internal/orders"
	"snapshot/internal/service"
)

func registerOrdersRoutes(api *gin.RouterGroup, mygormSvc service.MygormService, redisSvc service.RedisService) {
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
