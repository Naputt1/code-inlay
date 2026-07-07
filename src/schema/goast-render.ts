import * as go from "@schemago/go-ast";
import { toGoType } from "../utils/go-ast.js";
import type { GoStruct, GoField } from "./index.js";

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
