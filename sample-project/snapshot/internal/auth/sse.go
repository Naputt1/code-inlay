package auth

import (
	"context"
)

type StreamAuthEventsUsecase interface {
	Execute(ctx context.Context, events chan<- StreamAuthEventsAuthEvent) error
}
