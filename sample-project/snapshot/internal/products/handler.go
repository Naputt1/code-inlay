package products

import (
	"errors"
	"net/http"
	"snapshot/internal/httperr"

	"github.com/gin-gonic/gin"
)

type ProductsHandler struct {
	CreateProductUsecase CreateProductUsecase
	ListProductsUsecase  ListProductsUsecase
	GetProductUsecase    GetProductUsecase
	UpdateProductUsecase UpdateProductUsecase
	RemoveProductUsecase RemoveProductUsecase
}

func (h *ProductsHandler) CreateProduct(c *gin.Context) {
	var binding CreateProductsRequest
	if err := c.ShouldBindJSON(&binding); err != nil {
		status, body := httperr.ResolveBindingError(err)
		c.JSON(status, body)
		return
	}
	// @gen:start f5ea9736
	// TODO: construct Products entity from binding
	entity := Products{}
	// @gen:end f5ea9736
	output, err := h.CreateProductUsecase.Execute(c.Request.Context(), entity)
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

func (h *ProductsHandler) GetProduct(c *gin.Context) {
	id := ProductsID(c.Param("id"))
	output, err := h.GetProductUsecase.Execute(c.Request.Context(), id)
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

func (h *ProductsHandler) ListProducts(c *gin.Context) {
	var input ListProductsRequest
	if err := c.ShouldBindQuery(&input); err != nil {
		status, body := httperr.ResolveBindingError(err)
		c.JSON(status, body)
		return
	}
	output, err := h.ListProductsUsecase.Execute(c.Request.Context(), input)
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

func (h *ProductsHandler) RemoveProduct(c *gin.Context) {
	var input RemoveProductsRequest
	if err := c.ShouldBindQuery(&input); err != nil {
		status, body := httperr.ResolveBindingError(err)
		c.JSON(status, body)
		return
	}
	input.Id = c.Param("id")
	id := ProductsID(c.Param("id"))
	output, err := h.RemoveProductUsecase.Execute(c.Request.Context(), id)
	if err != nil {
		var httpErr interface{ HTTPStatus() int }
		if errors.As(err, &httpErr) {
			c.Status(httpErr.HTTPStatus())
		} else {
			c.Status(http.StatusInternalServerError)
		}
		return
	}
	_ = output
	c.Status(http.StatusNoContent)
}

func (h *ProductsHandler) UpdateProduct(c *gin.Context) {
	var binding UpdateProductsRequest
	if err := c.ShouldBindJSON(&binding); err != nil {
		status, body := httperr.ResolveBindingError(err)
		c.JSON(status, body)
		return
	}
	id := ProductsID(c.Param("id"))
	// @gen:start 250be001
	// TODO: construct Products entity from binding
	entity := Products{}
	// @gen:end 250be001
	output, err := h.UpdateProductUsecase.Execute(c.Request.Context(), id, entity)
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
