package orders

import (
	"errors"
	"net/http"
	"snapshot/internal/httperr"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type OrdersHandler struct {
	CreateUsecase             CreateUsecase
	ListUsecase               ListUsecase
	GetUsecase                GetUsecase
	CancelUsecase             CancelUsecase
	TrackOrderUsecase         TrackOrderUsecase
	AdminListAllOrdersUsecase AdminListAllOrdersUsecase
}

func (h *OrdersHandler) AdminListAllOrders(c *gin.Context) {
	var input AdminListAllOrdersOrdersRequest
	if err := c.ShouldBindQuery(&input); err != nil {
		status, body := httperr.ResolveBindingError(err)
		c.JSON(status, body)
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

func (h *OrdersHandler) Cancel(c *gin.Context) {
	var input CancelOrdersRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		status, body := httperr.ResolveBindingError(err)
		c.JSON(status, body)
		return
	}
	input.Id = c.Param("id")
	output, err := h.CancelUsecase.Execute(c.Request.Context(), input)
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

func (h *OrdersHandler) Create(c *gin.Context) {
	var binding CreateOrdersRequest
	if err := c.ShouldBindJSON(&binding); err != nil {
		status, body := httperr.ResolveBindingError(err)
		c.JSON(status, body)
		return
	}
	// @gen:start 9221510d
	// TODO: construct Orders entity from binding
	entity := Orders{}
	// @gen:end 9221510d
	output, err := h.CreateUsecase.Execute(c.Request.Context(), entity)
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

func (h *OrdersHandler) Get(c *gin.Context) {
	id := OrdersID(c.Param("id"))
	output, err := h.GetUsecase.Execute(c.Request.Context(), id)
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

func (h *OrdersHandler) List(c *gin.Context) {
	var input ListOrdersRequest
	if err := c.ShouldBindQuery(&input); err != nil {
		status, body := httperr.ResolveBindingError(err)
		c.JSON(status, body)
		return
	}
	output, err := h.ListUsecase.Execute(c.Request.Context(), input)
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

func (h *OrdersHandler) TrackOrder(c *gin.Context) {
	upgrader := websocket.Upgrader{}
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	readCh := make(chan TrackOrderOrdersMessage)
	writeCh := make(chan TrackOrderOrdersEvent, 8)

	go h.TrackOrderUsecase.Execute(c.Request.Context(), readCh, writeCh)

	go func() {
		defer close(readCh)
		for {
			var msg TrackOrderOrdersMessage
			if err := conn.ReadJSON(&msg); err != nil {
				break
			}
			readCh <- msg
		}
	}()

	for event := range writeCh {
		if err := conn.WriteJSON(event); err != nil {
			break
		}
	}
}
