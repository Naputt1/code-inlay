package orders

type OrdersRepository interface {
	Create(ctx context.Context, entity Orders) (Orders, error)
	FindAll(ctx context.Context) ([]Orders, error)
	FindByID(ctx context.Context, id OrdersID) (Orders, error)
}

type ordersRepositoryImpl struct {
	db *gorm.DB
}

func NewOrdersRepository(db *gorm.DB) *ordersRepositoryImpl {
	return &ordersRepositoryImpl{db: db}
}

func (r *ordersRepositoryImpl) Create(ctx context.Context, entity Orders) (Orders, error) {
	// TODO: implement Create
	return Orders{}, nil
}

func (r *ordersRepositoryImpl) FindAll(ctx context.Context) ([]Orders, error) {
	// TODO: implement FindAll
	return nil, nil
}

func (r *ordersRepositoryImpl) FindByID(ctx context.Context, id OrdersID) (Orders, error) {
	// TODO: implement FindByID
	return Orders{}, nil
}
