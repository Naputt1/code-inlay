package auth

import (
	"context"
)

type LoginUsecase interface {
	Execute(ctx context.Context, input LoginAuthRequest) (LoginAuthResponse, error)
}

type LogoutUsecase interface {
	Execute(ctx context.Context, input struct{}) (LogoutAuthResponse, error)
}

type RegisterUsecase interface {
	Execute(ctx context.Context, input RegisterAuthRequest) (RegisterAuthResponse, error)
}

type loginUsecaseImpl struct {
	repo AuthRepository
}

type logoutUsecaseImpl struct {
	repo AuthRepository
}

type registerUsecaseImpl struct {
	repo AuthRepository
}

func NewLoginUsecase(repo AuthRepository) *loginUsecaseImpl {
	return &loginUsecaseImpl{
		repo: repo,
	}
}

func (uc *loginUsecaseImpl) Execute(ctx context.Context, input LoginAuthRequest) (LoginAuthResponse, error) {
	// TODO: implement LoginUsecase
	return LoginAuthResponse{}, nil
}

func NewLogoutUsecase(repo AuthRepository) *logoutUsecaseImpl {
	return &logoutUsecaseImpl{
		repo: repo,
	}
}

func (uc *logoutUsecaseImpl) Execute(ctx context.Context, input struct{}) (LogoutAuthResponse, error) {
	// TODO: implement LogoutUsecase
	return LogoutAuthResponse{}, nil
}

func NewRegisterUsecase(repo AuthRepository) *registerUsecaseImpl {
	return &registerUsecaseImpl{
		repo: repo,
	}
}

func (uc *registerUsecaseImpl) Execute(ctx context.Context, input RegisterAuthRequest) (RegisterAuthResponse, error) {
	// TODO: implement RegisterUsecase
	return RegisterAuthResponse{}, nil
}
