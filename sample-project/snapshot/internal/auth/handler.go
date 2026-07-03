package auth

import (
	"errors"
	"net/http"
	"snapshot/internal/httperr"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	LoginUsecase    LoginUsecase
	LogoutUsecase   LogoutUsecase
	RegisterUsecase RegisterUsecase
}

func (h *AuthHandler) Login(c *gin.Context) {
	var input LoginAuthRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		status, body := httperr.ResolveBindingError(err)
		c.JSON(status, body)
		return
	}
	output, err := h.LoginUsecase.Execute(c.Request.Context(), input)
	if err != nil {
		var httpErr interface{ HTTPStatus() int }
		if errors.As(err, &httpErr) {
			c.JSON(httpErr.HTTPStatus(), err)
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, output)
}

func (h *AuthHandler) Logout(c *gin.Context) {
	input := struct{}{}
	output, err := h.LogoutUsecase.Execute(c.Request.Context(), input)
	if err != nil {
		var httpErr interface{ HTTPStatus() int }
		if errors.As(err, &httpErr) {
			c.JSON(httpErr.HTTPStatus(), err)
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, output)
}

func (h *AuthHandler) Register(c *gin.Context) {
	var input RegisterAuthRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		status, body := httperr.ResolveBindingError(err)
		c.JSON(status, body)
		return
	}
	output, err := h.RegisterUsecase.Execute(c.Request.Context(), input)
	if err != nil {
		var httpErr interface{ HTTPStatus() int }
		if errors.As(err, &httpErr) {
			c.JSON(httpErr.HTTPStatus(), err)
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, output)
}
