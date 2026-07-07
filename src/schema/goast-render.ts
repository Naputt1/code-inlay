import * as go from "@schemago/go-ast";
import type { GoStruct, GoField } from "./index.js";

function toGoType(typeStr: string): go.Type {
  if (typeStr.startsWith("[]")) {
    return go.sliceType(toGoType(typeStr.slice(2)));
  }
  if (typeStr.startsWith("*")) {
    return go.star(toGoType(typeStr.slice(1)));
  }
  if (typeStr.startsWith("map[")) {
    const rest = typeStr.slice(4);
    const bracketIdx = rest.indexOf("]");
    if (bracketIdx !== -1) {
      const keyStr = rest.slice(0, bracketIdx);
      const valStr = rest.slice(bracketIdx + 1);
      return go.mapType(toGoType(keyStr), toGoType(valStr));
    }
  }
  if (typeStr.startsWith("...")) {
    return go.sliceType(toGoType(typeStr.slice(3)));
  }
  if (typeStr.includes(".")) {
    const parts = typeStr.split(".");
    return go.qual(parts[0], parts[1]);
  }
  return go.id(typeStr);
}

function buildTag(field: GoField, responseContext: boolean): go.Tag | undefined {
  const omitempty = field.optional ? ",omitempty" : "";
  const jsonVal = `${field.jsonName}${omitempty}`;
  const tags: Record<string, string> = { json: jsonVal };
  if (!responseContext) {
    tags.form = field.jsonName;
    const validateParts: string[] = [];
    if (!field.optional) validateParts.push("required");
    if (field.validations) validateParts.push(...field.validations);
    if (validateParts.length > 0) {
      tags.validate = validateParts.join(",");
    }
  }
  return go.tag(tags);
}

export function renderStructAST(goStruct: GoStruct, responseContext: boolean = false): string {
  if (goStruct.fields.length === 0) {
    return `type ${goStruct.name} struct{}`;
  }

  const fields = goStruct.fields.map((f) =>
    go.field([f.name], toGoType(f.type), buildTag(f, responseContext)),
  );

  const structType = go.structType(...fields);
  const spec = go.typeSpec(goStruct.name, structType);
  const decl = go.genDecl("type", spec);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

export function renderEntityStructAST(goStruct: GoStruct): string {
  return renderStructAST(goStruct, true);
}
