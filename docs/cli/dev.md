# dev / watch

Watch mode with live-regeneration on file changes.

```sh
backend-gen dev [options]
# or
backend-gen watch [options]
```

The dev command watches `backend.config.ts` and all plugin files for changes. When a change is detected, it re-runs the compilation and updates generated files.

## Options

Same as [generate](/cli/generate).

## Example

```sh
backend-gen dev
```
