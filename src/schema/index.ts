import type { Diagnostic, ResponseFormat, RouteAst, SchemaLike } from "../types/index.js";
import { extractPathParams, pascalCase, routeTypeName } from "../utils/naming.js";
import {
  typeName,
  isZodOptional,
  isZodNullable,
  isZodObject,
  isZodDiscriminatedUnion,
  isZodString,
  isZodEnum,
  isZodNumber,
  isZodBoolean,
  isZodArray,
  isZodEntity,
  isZodLiteral,
  unwrap,
} from "./extras.js";

export type GoField = {
  name: string;
  type: string;
  jsonName: string;
  optional: boolean;
  validations?: string[];
};

export type GoStruct = {
  name: string;
  fields: GoField[];
};

function isZodInt32(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodInt32";
}

function isZodInt64(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodInt64";
}

function isZodFloat32(schema: SchemaLike): boolean {
  return typeName(schema) === "ZodFloat32";
}

function extractValidations(schema: SchemaLike): string[] {
  const validations: string[] = [];
  const inner = unwrap(schema);

  if (isZodString(inner)) {
    const checks = ((inner as unknown as Record<string, unknown>)._def as Record<string, unknown>)
      ?.checks as Array<{ kind: string; value?: unknown; regex?: RegExp }> | undefined;
    if (checks) {
      for (const check of checks) {
        if (check.kind === "min") validations.push(`min=${check.value}`);
        else if (check.kind === "max") validations.push(`max=${check.value}`);
        else if (check.kind === "length") validations.push(`len=${check.value}`);
        else if (check.kind === "email") validations.push("email");
        else if (check.kind === "url") validations.push("url");
        else if (check.kind === "regex") validations.push(`regex=${check.regex?.source ?? ""}`);
      }
    }
  } else if (isZodNumber(inner)) {
    const checks = ((inner as unknown as Record<string, unknown>)._def as Record<string, unknown>)
      ?.checks as Array<{ kind: string; value?: unknown; inclusive?: boolean }> | undefined;
    if (checks) {
      for (const check of checks) {
        if (check.kind === "min") {
          if (check.inclusive === false) validations.push(`gt=${check.value}`);
          else validations.push(`min=${check.value}`);
        } else if (check.kind === "max") {
          if (check.inclusive === false) validations.push(`lt=${check.value}`);
          else validations.push(`max=${check.value}`);
        }
      }
    }
  } else if (isZodEnum(inner)) {
    const values = ((inner as unknown as Record<string, unknown>)._def as Record<string, unknown>)
      ?.values as string[] | undefined;
    if (values && values.length > 0) {
      validations.push(`oneof=${values.join(" ")}`);
    }
  } else if (isZodArray(inner)) {
    const checks = ((inner as unknown as Record<string, unknown>)._def as Record<string, unknown>)
      ?.checks as Array<{ kind: string; value?: unknown }> | undefined;
    if (checks) {
      for (const check of checks) {
        if (check.kind === "min") validations.push(`min=${check.value}`);
        else if (check.kind === "max") validations.push(`max=${check.value}`);
      }
    }
  }

  return validations;
}

