package httperr

import "net/http"

type BadRequest struct {
	Message string `json:"message"`
}

func (e *BadRequest) Error() string {
	return e.Message
}
func (e *BadRequest) HTTPStatus() int {
	return http.StatusBadRequest
}

type Unauthorized struct {
	Message string `json:"message"`
}

func (e *Unauthorized) Error() string {
	return e.Message
}
func (e *Unauthorized) HTTPStatus() int {
	return http.StatusUnauthorized
}

type PaymentRequired struct {
	Message string `json:"message"`
}

func (e *PaymentRequired) Error() string {
	return e.Message
}
func (e *PaymentRequired) HTTPStatus() int {
	return http.StatusPaymentRequired
}

type Forbidden struct {
	Message string `json:"message"`
}

func (e *Forbidden) Error() string {
	return e.Message
}
func (e *Forbidden) HTTPStatus() int {
	return http.StatusForbidden
}

type NotFound struct {
	Message string `json:"message"`
}

func (e *NotFound) Error() string {
	return e.Message
}
func (e *NotFound) HTTPStatus() int {
	return http.StatusNotFound
}

type MethodNotAllowed struct {
	Message string `json:"message"`
}

func (e *MethodNotAllowed) Error() string {
	return e.Message
}
func (e *MethodNotAllowed) HTTPStatus() int {
	return http.StatusMethodNotAllowed
}

type NotAcceptable struct {
	Message string `json:"message"`
}

func (e *NotAcceptable) Error() string {
	return e.Message
}
func (e *NotAcceptable) HTTPStatus() int {
	return http.StatusNotAcceptable
}

type RequestTimeout struct {
	Message string `json:"message"`
}

func (e *RequestTimeout) Error() string {
	return e.Message
}
func (e *RequestTimeout) HTTPStatus() int {
	return http.StatusRequestTimeout
}

type Conflict struct {
	Message string `json:"message"`
}

func (e *Conflict) Error() string {
	return e.Message
}
func (e *Conflict) HTTPStatus() int {
	return http.StatusConflict
}

type Gone struct {
	Message string `json:"message"`
}

func (e *Gone) Error() string {
	return e.Message
}
func (e *Gone) HTTPStatus() int {
	return http.StatusGone
}

type LengthRequired struct {
	Message string `json:"message"`
}

func (e *LengthRequired) Error() string {
	return e.Message
}
func (e *LengthRequired) HTTPStatus() int {
	return http.StatusLengthRequired
}

type PreconditionFailed struct {
	Message string `json:"message"`
}

func (e *PreconditionFailed) Error() string {
	return e.Message
}
func (e *PreconditionFailed) HTTPStatus() int {
	return http.StatusPreconditionFailed
}

type PayloadTooLarge struct {
	Message string `json:"message"`
}

func (e *PayloadTooLarge) Error() string {
	return e.Message
}
func (e *PayloadTooLarge) HTTPStatus() int {
	return http.StatusRequestEntityTooLarge
}

type URITooLong struct {
	Message string `json:"message"`
}

func (e *URITooLong) Error() string {
	return e.Message
}
func (e *URITooLong) HTTPStatus() int {
	return http.StatusRequestURITooLong
}

type UnsupportedMediaType struct {
	Message string `json:"message"`
}

func (e *UnsupportedMediaType) Error() string {
	return e.Message
}
func (e *UnsupportedMediaType) HTTPStatus() int {
	return http.StatusUnsupportedMediaType
}

type RangeNotSatisfiable struct {
	Message string `json:"message"`
}

func (e *RangeNotSatisfiable) Error() string {
	return e.Message
}
func (e *RangeNotSatisfiable) HTTPStatus() int {
	return http.StatusRequestedRangeNotSatisfiable
}

type ExpectationFailed struct {
	Message string `json:"message"`
}

func (e *ExpectationFailed) Error() string {
	return e.Message
}
func (e *ExpectationFailed) HTTPStatus() int {
	return http.StatusExpectationFailed
}

type ImATeapot struct {
	Message string `json:"message"`
}

func (e *ImATeapot) Error() string {
	return e.Message
}
func (e *ImATeapot) HTTPStatus() int {
	return http.StatusTeapot
}

type MisdirectedRequest struct {
	Message string `json:"message"`
}

func (e *MisdirectedRequest) Error() string {
	return e.Message
}
func (e *MisdirectedRequest) HTTPStatus() int {
	return http.StatusMisdirectedRequest
}

type UnprocessableEntity struct {
	Message string `json:"message"`
}

func (e *UnprocessableEntity) Error() string {
	return e.Message
}
func (e *UnprocessableEntity) HTTPStatus() int {
	return http.StatusUnprocessableEntity
}

type Locked struct {
	Message string `json:"message"`
}

func (e *Locked) Error() string {
	return e.Message
}
func (e *Locked) HTTPStatus() int {
	return http.StatusLocked
}

type FailedDependency struct {
	Message string `json:"message"`
}

func (e *FailedDependency) Error() string {
	return e.Message
}
func (e *FailedDependency) HTTPStatus() int {
	return http.StatusFailedDependency
}

type UpgradeRequired struct {
	Message string `json:"message"`
}

func (e *UpgradeRequired) Error() string {
	return e.Message
}
func (e *UpgradeRequired) HTTPStatus() int {
	return http.StatusUpgradeRequired
}

type PreconditionRequired struct {
	Message string `json:"message"`
}

func (e *PreconditionRequired) Error() string {
	return e.Message
}
func (e *PreconditionRequired) HTTPStatus() int {
	return http.StatusPreconditionRequired
}

type TooManyRequests struct {
	Message string `json:"message"`
}

func (e *TooManyRequests) Error() string {
	return e.Message
}
func (e *TooManyRequests) HTTPStatus() int {
	return http.StatusTooManyRequests
}

type RequestHeaderFieldsTooLarge struct {
	Message string `json:"message"`
}

func (e *RequestHeaderFieldsTooLarge) Error() string {
	return e.Message
}
func (e *RequestHeaderFieldsTooLarge) HTTPStatus() int {
	return http.StatusRequestHeaderFieldsTooLarge
}

type UnavailableForLegalReasons struct {
	Message string `json:"message"`
}

func (e *UnavailableForLegalReasons) Error() string {
	return e.Message
}
func (e *UnavailableForLegalReasons) HTTPStatus() int {
	return http.StatusUnavailableForLegalReasons
}

type InternalServerError struct {
	Message string `json:"message"`
}

func (e *InternalServerError) Error() string {
	return e.Message
}
func (e *InternalServerError) HTTPStatus() int {
	return http.StatusInternalServerError
}

type NotImplemented struct {
	Message string `json:"message"`
}

func (e *NotImplemented) Error() string {
	return e.Message
}
func (e *NotImplemented) HTTPStatus() int {
	return http.StatusNotImplemented
}

type BadGateway struct {
	Message string `json:"message"`
}

func (e *BadGateway) Error() string {
	return e.Message
}
func (e *BadGateway) HTTPStatus() int {
	return http.StatusBadGateway
}

type ServiceUnavailable struct {
	Message string `json:"message"`
}

func (e *ServiceUnavailable) Error() string {
	return e.Message
}
func (e *ServiceUnavailable) HTTPStatus() int {
	return http.StatusServiceUnavailable
}

type GatewayTimeout struct {
	Message string `json:"message"`
}

func (e *GatewayTimeout) Error() string {
	return e.Message
}
func (e *GatewayTimeout) HTTPStatus() int {
	return http.StatusGatewayTimeout
}
