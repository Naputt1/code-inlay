package orders

import (
	"context"
	service "snapshot/internal/service"
)

type AdminListAllOrdersUsecase interface {
	Execute(ctx context.Context, input AdminListAllOrdersRequest) (AdminListAllOrdersResponse, error)
}

type CancelOrderUsecase interface {
	Execute(ctx context.Context, input CancelOrdersRequest) (CancelOrdersResponse, error)
}

type CreateOrderUsecase interface {
	Execute(ctx context.Context, entity Orders) (CreateOrdersResponse, error)
}

type GetOrderUsecase interface {
	Execute(ctx context.Context, id OrdersID) (GetOrdersResponse, error)
}

type ListOrdersUsecase interface {
	Execute(ctx context.Context, input ListOrdersRequest) (ListOrdersResponse, error)
}

type adminListAllOrdersUsecaseImpl struct {
	repo OrdersRepository
	redisSvc service.RedisService
}

type cancelOrderUsecaseImpl struct {
	repo OrdersRepository
	redisSvc service.RedisService
}

type createOrderUsecaseImpl struct {
	repo OrdersRepository
	redisSvc service.RedisService
}

type getOrderUsecaseImpl struct {
	repo OrdersRepository
	redisSvc service.RedisService
}

type listOrdersUsecaseImpl struct {
	repo OrdersRepository
	redisSvc service.RedisService
}

func NewAdminListAllOrdersUsecase(repo OrdersRepository, redisSvc service.RedisService) *adminListAllOrdersUsecaseImpl {
	if repo == nil {
		panic("OrdersRepository must not be nil")
	}
	if redisSvc == nil {
		panic("service.RedisService must not be nil")
	}
	return &adminListAllOrdersUsecaseImpl{
		repo: repo,
		redisSvc: redisSvc,
	}
}

func (uc *adminListAllOrdersUsecaseImpl) Execute(ctx context.Context, input AdminListAllOrdersRequest) (AdminListAllOrdersResponse, error) {
	// TODO: implement AdminListAllOrdersUsecase
	return AdminListAllOrdersResponse{}, nil
}

func NewCancelOrderUsecase(repo OrdersRepository, redisSvc service.RedisService) *cancelOrderUsecaseImpl {
	if repo == nil {
		panic("OrdersRepository must not be nil")
	}
	if redisSvc == nil {
		panic("service.RedisService must not be nil")
	}
	return &cancelOrderUsecaseImpl{
		repo: repo,
		redisSvc: redisSvc,
	}
}

func (uc *cancelOrderUsecaseImpl) Execute(ctx context.Context, input CancelOrdersRequest) (CancelOrdersResponse, error) {
	// TODO: implement CancelOrderUsecase
	return CancelOrdersResponse{}, nil
}

func NewCreateOrderUsecase(repo OrdersRepository, redisSvc service.RedisService) *createOrderUsecaseImpl {
	if repo == nil {
		panic("OrdersRepository must not be nil")
	}
	if redisSvc == nil {
		panic("service.RedisService must not be nil")
	}
	return &createOrderUsecaseImpl{
		repo: repo,
		redisSvc: redisSvc,
	}
}

func (uc *createOrderUsecaseImpl) Execute(ctx context.Context, entity Orders) (CreateOrdersResponse, error) {
	created, err := uc.repo.Create(ctx, entity)
	if err != nil {
		return CreateOrdersResponse{}, err
	}
	// TODO: map created to CreateOrdersResponse
	return CreateOrdersResponse{}, nil
}

func NewGetOrderUsecase(repo OrdersRepository, redisSvc service.RedisService) *getOrderUsecaseImpl {
	if repo == nil {
		panic("OrdersRepository must not be nil")
	}
	if redisSvc == nil {
		panic("service.RedisService must not be nil")
	}
	return &getOrderUsecaseImpl{
		repo: repo,
		redisSvc: redisSvc,
	}
}

func (uc *getOrderUsecaseImpl) Execute(ctx context.Context, id OrdersID) (GetOrdersResponse, error) {
	result, err := uc.repo.FindByID(ctx, id)
	if err != nil {
		return GetOrdersResponse{}, err
	}
	// TODO: map result to GetOrdersResponse
	return GetOrdersResponse{}, nil
}

func NewListOrdersUsecase(repo OrdersRepository, redisSvc service.RedisService) *listOrdersUsecaseImpl {
	if repo == nil {
		panic("OrdersRepository must not be nil")
	}
	if redisSvc == nil {
		panic("service.RedisService must not be nil")
	}
	return &listOrdersUsecaseImpl{
		repo: repo,
		redisSvc: redisSvc,
	}
}

func (uc *listOrdersUsecaseImpl) Execute(ctx context.Context, input ListOrdersRequest) (ListOrdersResponse, error) {
	// TODO: implement ListOrdersUsecase
	return ListOrdersResponse{}, nil
}
