package http

import (
	"github.com/gin-gonic/gin"
	"snapshot/internal/middleware"
	"snapshot/internal/products"
	"snapshot/internal/service"
)

func registerProductsRoutes(api *gin.RouterGroup, mygormSvc service.MygormService) {
	if mygormSvc == nil {
		panic("mygormSvc must not be nil")
	}

	productsRepo := products.NewProductsRepository(mygormSvc.DB())

	productsHandler := &products.ProductsHandler{
		CreateProductUsecase: products.NewCreateProductUsecase(productsRepo),
		ListProductsUsecase:  products.NewListProductsUsecase(productsRepo),
		GetProductUsecase:    products.NewGetProductUsecase(productsRepo),
		UpdateProductUsecase: products.NewUpdateProductUsecase(productsRepo),
		RemoveProductUsecase: products.NewRemoveProductUsecase(productsRepo),
	}

	products := api.Group("/products", middleware.JwtAuth)
	{
		products.POST("", productsHandler.CreateProduct)
		products.GET("", productsHandler.ListProducts)
		products.GET("/:id", productsHandler.GetProduct)
		products.PUT("/:id", productsHandler.UpdateProduct)
		products.DELETE("/:id", productsHandler.RemoveProduct)
	}
}
