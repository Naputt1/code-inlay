package auth

type AuthRepository interface {
	// Add developer-owned persistence methods outside generated regions as needed.
}

type authRepositoryImpl struct {}

func NewAuthRepository() *authRepositoryImpl {
	return &authRepositoryImpl{}
}
