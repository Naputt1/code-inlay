package auth

type LoginAuthRequest struct {
	Email    string `json:"email" form:"email" validate:"required,email"`
	Password string `json:"password" form:"password" validate:"required,min=8"`
}

type LoginAuthResponse struct {
	Data   LoginAuthResponseData `json:"data"`
	Status bool                  `json:"status"`
}

type LoginAuthResponseDataUser struct {
	Email string   `json:"email"`
	Id    string   `json:"id"`
	Name  string   `json:"name"`
	Roles []string `json:"roles"`
}

type LoginAuthResponseData struct {
	Token string                    `json:"token"`
	User  LoginAuthResponseDataUser `json:"user"`
}

type LogoutAuthResponse struct {
	Data   LogoutAuthResponseData `json:"data"`
	Status bool                   `json:"status"`
}

type LogoutAuthResponseData struct{}

type RegisterAuthRequest struct {
	Email        string  `json:"email" form:"email" validate:"required,email"`
	Name         string  `json:"name" form:"name" validate:"required,min=2,max=50"`
	Password     string  `json:"password" form:"password" validate:"required,min=8,max=100"`
	ReferralCode *string `json:"referralCode,omitempty" form:"referralCode"`
}

type RegisterAuthResponse struct {
	Data   RegisterAuthResponseData `json:"data"`
	Status bool                     `json:"status"`
}

type RegisterAuthResponseData struct {
	CreatedAt string `json:"createdAt"`
	Email     string `json:"email"`
	Id        string `json:"id"`
	Name      string `json:"name"`
}
