package runtime

import "context"

// runtimeContext is a concrete implementation of Context.
type runtimeContext struct {
	context.Context
	logger    Logger
	requestID string
	params    map[string]string
}

// NewContext creates a new Context with the given logger.
func NewContext(ctx context.Context, logger Logger) Context {
	return &runtimeContext{
		Context: ctx,
		logger:  logger,
	}
}

func (c *runtimeContext) Logger() Logger           { return c.logger }
func (c *runtimeContext) RequestID() string        { return c.requestID }
func (c *runtimeContext) Param(name string) string { return c.params[name] }
