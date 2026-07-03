package http

import (
	"snapshot/internal/middleware"
	"snapshot/internal/products"
	"snapshot/internal/service"

	"github.com/gin-gonic/gin"
)

func registerProductsRoutes(api *gin.RouterGroup, mygormSvc service.MygormService) {
	if mygormSvc == nil {
		panic("mygormSvc must not be nil")
	}

	productsRepo := products.NewProductsRepository(mygormSvc.DB())

	productsHandler := &products.ProductsHandler{
		CreateUsecase: products.NewCreateUsecase(productsRepo),
		ListUsecase:   products.NewListUsecase(productsRepo),
		GetUsecase:    products.NewGetUsecase(productsRepo),
		UpdateUsecase: products.NewUpdateUsecase(productsRepo),
		RemoveUsecase: products.NewRemoveUsecase(productsRepo),
	}

	products := api.Group("/products", middleware.JwtAuth)
	{
		products.POST("", productsHandler.Create)
		products.GET("", productsHandler.List)
		products.GET("/:id", productsHandler.Get)
		products.PUT("/:id", productsHandler.Update)
		products.DELETE("/:id", productsHandler.Remove)
	}
}
