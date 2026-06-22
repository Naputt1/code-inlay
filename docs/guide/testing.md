# Testing

The testing system can generate mock interfaces, test scaffolds, and contract tests.

## Configuration

```ts
export default defineApp({
  options: {
    testing: {
      mocks: true, // Generate mock implementations
      scaffolds: true, // Generate test scaffolding
      contracts: true, // Generate contract tests
    },
  },
});
```

## Mocks

When `mocks: true`, the generator creates mock implementations of repository and use case interfaces using the configured framework:

```ts
testing: { mocks: true, framework: "testify" }  // testify mocks
```

## Scaffolds

Test files are generated alongside production code:

```
internal/user/
  handler.go
  handler_test.go       // Scaffolded test
  usecase.go
  usecase_test.go
  repo.go
  repo_test.go
```

## Contracts

Contract tests verify that the generated handler correctly calls the use case with the expected request shape.
