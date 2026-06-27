package products

type CreateProductsRequest struct {
	Active   *bool                      `json:"active,omitempty" form:"active"`
	Category string                     `json:"category" form:"category" validate:"required,oneof=electronics clothing food"`
	Metadata CreateProductsBodyMetadata `json:"metadata,omitempty" form:"metadata"`
	Name     string                     `json:"name" form:"name" validate:"required,min=1,max=100"`
	Price    float64                    `json:"price" form:"price" validate:"required,gt=0"`
	Tags     []string                   `json:"tags,omitempty" form:"tags"`
}

type CreateProductsResponse struct {
	Data   CreateProductsResponseData `json:"data"`
	Status bool                       `json:"status"`
}

type CreateProductsBodyMetadata struct{}

type CreateProductsResponseData struct {
	Id    string  `json:"id"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
}

type GetProductsRequest struct {
	Id string `json:"id" form:"id" validate:"required"`
}

type GetProductsResponse struct {
	Data   GetProductsResponseData `json:"data"`
	Status bool                    `json:"status"`
}

type GetProductsResponseDataRatingsItem struct {
	Comment *string `json:"comment,omitempty"`
	Score   int32   `json:"score"`
	UserId  string  `json:"userId"`
}

type GetProductsResponseData struct {
	Category    string                               `json:"category"`
	Description *string                              `json:"description,omitempty"`
	Id          string                               `json:"id"`
	Name        string                               `json:"name"`
	Price       float64                              `json:"price"`
	Ratings     []GetProductsResponseDataRatingsItem `json:"ratings,omitempty"`
	Tags        []string                             `json:"tags,omitempty"`
}

type ListProductsRequest struct {
	Category *string `json:"category,omitempty" form:"category"`
	Limit    *int32  `json:"limit,omitempty" form:"limit"`
	Page     *int32  `json:"page,omitempty" form:"page"`
}

type ListProductsResponse struct {
	Data   []ListProductsResponseDataItem `json:"data"`
	Status bool                           `json:"status"`
}

type ListProductsResponseDataItem struct {
	Category string  `json:"category"`
	Id       string  `json:"id"`
	Name     string  `json:"name"`
	Price    float64 `json:"price"`
}

type RemoveProductsRequest struct {
	Id     string  `json:"id" form:"id" validate:"required"`
	Reason *string `json:"reason,omitempty" form:"reason"`
}

type RemoveProductsResponse struct {
	Data   RemoveProductsResponseData `json:"data"`
	Status bool                       `json:"status"`
}

type RemoveProductsResponseData struct{}

type UpdateProductsRequest struct {
	Active   *bool                      `json:"active,omitempty" form:"active"`
	Category *string                    `json:"category,omitempty" form:"category" validate:"oneof=electronics clothing food"`
	Id       string                     `json:"id" form:"id" validate:"required"`
	Metadata UpdateProductsBodyMetadata `json:"metadata,omitempty" form:"metadata"`
	Name     *string                    `json:"name,omitempty" form:"name" validate:"min=1,max=100"`
	Price    *float64                   `json:"price,omitempty" form:"price" validate:"gt=0"`
	Tags     []string                   `json:"tags,omitempty" form:"tags"`
}

type UpdateProductsResponse struct {
	Data   UpdateProductsResponseData `json:"data"`
	Status bool                       `json:"status"`
}

type UpdateProductsBodyMetadata struct{}

type UpdateProductsResponseData struct{}
