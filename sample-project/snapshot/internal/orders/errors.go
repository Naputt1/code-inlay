package orders

import "net/http"

type OrderShippedError struct {
	OrderId   string `json:"orderId"`
	ShippedAt string `json:"shippedAt"`
}

func (e *OrderShippedError) Error() string {
	return "OrderShippedError"
}
func (e *OrderShippedError) HTTPStatus() int {
	return http.StatusConflict
}
