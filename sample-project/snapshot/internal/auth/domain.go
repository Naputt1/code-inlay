package auth

type AuthID string

type Auth struct {
	Token string   `json:"token"`
	User  AuthUser `json:"user"`
}

type AuthRegister struct {
	CreatedAt string `json:"createdAt"`
	Email     string `json:"email"`
	Id        string `json:"id"`
	Name      string `json:"name"`
}

type AuthUser struct {
	Email string   `json:"email"`
	Id    string   `json:"id"`
	Name  string   `json:"name"`
	Roles []string `json:"roles"`
}
