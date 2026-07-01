package service

type RedisService interface {
	Close() error
}

type redisServiceImpl struct {

}

func NewRedisService() (*redisServiceImpl, error) {
	return &redisServiceImpl{}, nil
}

func (s *redisServiceImpl) Close() error {
	return nil
}
