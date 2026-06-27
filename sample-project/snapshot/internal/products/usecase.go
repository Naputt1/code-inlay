package products

import (
	"context"
	service "snapshot/internal/service"
)

type CreateProductUsecase interface {
	Execute(ctx context.Context, entity Products) (CreateProductsResponse, error)
}

type GetProductUsecase interface {
	Execute(ctx context.Context, id ProductsID) (GetProductsResponse, error)
}

type ListProductsUsecase interface {
	Execute(ctx context.Context, input ListProductsRequest) (ListProductsResponse, error)
}

type RemoveProductUsecase interface {
	Execute(ctx context.Context, id ProductsID) (RemoveProductsResponse, error)
}

type UpdateProductUsecase interface {
	Execute(ctx context.Context, id ProductsID, entity Products) (UpdateProductsResponse, error)
}

type createProductUsecaseImpl struct {
	repo ProductsRepository
}

type getProductUsecaseImpl struct {
	repo ProductsRepository
}

type listProductsUsecaseImpl struct {
	repo ProductsRepository
}

type removeProductUsecaseImpl struct {
	repo ProductsRepository
}

type updateProductUsecaseImpl struct {
	repo ProductsRepository
}

func NewCreateProductUsecase(repo ProductsRepository) *createProductUsecaseImpl {
	if repo == nil {
		panic("ProductsRepository must not be nil")
	}
	return &createProductUsecaseImpl{
		repo: repo,
	}
}

func (uc *createProductUsecaseImpl) Execute(ctx context.Context, entity Products) (CreateProductsResponse, error) {
	created, err := uc.repo.Create(ctx, entity)
	if err != nil {
		return CreateProductsResponse{}, err
	}
	// @gen:start e33c9189
	// TODO: map created to CreateProductsResponse
	_ = created
	var resp CreateProductsResponse
	// @gen:end e33c9189
	return resp, nil
}

func NewGetProductUsecase(repo ProductsRepository) *getProductUsecaseImpl {
	if repo == nil {
		panic("ProductsRepository must not be nil")
	}
	return &getProductUsecaseImpl{
		repo: repo,
	}
}

func (uc *getProductUsecaseImpl) Execute(ctx context.Context, id ProductsID) (GetProductsResponse, error) {
	result, err := uc.repo.FindByID(ctx, id)
	if err != nil {
		return GetProductsResponse{}, err
	}
	// @gen:start 42f4f774
	// TODO: map result to GetProductsResponse
	_ = result
	var resp GetProductsResponse
	// @gen:end 42f4f774
	return resp, nil
}

func NewListProductsUsecase(repo ProductsRepository) *listProductsUsecaseImpl {
	if repo == nil {
		panic("ProductsRepository must not be nil")
	}
	return &listProductsUsecaseImpl{
		repo: repo,
	}
}

func (uc *listProductsUsecaseImpl) Execute(ctx context.Context, input ListProductsRequest) (ListProductsResponse, error) {
	// TODO: implement ListProductsUsecase
	return ListProductsResponse{}, nil
}

func NewRemoveProductUsecase(repo ProductsRepository) *removeProductUsecaseImpl {
	if repo == nil {
		panic("ProductsRepository must not be nil")
	}
	return &removeProductUsecaseImpl{
		repo: repo,
	}
}

func (uc *removeProductUsecaseImpl) Execute(ctx context.Context, id ProductsID) (RemoveProductsResponse, error) {
	if err := uc.repo.Delete(ctx, id); err != nil {
		return RemoveProductsResponse{}, err
	}
	return RemoveProductsResponse{}, nil
}

func NewUpdateProductUsecase(repo ProductsRepository) *updateProductUsecaseImpl {
	if repo == nil {
		panic("ProductsRepository must not be nil")
	}
	return &updateProductUsecaseImpl{
		repo: repo,
	}
}

func (uc *updateProductUsecaseImpl) Execute(ctx context.Context, id ProductsID, entity Products) (UpdateProductsResponse, error) {
	updated, err := uc.repo.Update(ctx, id, entity)
	if err != nil {
		return UpdateProductsResponse{}, err
	}
	// @gen:start a8b14139
	// TODO: map updated to UpdateProductsResponse
	_ = updated
	var resp UpdateProductsResponse
	// @gen:end a8b14139
	return resp, nil
}
