# check

Dry-run generation and exit with code 1 if any files would change.

```sh
backend-gen check [options]
```

Useful for CI pipelines to ensure generated code is up to date.

## Options

Same as [generate](/cli/generate).

## Exit codes

| Code | Meaning                               |
| ---- | ------------------------------------- |
| `0`  | No changes needed                     |
| `1`  | Changes detected or compilation error |
