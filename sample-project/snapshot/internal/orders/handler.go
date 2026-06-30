package orders

import (
	"errors"
	"net/http"
	"github.com/gin-gonic/gin"
)

type OrdersHandler struct {
	CreateOrderUsecase CreateOrderUsecase
	ListOrdersUsecase ListOrdersUsecase
	GetOrderUsecase GetOrderUsecase
	CancelOrderUsecase CancelOrderUsecase
	AdminListAllOrdersUsecase AdminListAllOrdersUsecase
}

func (h *OrdersHandler) AdminListAllOrders(c *gin.Context) {
	var input AdminListAllOrdersRequest
	if err := c.ShouldBindQuery(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	output, err := h.AdminListAllOrdersUsecase.Execute(c.Request.Context(), input)
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

func (h *OrdersHandler) CancelOrder(c *gin.Context) {
	var input CancelOrdersRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	input.Id = c.Param("id")
	output, err := h.CancelOrderUsecase.Execute(c.Request.Context(), input)
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

func (h *OrdersHandler) CreateOrder(c *gin.Context) {
	var binding CreateOrdersRequest
	if err := c.ShouldBindJSON(&binding); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// @gen:start 9221510d
	// TODO: construct Orders entity from binding
	entity := Orders{}
	// @gen:end 9221510d
	output, err := h.CreateOrderUsecase.Execute(c.Request.Context(), entity)
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

func (h *OrdersHandler) GetOrder(c *gin.Context) {
	id := OrdersID(c.Param("id"))
	output, err := h.GetOrderUsecase.Execute(c.Request.Context(), id)
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

func (h *OrdersHandler) ListOrders(c *gin.Context) {
	var input ListOrdersRequest
	if err := c.ShouldBindQuery(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	output, err := h.ListOrdersUsecase.Execute(c.Request.Context(), input)
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