export function generateRouteTypes(
  route: RouteAst,
  diagnostics: Diagnostic[],
  responseFormat?: ResponseFormat,
): string {
  const structs: GoStruct[] = [];
  const subStructs = new Map<string, GoStruct>();

  const registerSub = (name: string, schema: SchemaLike) => {
    if (subStructs.has(name)) return;
    const unwrapped = unwrap(schema);
    if (!isZodObject(unwrapped)) {
      if (isZodEntity(unwrapped)) subStructs.set(name, { name, fields: [] });
      return;
    }
    const shape = unwrapped.shape;
    const fields = Object.keys(shape)
      .sort()
      .map((fieldName) => {
        const fieldSchema = shape[fieldName] as SchemaLike;
        const optional = isZodOptional(fieldSchema);
        const inner = unwrap(fieldSchema);
        if (isZodObject(inner) || isZodEntity(inner)) {
          const childName = `${name}${pascalCase(fieldName)}`;
          registerSub(childName, inner);
          if (subStructs.has(childName)) {
            return {
              name: pascalCase(fieldName),
              type: childName,
              jsonName: fieldName,
              optional,
              validations: extractValidations(fieldSchema),
            };
          }
        }
        if (isZodArray(inner)) {
          const elem = unwrap(inner.element);
          if (isZodObject(elem) || isZodEntity(elem)) {
            const childName = `${name}${pascalCase(fieldName)}Item`;
            registerSub(childName, elem);
            if (subStructs.has(childName)) {
              return {
                name: pascalCase(fieldName),
                type: `[]${childName}`,
                jsonName: fieldName,
                optional,
                validations: extractValidations(fieldSchema),
              };
            }
          }
        }
        return {
          name: pascalCase(fieldName),
          type: schemaToGoType(fieldSchema, diagnostics),
          jsonName: fieldName,
          optional,
          validations: extractValidations(fieldSchema),
        };
      });
    subStructs.set(name, { name, fields });
  };

  const processSchema = (prefix: string, schema: SchemaLike): GoStruct | undefined => {
    const unwrapped = unwrap(schema);
    if (!isZodObject(unwrapped)) return undefined;
    const shape = unwrapped.shape;
    const fields = Object.keys(shape)
      .sort()
      .map((fieldName) => {
        const fieldSchema = shape[fieldName] as SchemaLike;
        const optional = isZodOptional(fieldSchema);
        const inner = unwrap(fieldSchema);
        if (isZodObject(inner) || isZodEntity(inner)) {
          const childName = `${prefix}${pascalCase(fieldName)}`;
          registerSub(childName, inner);
          if (subStructs.has(childName)) {
            return {
              name: pascalCase(fieldName),
              type: childName,
              jsonName: fieldName,
              optional,
              validations: extractValidations(fieldSchema),
            };
          }
        }
        if (isZodArray(inner)) {
          const elem = unwrap(inner.element);
          if (isZodObject(elem) || isZodEntity(elem)) {
            const childName = `${prefix}${pascalCase(fieldName)}Item`;
            registerSub(childName, elem);
            if (subStructs.has(childName)) {
              return {
                name: pascalCase(fieldName),
                type: `[]${childName}`,
                jsonName: fieldName,
                optional,
                validations: extractValidations(fieldSchema),
              };
            }
          }
        }
        return {
          name: pascalCase(fieldName),
          type: schemaToGoType(fieldSchema, diagnostics),
          jsonName: fieldName,
          optional,
          validations: extractValidations(fieldSchema),
        };
      });
    return { name: prefix, fields };
  };

  const pathParams = extractPathParams(route.path);
  const hasQuery = !!route.query;
  const hasBody = !!route.body;

  let queryStruct: GoStruct | undefined;
  if (route.query) {
    queryStruct = processSchema(routeTypeName(route, "Query"), route.query);
  }

  let bodyStruct: GoStruct | undefined;
  if (route.body) {
    bodyStruct = processSchema(routeTypeName(route, "Body"), route.body);
  }

  if (hasQuery && hasBody) {
    if (queryStruct) {
      structs.push({ name: queryStruct.name, fields: [...queryStruct.fields] });
    }
    if (bodyStruct) {
      structs.push({ name: bodyStruct.name, fields: [...bodyStruct.fields] });
    }
    const requestFields: GoField[] = [];
    if (queryStruct) requestFields.push(...queryStruct.fields);
    if (bodyStruct) requestFields.push(...bodyStruct.fields);
    for (const param of pathParams) {
      const fieldName = pascalCase(param);
      if (!requestFields.find((f) => f.name === fieldName)) {
        requestFields.push({ name: fieldName, type: "string", jsonName: param, optional: false });
      }
    }
    requestFields.sort((a, b) => a.name.localeCompare(b.name));
    structs.push({ name: routeTypeName(route, "Request"), fields: requestFields });
  } else if (hasQuery || hasBody) {
    const source = queryStruct || bodyStruct;
    if (source) {
      for (const param of pathParams) {
        const fieldName = pascalCase(param);
        if (!source.fields.find((f) => f.name === fieldName)) {
          source.fields.push({
            name: fieldName,
            type: "string",
            jsonName: param,
            optional: false,
          });
        }
      }
      source.fields.sort((a, b) => a.name.localeCompare(b.name));
      source.name = routeTypeName(route, "Request");
      structs.push(source);
    }
  } else if (pathParams.length > 0) {
    const fields: GoField[] = pathParams.map((param) => ({
      name: pascalCase(param),
      type: "string",
      jsonName: param,
      optional: false,
    }));
    fields.sort((a, b) => a.name.localeCompare(b.name));
    structs.push({ name: routeTypeName(route, "Request"), fields });
  }

  const responseStructName = routeTypeName(route, "Response");
  const responseSchema = route.response
    ? responseFormat
      ? mergeEntityIntoWrapper(responseFormat.wrapper, route.response)
      : route.response
    : responseFormat
      ? responseFormat.wrapper
      : undefined;
  if (responseSchema) {
    const response = processSchema(responseStructName, responseSchema);
    if (response) structs.push(response);
  } else {
    structs.push({ name: responseStructName, fields: [] });
  }

  for (const sub of subStructs.values()) {
    if (!structs.find((s) => s.name === sub.name)) {
      structs.push(sub);
    }
  }

  return structs
    .map((s) =>
      renderStruct(s, s.name === responseStructName || s.name.startsWith(responseStructName)),
    )
    .join("\n\n");
}

