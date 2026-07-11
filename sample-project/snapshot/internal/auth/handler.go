package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"snapshot/internal/httperr"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	LoginUsecase            LoginUsecase
	LogoutUsecase           LogoutUsecase
	RegisterUsecase         RegisterUsecase
	StreamAuthEventsUsecase StreamAuthEventsUsecase
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
		var httpErr httperr.HTTPError
		if errors.As(err, &httpErr) {
			c.JSON(httpErr.HTTPStatus(), err)
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
		}
		return
	}
	c.JSON(http.StatusOK, output)
}

func (h *AuthHandler) Logout(c *gin.Context) {
	input := struct{}{}
	output, err := h.LogoutUsecase.Execute(c.Request.Context(), input)
	if err != nil {
		var httpErr httperr.HTTPError
		if errors.As(err, &httpErr) {
			c.JSON(httpErr.HTTPStatus(), err)
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
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
		var httpErr httperr.HTTPError
		if errors.As(err, &httpErr) {
			c.JSON(httpErr.HTTPStatus(), err)
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
		}
		return
	}
	c.JSON(http.StatusOK, output)
}

func (h *AuthHandler) StreamAuthEvents(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	marshalEvent := func(v StreamAuthEventsAuthEvent) ([]byte, error) {
		return json.Marshal(v)
	}
	ch := make(chan StreamAuthEventsAuthEvent)
	go h.StreamAuthEventsUsecase.Execute(c.Request.Context(), ch, marshalEvent)
	c.Stream(func(w io.Writer) bool {
		event, ok := <-ch
		if !ok {
			return false
		}
		data, err := marshalEvent(event)
		if err != nil {
			return false
		}
		fmt.Fprintf(w, "data: %s\\n\\n", data)
		return true
	})
}
