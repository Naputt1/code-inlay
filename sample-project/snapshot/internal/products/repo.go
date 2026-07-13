package products

import (
	"context"

	"gorm.io/gorm"
)

type ProductsRepository interface {
	Create(ctx context.Context, entity Products) (Products, error)
	FindAll(ctx context.Context) ([]Products, error)
	FindByID(ctx context.Context, id ProductsID) (Products, error)
	Update(ctx context.Context, id ProductsID, entity Products) (Products, error)
	Delete(ctx context.Context, id ProductsID) error
}

type productsRepositoryImpl struct {
	db *gorm.DB
}

func NewProductsRepository(db *gorm.DB) *productsRepositoryImpl {
	return &productsRepositoryImpl{db: db}
}

func (r *productsRepositoryImpl) Create(ctx context.Context, entity Products) (Products, error) {
	// TODO: implement Create
	return Products{}, nil
}

func (r *productsRepositoryImpl) Delete(ctx context.Context, id ProductsID) error {
	// TODO: implement Delete
	return nil
}

func (r *productsRepositoryImpl) FindAll(ctx context.Context) ([]Products, error) {
	// TODO: implement FindAll
	return nil, nil
}

func (r *productsRepositoryImpl) FindByID(ctx context.Context, id ProductsID) (Products, error) {
	// TODO: implement FindByID
	return Products{}, nil
}

func (r *productsRepositoryImpl) Update(ctx context.Context, id ProductsID, entity Products) (Products, error) {
	// TODO: implement Update
	return Products{}, nil
}
