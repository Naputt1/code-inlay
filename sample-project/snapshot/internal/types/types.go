package types

type Address struct {
	City    string  `json:"city"`
	Country *string `json:"country,omitempty"`
	Street  string  `json:"street"`
	ZipCode string  `json:"zipCode"`
}
