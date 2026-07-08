package runtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/gin-gonic/gin"
)

// RequestContextMiddleware enriches the request context with request_id, route, and method.
// It also logs an access log entry with duration and status when the request completes.
func RequestContextMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		reqID := generateRequestID()
		ctx := c.Request.Context()
		ctx = context.WithValue(ctx, ctxKeyRequestID, reqID)
		ctx = context.WithValue(ctx, ctxKeyRoute, c.FullPath())
		ctx = context.WithValue(ctx, ctxKeyMethod, c.Request.Method)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
		CtxLogger(ctx).Info("request completed", "status", c.Writer.Status(), "duration_ms", time.Since(start).Milliseconds())
	}
}

func generateRequestID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