export function generateEntityStructs(
  moduleName: string,
  routes: RouteAst[],
  diagnostics: Diagnostic[],
): string {
  const subStructs = new Map<string, GoStruct>();
  const entities: GoStruct[] = [];

  const toFingerprint = (s: SchemaLike): string => {
    const u = unwrap(s);
    if (isZodObject(u)) {
      return `{${Object.keys(u.shape)
        .sort()
        .map((k) => {
          const fs = u.shape[k] as SchemaLike;
          return `${k}:${schemaToGoType(fs, diagnostics)}`;
        })
        .join(",")}}`;
    }
    return "";
  };

  const toEntityFields = (schema: SchemaLike): GoField[] | undefined => {
    const u = unwrap(schema);
    if (!isZodObject(u)) return undefined;
    return Object.keys(u.shape)
      .sort()
      .map((fieldName) => {
        const fieldSchema = u.shape[fieldName] as SchemaLike;
        const optional = isZodOptional(fieldSchema);
        const inner = unwrap(fieldSchema);
        if (isZodObject(inner) || isZodEntity(inner)) {
          const childName = `${pascalCase(moduleName)}${pascalCase(fieldName)}`;
          registerEntitySub(childName, inner, subStructs, diagnostics, moduleName);
          return { name: pascalCase(fieldName), type: childName, jsonName: fieldName, optional };
        }
        if (isZodArray(inner)) {
          const elem = unwrap(inner.element);
          if (isZodObject(elem) || isZodEntity(elem)) {
            const childName = `${pascalCase(moduleName)}${pascalCase(fieldName)}Item`;
            registerEntitySub(childName, elem, subStructs, diagnostics, moduleName);
            return {
              name: pascalCase(fieldName),
              type: `[]${childName}`,
              jsonName: fieldName,
              optional,
            };
          }
        }
        return {
          name: pascalCase(fieldName),
          type: schemaToGoType(fieldSchema, diagnostics),
          jsonName: fieldName,
          optional,
        };
      });
  };

  const seenFingerprints = new Set<string>();
  const usedNames = new Set<string>();

  for (const route of routes) {
    if (!route.response || !route.responseFormat) continue;
    const entitySchema = extractEntitySchema(route.response);
    if (!entitySchema) continue;
    const fp = toFingerprint(entitySchema);
    if (seenFingerprints.has(fp)) continue;
    seenFingerprints.add(fp);

    const fields = toEntityFields(entitySchema);
    if (!fields) continue;

    const base = pascalCase(route.moduleName);
    const context = extractEntityContext(route.id);
    let entityName = context ? base + pascalCase(context) : base;
    if (usedNames.has(entityName)) entityName = base + pascalCase(route.id);
    if (usedNames.has(entityName)) {
      let n = 2;
      while (usedNames.has(`${entityName}${n}`)) n++;
      entityName = `${entityName}${n}`;
    }
    usedNames.add(entityName);

    entities.push({ name: entityName, fields });
  }

  const rendered = entities.map((s) => renderEntityStruct(s)).join("\n\n");
  const subRendered = [...subStructs.values()].map((s) => renderEntityStruct(s)).join("\n\n");

  return [rendered, subRendered].filter(Boolean).join("\n\n");
}

