import * as go from "@schemago/go-ast";
import type { AppAst, RouteAst, RouteLikeAst } from "../types/index.js";
import { pascalCase } from "../utils/naming.js";

function buildRouteLit(route: RouteLikeAst): go.CompositeLit {
  const kvs: go.KeyValueExpr[] = [];
  kvs.push(go.kv("ID", go.str(route.id)));

  if (route.kind === "Route") {
    kvs.push(go.kv("Method", go.str(route.method)));
  } else {
    kvs.push(go.kv("Method", go.str(route.kind === "SSE" ? "SSE" : "WS")));
  }

  kvs.push(go.kv("Path", go.str(route.fullPath)));
  kvs.push(go.kv("Handler", go.str(route.handlerName)));
  kvs.push(go.kv("Module", go.str(route.moduleName)));

  if (route.kind === "Route") {
    if (route.query || route.body) {
      kvs.push(
        go.kv("Input", go.str(`${pascalCase(route.id)}${pascalCase(route.moduleName)}Request`)),
      );
    }
    if (route.response) {
      kvs.push(
        go.kv("Response", go.str(`${pascalCase(route.id)}${pascalCase(route.moduleName)}Response`)),
      );
    }
  }

  return go.elt(go.id("RouteInfo"), ...kvs);
}

export function generateRegistryGo(ast: AppAst, _moduleInfos?: Map<string, string[]>): string {
  const version = (ast.options.targetOptions?.["metadata"]?.version as string) ?? "1.0.0";
  const generatedAt = new Date().toISOString();

  const routeInfoFields = [
    go.field(["ID"], go.id("string"), go.tag({ json: "id" })),
    go.field(["Method"], go.id("string"), go.tag({ json: "method" })),
    go.field(["Path"], go.id("string"), go.tag({ json: "path" })),
    go.field(["Handler"], go.id("string"), go.tag({ json: "handler" })),
    go.field(["Module"], go.id("string"), go.tag({ json: "module" })),
    go.field(["Input"], go.id("string"), go.tag({ json: "input,omitempty" })),
    go.field(["Response"], go.id("string"), go.tag({ json: "response,omitempty" })),
  ];

  const moduleElts: go.CompositeLit[] = [];
  for (const module of ast.modules) {
    const routeElts = module.routes.map(buildRouteLit);
    const routeSlice: go.CompositeLit = {
      kind: "CompositeLit",
      type: go.sliceType(go.id("RouteInfo")),
      elts: routeElts,
      incomplete: true,
    };
    moduleElts.push(
      go.elt(go.id("ModuleInfo"), go.kv("Name", go.str(module.name)), go.kv("Routes", routeSlice)),
    );
  }

  const modulesValue: go.CompositeLit = {
    kind: "CompositeLit",
    type: go.sliceType(go.id("ModuleInfo")),
    elts: moduleElts,
    incomplete: true,
  };

  const registryStructType = go.structType(
    go.field(["Modules"], go.sliceType(go.id("ModuleInfo")), go.tag({ json: "modules" })),
    go.field(["Version"], go.id("string"), go.tag({ json: "version" })),
    go.field(["GeneratedAt"], go.id("string"), go.tag({ json: "generatedAt" })),
  );

  const registryValue = go.elt(
    registryStructType,
    go.kv("Version", go.str(version)),
    go.kv("GeneratedAt", go.str(generatedAt)),
    go.kv("Modules", modulesValue),
  );

  const routeInfoSpec = go.typeSpec("RouteInfo", go.structType(...routeInfoFields));
  const moduleInfoSpec = go.typeSpec(
    "ModuleInfo",
    go.structType(
      go.field(["Name"], go.id("string"), go.tag({ json: "name" })),
      go.field(["Routes"], go.sliceType(go.id("RouteInfo")), go.tag({ json: "routes" })),
    ),
  );
  const registrySpec = go.valueSpec(["Registry"], undefined, [registryValue]);
  const registryDecl = go.genDecl("var", registrySpec);

  const file = go.file(
    "metadata",
    go.genDecl("type", routeInfoSpec),
    go.genDecl("type", moduleInfoSpec),
    registryDecl,
  );

  return go.printFile(file);
}

function buildSchemaMap(schema: unknown): go.CompositeLit {
  const mapType = go.mapType(go.id("string"), go.id("any"));

  if (!schema || typeof schema !== "object") {
    return { kind: "CompositeLit", type: mapType, elts: [], incomplete: true };
  }

  const def = (schema as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  if (!def) {
    return { kind: "CompositeLit", type: mapType, elts: [], incomplete: true };
  }

  const typeName = def.typeName as string | undefined;

  switch (typeName) {
    case "ZodString":
      return go.elt(mapType, go.kv(go.str("type"), go.str("string")));
    case "ZodNumber":
      return go.elt(mapType, go.kv(go.str("type"), go.str("number")));
    case "ZodBoolean":
      return go.elt(mapType, go.kv(go.str("type"), go.str("boolean")));
    case "ZodObject": {
      const shapeFn = def.shape as (() => Record<string, unknown>) | undefined;
      if (!shapeFn) return go.elt(mapType, go.kv(go.str("type"), go.str("object")));
      const shape = shapeFn();
      const props = Object.entries(shape).map(([key, val]) =>
        go.kv(go.str(key), buildSchemaMap(val)),
      );
      return go.elt(
        mapType,
        go.kv(go.str("type"), go.str("object")),
        go.kv(go.str("properties"), go.elt(mapType, ...props)),
      );
    }
    case "ZodArray": {
      const element = ((def as Record<string, unknown>).type as unknown) ?? undefined;
      return go.elt(
        mapType,
        go.kv(go.str("type"), go.str("array")),
        go.kv(go.str("items"), buildSchemaMap(element)),
      );
    }
    default:
      return go.elt(mapType, go.kv(go.str("type"), go.str("unknown")));
  }
}

export function generateSchemaReflection(route: RouteAst | RouteLikeAst): string {
  if (route.kind !== "Route") return "";

  const sb = new go.StringBuilder();
  let first = true;

  const writeMethod = (typeName: string, schema: unknown) => {
    if (!first) sb.push("\n");
    first = false;

    const recv = go.field([], go.id(typeName));
    const returnType = go.mapType(go.id("string"), go.id("any"));
    const returnExpr = buildSchemaMap(schema);
    const body = go.block(go.return_(returnExpr));
    const results = [go.field([], returnType)];
    const decl = go.method(recv, "SchemaReflection", [], results, body);
    go.printDeclaration(sb, decl, 0);
  };

  if (route.query) {
    writeMethod(`${pascalCase(route.id)}${pascalCase(route.moduleName)}Query`, route.query);
  }
  if (route.body) {
    writeMethod(`${pascalCase(route.id)}${pascalCase(route.moduleName)}Body`, route.body);
  }
  if (route.query || route.body) {
    writeMethod(
      `${pascalCase(route.id)}${pascalCase(route.moduleName)}Request`,
      route.body ?? route.query,
    );
  }
  if (route.response) {
    writeMethod(`${pascalCase(route.id)}${pascalCase(route.moduleName)}Response`, route.response);
  }

  return sb.toString();
}
