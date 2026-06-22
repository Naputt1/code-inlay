# Plugin System

The plugin system allows extending the code generator with custom architectures, transformers, validators, adapters, and targets.

## Plugin types

| Type         | Interface            | Purpose                       |
| ------------ | -------------------- | ----------------------------- |
| Architecture | `ArchitecturePlugin` | Custom code structure         |
| Adapter      | `AdapterPlugin`      | Custom HTTP/router framework  |
| Transformer  | `AstTransformer`     | Modify the AST before codegen |
| Validator    | `ValidatorPlugin`    | Validate the AST              |
| Target       | `CodeTarget`         | Additional output formats     |

## Pipeline stages

Plugins hook into the compilation pipeline:

```
preTransform → architecture → adapter → codegen → postTransform → target → validate
```

## Transformers

Transformers can modify the AST at any stage:

```ts
const addHeader = defineTransformer({
  name: "add-header",
  hooks: [{
    stage: "postTransform",
    order: 10,
    run(ctx, ast) {
      // Modify the AST
      return { op: "replaceAst", ast: { ...ast, annotations: { ... } } };
    },
  }],
  transform(ast) { return ast; },
});
```

## Custom target

Generate additional output formats:

```ts
const grpcTarget = defineTarget({
  name: "grpc",
  stage: "postTransform",
  async generate(ctx) {
    // Generate .proto files from the AST
    return [{ path: "api/service.proto", regions: [...] }];
  },
});
```

## Package plugins

Plugins can be distributed as npm packages:

```ts
export default defineApp({
  plugins: [
    definePlugin({
      name: "@scope/my-plugin",
      version: "1.0.0",
      apiVersion: "2",
      architectures: [myArchitecture],
      transformers: [myTransformer],
    }),
  ],
});
```
