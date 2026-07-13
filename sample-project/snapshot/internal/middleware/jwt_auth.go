package middleware

import (
	"github.com/gin-gonic/gin"
)

func JwtAuth(c *gin.Context) {
	// TODO: implement JwtAuth
	c.Next()
}
