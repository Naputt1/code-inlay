package http

import (
	"github.com/gin-gonic/gin"
	"snapshot/internal/auth"
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
	}
}
