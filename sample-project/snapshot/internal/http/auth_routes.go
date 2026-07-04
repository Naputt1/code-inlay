package http

import (
	"snapshot/internal/auth"

	"github.com/gin-gonic/gin"
)

func registerAuthRoutes(api *gin.RouterGroup) {
	authRepo := auth.NewAuthRepository()

	authHandler := &auth.AuthHandler{
		LoginUsecase:    auth.NewLoginUsecase(authRepo),
		LogoutUsecase:   auth.NewLogoutUsecase(authRepo),
		RegisterUsecase: auth.NewRegisterUsecase(authRepo),
	}

	auth := api.Group("/auth")
	{
		auth.POST("/login", authHandler.Login)
		auth.POST("/logout", authHandler.Logout)
		auth.POST("/register", authHandler.Register)
		auth.GET("/events", authHandler.StreamAuthEvents)
	}
}
