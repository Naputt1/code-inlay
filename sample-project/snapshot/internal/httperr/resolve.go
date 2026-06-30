package httperr

import (
	"errors"
	"net/http"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

func ResolveBindingError(err error) (int, any) {
	var ve validator.ValidationErrors
	if errors.As(err, &ve) {
		return http.StatusUnprocessableEntity, map[string]any{
					"message": "validation failed",
					"errors": func() any {
						items := make([]any, 0, len(ve))
						for _, fe := range ve {
							items = append(items, map[string]any{
								"field": fe.Field(),
								"rule": fe.Tag(),
							})
						}
						return items
					}(),
				}
	}
	return http.StatusBadRequest, gin.H{"error": err.Error()}
}
