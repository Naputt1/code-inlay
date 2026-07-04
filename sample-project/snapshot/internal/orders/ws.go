package orders

import (
	"context"
)

type TrackOrderUsecase interface {
	Execute(ctx context.Context, read <-chan TrackOrderOrdersMessage, write chan<- TrackOrderOrdersEvent) error
}
