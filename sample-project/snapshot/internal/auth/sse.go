package auth

import (
	"context"
)

type StreamAuthEventsUsecase interface {
	Execute(ctx context.Context, events chan<- StreamAuthEventsAuthEvent, marshal func(StreamAuthEventsAuthEvent) ([]byte, error)) error
}
