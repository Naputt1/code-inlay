import * as go from "@schemago/go-ast";
import { toGoType } from "../utils/go-ast.js";
import { httpStatusConsts } from "./errors.js";

type ErrorStructField = { name: string; type: string; jsonName: string };
type ErrorStruct = { name: string; fields: ErrorStructField[]; httpStatus: number };

function renderImport(): string {
  const decl = go.genDecl("import", go.importSpec("net/http"));
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

function renderStructType(name: string, fields: ErrorStructField[]): string {
  const goFields = fields.map((f) =>
    go.field([f.name], toGoType(f.type), go.tag({ json: f.jsonName })),
  );
  const st = go.structType(...goFields);
  const spec = go.typeSpec(name, st);
  const decl = go.genDecl("type", spec);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

function renderStandardErrorMethod(name: string): string {
  const recv = go.field(["e"], go.star(go.id(name)));
  const decl = go.method(
    recv,
    "Error",
    [],
    [go.field([], go.id("string"))],
    go.block(go.return_(go.sel(go.id("e"), "Message"))),
  );
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

function renderModuleErrorMethod(name: string): string {
  const recv = go.field(["e"], go.star(go.id(name)));
  const decl = go.method(
    recv,
    "Error",
    [],
    [go.field([], go.id("string"))],
    go.block(go.return_(go.str(name))),
  );
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

function renderHTTPStatusMethod(name: string, httpStatus: number): string {
  const recv = go.field(["e"], go.star(go.id(name)));
  const statusStr = httpStatusConsts[httpStatus];
  const expr: go.Expression =
    statusStr?.startsWith("http.")
      ? go.qual("http", statusStr.slice(5))
      : go.int(httpStatus);
  const decl = go.method(
    recv,
    "HTTPStatus",
    [],
    [go.field([], go.id("int"))],
    go.block(go.return_(expr)),
  );
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

export function renderStandardErrors(structs: ErrorStruct[]): string {
  const parts: string[] = [renderImport(), ""];

  for (const s of structs) {
    parts.push(renderStructType(s.name, s.fields));
    parts.push(renderStandardErrorMethod(s.name));
    parts.push(renderHTTPStatusMethod(s.name, s.httpStatus));
    parts.push("");
  }

  if (parts[parts.length - 1] === "") parts.pop();
  return parts.join("\n");
}

export function renderModuleErrors(
  _moduleName: string,
  structs: ErrorStruct[],
): string {
  const parts: string[] = [renderImport(), ""];

  for (const s of structs) {
    parts.push(renderStructType(s.name, s.fields));
    parts.push(renderModuleErrorMethod(s.name));
    parts.push(renderHTTPStatusMethod(s.name, s.httpStatus));
    parts.push("");
  }

  if (parts[parts.length - 1] === "") parts.pop();
  return parts.join("\n");
}