function registerEntitySub(
  name: string,
  schema: SchemaLike,
  subStructs: Map<string, GoStruct>,
  diagnostics: Diagnostic[],
  moduleName: string,
): void {
  if (subStructs.has(name)) return;
  const unwrapped = unwrap(schema);
  if (!isZodObject(unwrapped)) {
    if (isZodEntity(unwrapped)) {
      subStructs.set(name, { name, fields: [] });
    }
    return;
  }
  const shape = unwrapped.shape;
  const fields = Object.keys(shape)
    .sort()
    .map((fieldName) => {
      const fieldSchema = shape[fieldName] as SchemaLike;
      const optional = isZodOptional(fieldSchema);
      const inner = unwrap(fieldSchema);
      if (isZodObject(inner) || isZodEntity(inner)) {
        const childName = `${name}${pascalCase(fieldName)}`;
        registerEntitySub(childName, inner, subStructs, diagnostics, moduleName);
        return { name: pascalCase(fieldName), type: childName, jsonName: fieldName, optional };
      }
      if (isZodArray(inner)) {
        const elem = unwrap(inner.element);
        if (isZodObject(elem) || isZodEntity(elem)) {
          const childName = `${name}${pascalCase(fieldName)}Item`;
          registerEntitySub(childName, elem, subStructs, diagnostics, moduleName);
          return {
            name: pascalCase(fieldName),
            type: `[]${childName}`,
            jsonName: fieldName,
            optional,
          };
        }
      }
      return {
        name: pascalCase(fieldName),
        type: schemaToGoType(fieldSchema, diagnostics),
        jsonName: fieldName,
        optional,
      };
    });
  subStructs.set(name, { name, fields });
}

function extractEntitySchema(schema: SchemaLike): SchemaLike | undefined {
  const u = unwrap(schema);
  if (isZodObject(u)) return u;
  if (isZodArray(u)) {
    const elem = unwrap(u.element);
    if (isZodObject(elem)) return elem;
  }
  return undefined;
}

export function extractEntityContext(routeId: string): string {
  const verbs = [
    "list",
    "get",
    "create",
    "update",
    "delete",
    "set",
    "edit",
    "new",
    "adminlist",
    "adminget",
    "admincreate",
    "adminupdate",
    "admindelete",
    "adminset",
    "admin",
  ];
  const lower = routeId.toLowerCase();
  for (const verb of verbs) {
    if (lower.endsWith(verb)) {
      const stripped = routeId.slice(0, -verb.length);
      if (stripped) return stripped;
    }
  }
  return "";
}

export function mergeEntityIntoWrapper(
  wrapperSchema: SchemaLike,
  entitySchema: SchemaLike,
): SchemaLike {
  return replaceEntity(wrapperSchema, entitySchema);
}

