package service

import (
	"gorm.io/gorm"
)

type MygormService interface {
	DB() *gorm.DB
	Close() error
}

type mygormServiceImpl struct {
}

func NewMygormService() (*mygormServiceImpl, error) {
	return &mygormServiceImpl{}, nil
}

func (s *mygormServiceImpl) Close() error {
	return nil
}

func (s *mygormServiceImpl) DB() *gorm.DB {
	// TODO: return initialized *gorm.DB
	return nil
}
