# diff

Show pending changes without writing to disk.

```sh
schemago diff [options]
```

Each change is shown as a unified diff of the affected regions.

## Options

Same as [generate](/cli/generate).

## Example output

```diff
--- internal/user/handler.go
+++ internal/user/handler.go
@@ -1,5 +1,5 @@
 // @gen:start user.create.handler
-func (h *UserHandler) CreateUser(c *gin.Context) {
+func (h *UserHandler) CreateUser(c *gin.Context) {
     var input CreateUserRequest
     if err := c.ShouldBindJSON(&input); err != nil {
```
