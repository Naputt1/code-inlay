package http

import (
	"github.com/gin-gonic/gin"
	"snapshot/internal/auth"
	"func registerAuthRoutes(api *gin.RouterGroup) {"
	"authHandler := &auth.AuthHandler{"
	"LoginUsecase: nil, // TODO: inject"
	"LogoutUsecase: nil, // TODO: inject"
	"RegisterUsecase: nil, // TODO: inject"
	"}"
	auth := api.Group("/auth")
	"{"
	auth.POST("/login", authHandler.Login)
	auth.POST("/logout", authHandler.Logout)
	auth.POST("/register", authHandler.Register)
	"}"
	"}"
)
