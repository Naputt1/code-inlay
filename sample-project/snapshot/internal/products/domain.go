package products

type ProductsID string

type Products struct {
	Id    string  `json:"id"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
}

type ProductsList struct {
	Category string  `json:"category"`
	Id       string  `json:"id"`
	Name     string  `json:"name"`
	Price    float64 `json:"price"`
}

type ProductsGet struct {
	Category    string                `json:"category"`
	Description *string               `json:"description,omitempty"`
	Id          string                `json:"id"`
	Name        string                `json:"name"`
	Price       float64               `json:"price"`
	Ratings     []ProductsRatingsItem `json:"ratings,omitempty"`
	Tags        []string              `json:"tags,omitempty"`
}

type ProductsRatingsItem struct {
	Comment *string `json:"comment,omitempty"`
	Score   int32   `json:"score"`
	UserId  string  `json:"userId"`
}