function replaceEntity(schema: SchemaLike, entitySchema: SchemaLike): SchemaLike {
  const inner = unwrap(schema);
  if (isZodEntity(inner)) return entitySchema;
  if (isZodObject(inner)) {
    const shape = inner.shape;
    const newShape: Record<string, SchemaLike> = {};
    for (const key of Object.keys(shape)) {
      newShape[key] = replaceEntity(shape[key], entitySchema);
    }
    return {
      ...inner,
      _def: { ...(inner._def as unknown as Record<string, unknown>), shape: () => newShape },
      shape: newShape,
    } as unknown as SchemaLike;
  }
  if (isZodArray(inner)) {
    const newElement = replaceEntity(inner.element, entitySchema);
    return {
      ...inner,
      _def: { ...(inner._def as unknown as Record<string, unknown>), type: newElement },
      element: newElement,
    } as unknown as SchemaLike;
  }
  return schema;
}

export function requestType(route: RouteAst): string {
  if (route.query || route.body || extractPathParams(route.path).length > 0) {
    return routeTypeName(route, "Request");
  }
  return "struct{}";
}

export function responseType(route: RouteAst): string {
  return routeTypeName(route, "Response");
}

function schemaToGoType(schema: SchemaLike, diagnostics: Diagnostic[]): string {
  const optional = isZodOptional(schema);
  const nullable = isZodNullable(schema);
  const unwrapped = unwrap(schema);
  let type: string;

  if (isZodString(unwrapped) || isZodEnum(unwrapped) || isZodLiteral(unwrapped)) {
    type = "string";
  } else if (isZodInt32(unwrapped)) {
    type = "int32";
  } else if (isZodInt64(unwrapped)) {
    type = "int64";
  } else if (isZodFloat32(unwrapped)) {
    type = "float32";
  } else if (isZodNumber(unwrapped)) {
    const checks = (
      (unwrapped as unknown as Record<string, unknown>)._def as Record<string, unknown>
    )?.checks as Array<{ kind: string }> | undefined;
    type = numberType(checks);
  } else if (isZodBoolean(unwrapped)) {
    type = "bool";
  } else if (isZodArray(unwrapped)) {
    type = `[]${schemaToGoType(unwrapped.element, diagnostics)}`;
  } else if (isZodObject(unwrapped)) {
    type = "any";
  } else if (isZodEntity(unwrapped)) {
    type = "any";
  } else {
    type = "any";
    diagnostics.push({
      level: "error",
      code: "unsupported-schema",
      message: `Unsupported Zod schema kind "${typeName(unwrapped)}".`,
    });
  }

  if ((optional || nullable) && !/^\**\[/.test(type)) {
    return `*${type}`;
  }
  return type;
}

function renderEntityStruct(goStruct: GoStruct): string {
  if (goStruct.fields.length === 0) {
    return `type ${goStruct.name} struct{}`;
  }
  const fields = goStruct.fields
    .map((field) => {
      const omitempty = field.optional ? ",omitempty" : "";
      return `\t${field.name} ${field.type} \`json:"${field.jsonName}${omitempty}"\``;
    })
    .join("\n");
  return `type ${goStruct.name} struct {\n${fields}\n}`;
}

function renderStruct(goStruct: GoStruct, responseContext: boolean = false): string {
  if (goStruct.fields.length === 0) {
    return `type ${goStruct.name} struct{}`;
  }

  const fields = goStruct.fields
    .map((field) => {
      const omitempty = field.optional ? ",omitempty" : "";
      const validateParts: string[] = [];
      if (!responseContext) {
        if (!field.optional) validateParts.push("required");
        if (field.validations) validateParts.push(...field.validations);
      }
      const validateTag = validateParts.length > 0 ? ` validate:"${validateParts.join(",")}"` : "";
      const tag = responseContext
        ? `json:"${field.jsonName}${omitempty}"`
        : `json:"${field.jsonName}${omitempty}" form:"${field.jsonName}"${validateTag}`;
      return `\t${field.name} ${field.type} \`${tag}\``;
    })
    .join("\n");

  return `type ${goStruct.name} struct {\n${fields}\n}`;
}

export function generateNamedStructs(
  name: string,
  schema: SchemaLike,
  diagnostics: Diagnostic[],
): string {
  const du = isZodDiscriminatedUnion(schema) ? schema._def : null;
  if (du) {
    const allFields = new Map<string, { schema: SchemaLike; appearsInAll: boolean }>();
    const variantCount = du.options.length;
    for (const option of du.options) {
      const unwrapped = unwrap(option);
      if (isZodObject(unwrapped)) {
        for (const [fieldName, fieldSchema] of Object.entries(unwrapped.shape)) {
          const existing = allFields.get(fieldName);
          if (existing) {
            // field already registered from another variant
          } else {
            allFields.set(fieldName, {
              schema: fieldSchema as SchemaLike,
              appearsInAll: variantCount === 1,
            });
          }
        }
      }
    }
    // Mark fields not in all variants as optional
    for (const [fieldName, entry] of allFields) {
      entry.appearsInAll = [...du.options].every((opt) => {
        const u = unwrap(opt);
        return isZodObject(u) && fieldName in u.shape;
      });
    }
    const structName = name;
    const fields: GoField[] = [];
    const subStructs = new Map<string, GoStruct>();
    const registerSub = (subName: string, subSchema: SchemaLike) => {
      if (subStructs.has(subName)) return;
      const sw = unwrap(subSchema);
      if (!isZodObject(sw)) return;
      const shape = sw.shape;
      const flds = Object.keys(shape)
        .sort()
        .map((fn) => {
          const fs = shape[fn] as SchemaLike;
          const opt = isZodOptional(fs);
          const inner = unwrap(fs);
          if (isZodObject(inner)) {
            const childName = `${subName}${pascalCase(fn)}`;
            registerSub(childName, inner);
            return {
              name: pascalCase(fn),
              type: childName,
              jsonName: fn,
              optional: opt,
              validations: extractValidations(fs),
            } as GoField;
          }
          if (isZodArray(inner)) {
            const elem = unwrap(inner.element);
            if (isZodObject(elem)) {
              const childName = `${subName}${pascalCase(fn)}Item`;
              registerSub(childName, elem);
              return {
                name: pascalCase(fn),
                type: `[]${childName}`,
                jsonName: fn,
                optional: opt,
                validations: extractValidations(fs),
              } as GoField;
            }
          }
          return {
            name: pascalCase(fn),
            type: schemaToGoType(fs, diagnostics),
            jsonName: fn,
            optional: opt,
            validations: extractValidations(fs),
          } as GoField;
        });
      subStructs.set(subName, { name: subName, fields: flds });
    };
    for (const [fieldName, entry] of allFields) {
      const inner = unwrap(entry.schema);
      if (isZodObject(inner)) {
        const childName = `${structName}${pascalCase(fieldName)}`;
        registerSub(childName, inner);
        fields.push({
          name: pascalCase(fieldName),
          type: childName,
          jsonName: fieldName,
          optional: !entry.appearsInAll,
          validations: extractValidations(entry.schema),
        });
      } else if (isZodArray(inner)) {
        const elem = unwrap(inner.element);
        if (isZodObject(elem)) {
          const childName = `${structName}${pascalCase(fieldName)}Item`;
          registerSub(childName, elem);
          fields.push({
            name: pascalCase(fieldName),
            type: `[]${childName}`,
            jsonName: fieldName,
            optional: !entry.appearsInAll,
            validations: extractValidations(entry.schema),
          });
        } else {
          fields.push({
            name: pascalCase(fieldName),
            type: schemaToGoType(entry.schema, diagnostics),
            jsonName: fieldName,
            optional: !entry.appearsInAll,
            validations: extractValidations(entry.schema),
          });
        }
      } else {
        fields.push({
          name: pascalCase(fieldName),
          type: schemaToGoType(entry.schema, diagnostics),
          jsonName: fieldName,
          optional: !entry.appearsInAll,
          validations: extractValidations(entry.schema),
        });
      }
    }
    fields.sort((a, b) => a.name.localeCompare(b.name));
    const main: GoStruct = { name: structName, fields };
    const structs: GoStruct[] = [main];
    for (const sub of subStructs.values()) {
      if (!structs.find((s) => s.name === sub.name)) structs.push(sub);
    }
    return structs.map((s) => renderStruct(s)).join("\n\n");
  }
  const subStructs = new Map<string, GoStruct>();

  const registerSub = (subName: string, subSchema: SchemaLike) => {
    if (subStructs.has(subName)) return;
    const unwrapped = unwrap(subSchema);
    if (!isZodObject(unwrapped)) return;
    const shape = unwrapped.shape;
    const fields = Object.keys(shape)
      .sort()
      .map((fieldName) => {
        const fieldSchema = shape[fieldName] as SchemaLike;
        const optional = isZodOptional(fieldSchema);
        const inner = unwrap(fieldSchema);
        if (isZodObject(inner)) {
          const childName = `${subName}${pascalCase(fieldName)}`;
          registerSub(childName, inner);
          return {
            name: pascalCase(fieldName),
            type: childName,
            jsonName: fieldName,
            optional,
            validations: extractValidations(fieldSchema),
          } as GoField;
        }
        if (isZodArray(inner)) {
          const elem = unwrap(inner.element);
          if (isZodObject(elem)) {
            const childName = `${subName}${pascalCase(fieldName)}Item`;
            registerSub(childName, elem);
            return {
              name: pascalCase(fieldName),
              type: `[]${childName}`,
              jsonName: fieldName,
              optional,
              validations: extractValidations(fieldSchema),
            } as GoField;
          }
        }
        return {
          name: pascalCase(fieldName),
          type: schemaToGoType(fieldSchema, diagnostics),
          jsonName: fieldName,
          optional,
          validations: extractValidations(fieldSchema),
        } as GoField;
      });
    subStructs.set(subName, { name: subName, fields });
  };

  const main = processSchema(name, schema, subStructs, registerSub, diagnostics);
  const structs: GoStruct[] = [];
  if (main) structs.push(main);
  for (const sub of subStructs.values()) {
    if (!structs.find((s) => s.name === sub.name)) {
      structs.push(sub);
    }
  }
  return structs.map((s) => renderStruct(s)).join("\n\n");
}

function processSchema(
  prefix: string,
  schema: SchemaLike,
  subStructs: Map<string, GoStruct>,
  registerSub: (name: string, schema: SchemaLike) => void,
  diagnostics?: Diagnostic[],
): GoStruct | undefined {
  const unwrapped = unwrap(schema);
  if (!isZodObject(unwrapped)) return undefined;
  const shape = unwrapped.shape;
  const fields = Object.keys(shape)
    .sort()
    .map((fieldName) => {
      const fieldSchema = shape[fieldName] as SchemaLike;
      const optional = isZodOptional(fieldSchema);
      const inner = unwrap(fieldSchema);
      if (isZodObject(inner)) {
        const childName = `${prefix}${pascalCase(fieldName)}`;
        registerSub(childName, inner);
        return {
          name: pascalCase(fieldName),
          type: childName,
          jsonName: fieldName,
          optional,
          validations: extractValidations(fieldSchema),
        } as GoField;
      }
      if (isZodArray(inner)) {
        const elem = unwrap(inner.element);
        if (isZodObject(elem)) {
          const childName = `${prefix}${pascalCase(fieldName)}Item`;
          registerSub(childName, elem);
          return {
            name: pascalCase(fieldName),
            type: `[]${childName}`,
            jsonName: fieldName,
            optional,
            validations: extractValidations(fieldSchema),
          } as GoField;
        }
      }
      return {
        name: pascalCase(fieldName),
        type: schemaToGoType(fieldSchema, diagnostics ?? []),
        jsonName: fieldName,
        optional,
        validations: extractValidations(fieldSchema),
      } as GoField;
    });
  return { name: prefix, fields };
}

function numberType(checks: Array<{ kind: string }> | undefined): string {
  if (!checks) return "float64";
  const has = (kind: string) => checks.some((c) => c.kind === kind);
  if (has("float32")) return "float32";
  if (has("float64")) return "float64";
  if (has("int32")) return "int32";
  if (has("int64")) return "int64";
  if (has("int")) return "int64";
  return "float64";
}
