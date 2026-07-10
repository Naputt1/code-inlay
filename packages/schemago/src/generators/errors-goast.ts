import * as go from "@schemago/goast";
import { toGoType } from "../utils/goast.js";
import type { ErrorDefinition, RouteAst } from "../types/index.js";

export const httpStatusConsts: Record<number, string> = {
  400: "http.StatusBadRequest",
  401: "http.StatusUnauthorized",
  402: "http.StatusPaymentRequired",
  403: "http.StatusForbidden",
  404: "http.StatusNotFound",
  405: "http.StatusMethodNotAllowed",
  406: "http.StatusNotAcceptable",
  408: "http.StatusRequestTimeout",
  409: "http.StatusConflict",
  410: "http.StatusGone",
  411: "http.StatusLengthRequired",
  412: "http.StatusPreconditionFailed",
  413: "http.StatusRequestEntityTooLarge",
  414: "http.StatusRequestURITooLong",
  415: "http.StatusUnsupportedMediaType",
  416: "http.StatusRequestedRangeNotSatisfiable",
  417: "http.StatusExpectationFailed",
  418: "http.StatusTeapot",
  421: "http.StatusMisdirectedRequest",
  422: "http.StatusUnprocessableEntity",
  423: "http.StatusLocked",
  424: "http.StatusFailedDependency",
  426: "http.StatusUpgradeRequired",
  428: "http.StatusPreconditionRequired",
  429: "http.StatusTooManyRequests",
  431: "http.StatusRequestHeaderFieldsTooLarge",
  451: "http.StatusUnavailableForLegalReasons",
  500: "http.StatusInternalServerError",
  501: "http.StatusNotImplemented",
  502: "http.StatusBadGateway",
  503: "http.StatusServiceUnavailable",
  504: "http.StatusGatewayTimeout",
};

export function collectModuleErrors(routes: RouteAst[]): ErrorDefinition[] {
  const seen = new Map<string, ErrorDefinition>();
  for (const route of routes) {
    if (!("errors" in route)) continue;
    for (const err of route.errors) {
      if (!seen.has(err.name)) {
        seen.set(err.name, err);
      }
    }
  }
  return Array.from(seen.values());
}

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
  const expr: go.Expression = statusStr?.startsWith("http.")
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

function renderHTTPErrorInterface(): string {
  const httpErrorSpec = go.typeSpec(
    "HTTPError",
    go.interfaceType(
      go.embedded(go.id("error")),
      go.field(["HTTPStatus"], go.funcType([], [go.field([], go.id("int"))])),
    ),
  );
  const decl = go.genDecl("type", httpErrorSpec);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

export function renderStandardErrors(structs: ErrorStruct[]): string {
  const parts: string[] = [renderImport(), "", renderHTTPErrorInterface(), ""];

  for (const s of structs) {
    parts.push(renderStructType(s.name, s.fields));
    parts.push(renderStandardErrorMethod(s.name));
    parts.push(renderHTTPStatusMethod(s.name, s.httpStatus));
    parts.push("");
  }

  if (parts[parts.length - 1] === "") parts.pop();
  return parts.join("\n");
}

export function renderModuleErrors(_moduleName: string, structs: ErrorStruct[]): string {
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
