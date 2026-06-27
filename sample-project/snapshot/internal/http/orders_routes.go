package http

import (
	"github.com/gin-gonic/gin"
	"snapshot/internal/middleware"
	"snapshot/internal/orders"
	"snapshot/internal/service"
	"func registerOrdersRoutes(api *gin.RouterGroup, redisSvc service.RedisService) {"
	"ordersHandler := &orders.OrdersHandler{"
	"CreateOrderUsecase: orders.NewCreateOrderUsecase(nil /*repo TODO*/, redisSvc),"
	"ListOrdersUsecase: orders.NewListOrdersUsecase(nil /*repo TODO*/, redisSvc),"
	"GetOrderUsecase: orders.NewGetOrderUsecase(nil /*repo TODO*/, redisSvc),"
	"CancelOrderUsecase: orders.NewCancelOrderUsecase(nil /*repo TODO*/, redisSvc),"
	"AdminListAllOrdersUsecase: orders.NewAdminListAllOrdersUsecase(nil /*repo TODO*/, redisSvc),"
	"}"
	orders := api.Group("/orders", middleware.AdminAuth, middleware.JwtAuth)
	"{"
	orders.POST("", ordersHandler.CreateOrder)
	orders.GET("", ordersHandler.ListOrders)
	orders.GET("/:id", ordersHandler.GetOrder)
	orders.POST("/:id/cancel", ordersHandler.CancelOrder)
	orders.GET("/admin/all", ordersHandler.AdminListAllOrders)
	"}"
	"}"
)
