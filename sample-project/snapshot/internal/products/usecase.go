package products

import (
	"context"
)

type CreateUsecase interface {
	Execute(ctx context.Context, entity Products) (CreateProductsResponse, error)
}

type GetUsecase interface {
	Execute(ctx context.Context, id ProductsID) (GetProductsResponse, error)
}

type ListUsecase interface {
	Execute(ctx context.Context, input ListProductsRequest) (ListProductsResponse, error)
}

type RemoveUsecase interface {
	Execute(ctx context.Context, id ProductsID) (RemoveProductsResponse, error)
}

type UpdateUsecase interface {
	Execute(ctx context.Context, id ProductsID, entity Products) (UpdateProductsResponse, error)
}

type createUsecaseImpl struct {
	repo ProductsRepository
}

type getUsecaseImpl struct {
	repo ProductsRepository
}

type listUsecaseImpl struct {
	repo ProductsRepository
}

type removeUsecaseImpl struct {
	repo ProductsRepository
}

type updateUsecaseImpl struct {
	repo ProductsRepository
}

func NewCreateUsecase(repo ProductsRepository) *createUsecaseImpl {
	return &createUsecaseImpl{
		repo: repo,
	}
}

func (uc *createUsecaseImpl) Execute(ctx context.Context, entity Products) (CreateProductsResponse, error) {
	created, err := uc.repo.Create(ctx, entity)
	if err != nil {
		return CreateProductsResponse{}, err
	}
	// @gen:start 0a953e62
	// TODO: map created to CreateProductsResponse
	_ = created
	var resp CreateProductsResponse
	// @gen:end 0a953e62
	return resp, nil
}

func NewGetUsecase(repo ProductsRepository) *getUsecaseImpl {
	return &getUsecaseImpl{
		repo: repo,
	}
}

func (uc *getUsecaseImpl) Execute(ctx context.Context, id ProductsID) (GetProductsResponse, error) {
	result, err := uc.repo.FindByID(ctx, id)
	if err != nil {
		return GetProductsResponse{}, err
	}
	// @gen:start 7699992e
	// TODO: map result to GetProductsResponse
	_ = result
	var resp GetProductsResponse
	// @gen:end 7699992e
	return resp, nil
}

func NewListUsecase(repo ProductsRepository) *listUsecaseImpl {
	return &listUsecaseImpl{
		repo: repo,
	}
}

func (uc *listUsecaseImpl) Execute(ctx context.Context, input ListProductsRequest) (ListProductsResponse, error) {
	// TODO: implement ListUsecase
	return ListProductsResponse{}, nil
}

func NewRemoveUsecase(repo ProductsRepository) *removeUsecaseImpl {
	return &removeUsecaseImpl{
		repo: repo,
	}
}

func (uc *removeUsecaseImpl) Execute(ctx context.Context, id ProductsID) (RemoveProductsResponse, error) {
	if err := uc.repo.Delete(ctx, id); err != nil {
		return RemoveProductsResponse{}, err
	}
	return RemoveProductsResponse{}, nil
}

func NewUpdateUsecase(repo ProductsRepository) *updateUsecaseImpl {
	return &updateUsecaseImpl{
		repo: repo,
	}
}

func (uc *updateUsecaseImpl) Execute(ctx context.Context, id ProductsID, entity Products) (UpdateProductsResponse, error) {
	updated, err := uc.repo.Update(ctx, id, entity)
	if err != nil {
		return UpdateProductsResponse{}, err
	}
	// @gen:start cd6f32b2
	// TODO: map updated to UpdateProductsResponse
	_ = updated
	var resp UpdateProductsResponse
	// @gen:end cd6f32b2
	return resp, nil
}
