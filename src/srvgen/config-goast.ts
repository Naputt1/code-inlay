import * as go from "@schemago/goast";
import type { EnvVarInfo, GeneratedFilePatch } from "../types/index.js";
import type { GoModuleInfo } from "../utils/env.js";

export const configFilePath = "internal/config/env.go";

function renderImportsRegion(imports: string[]): string {
  const specs = imports.sort().map((i) => go.importSpec(i.replace(/^"|"$/g, "")));
  const decl: go.GenDecl = { kind: "GenDecl", token: "import", specs, lparen: true };
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

function renderStructContent(env: Record<string, EnvVarInfo>): string {
  const fields: go.Field[] = [];
  const descMap = new Map<string, string>();

  for (const [key, info] of Object.entries(env)) {
    const goType = info.type === "string" ? "string" : info.type === "number" ? "int" : "bool";
    if (info.description) {
      descMap.set(key, info.description);
    }
    fields.push(go.field([key], go.id(goType)));
  }

  const st = go.structType(...fields);
  const spec = go.typeSpec("Config", st);
  const decl = go.genDecl("type", spec);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  let content = sb.toString().trimEnd();

  if (descMap.size > 0) {
    const lines = content.split("\n");
    const result: string[] = [lines[0]];
    for (let i = 1; i < lines.length - 1; i++) {
      const fieldLine = lines[i];
      const match = fieldLine.match(/^\t(\w+)\s/);
      if (match) {
        const name = match[1];
        const desc = descMap.get(name);
        if (desc) {
          result.push(`\t// ${desc}`);
        }
      }
      result.push(fieldLine);
    }
    result.push(lines[lines.length - 1]);
    content = result.join("\n");
  }

  return content;
}

function renderLoadContent(env: Record<string, EnvVarInfo>): string {
  const bodyStmts: go.Statement[] = [];

  bodyStmts.push({
    kind: "IfStmt",
    init: go.def(go.id("err"), go.call(go.qual("godotenv", "Load"))),
    cond: go.binary(go.id("err"), "!=", go.id("nil")),
    body: go.block(
      go.expr(
        go.call(
          go.sel(go.id("log"), "Println"),
          go.str(".env file not loaded, using system env vars:"),
          go.id("err"),
        ),
      ),
    ),
  });

  bodyStmts.push(go.declStmt(go.genDecl("var", go.valueSpec(["cfg"], go.id("Config")))));

  for (const [key, info] of Object.entries(env)) {
    if (key === "PORT") {
      bodyStmts.push(
        go.assign([go.sel(go.id("cfg"), "PORT")], "=", [
          go.call(go.sel(go.id("os"), "Getenv"), go.str("PORT")),
        ]),
      );
      if (info.default !== undefined) {
        bodyStmts.push({
          kind: "IfStmt",
          cond: go.binary(go.sel(go.id("cfg"), "PORT"), "==", go.str("")),
          body: go.block(go.assign([go.sel(go.id("cfg"), "PORT")], "=", [go.str(info.default)])),
        });
      } else {
        bodyStmts.push({
          kind: "IfStmt",
          cond: go.binary(go.sel(go.id("cfg"), "PORT"), "==", go.str("")),
          body: go.block(
            go.expr(go.call(go.sel(go.id("log"), "Fatal"), go.str("PORT is required but not set"))),
          ),
        });
      }
      bodyStmts.push({
        kind: "IfStmt",
        cond: go.not(
          go.call(go.qual("strings", "HasPrefix"), go.sel(go.id("cfg"), "PORT"), go.str(":")),
        ),
        body: go.block(
          go.assign([go.sel(go.id("cfg"), "PORT")], "=", [
            go.binary(go.str(":"), "+", go.sel(go.id("cfg"), "PORT")),
          ]),
        ),
      });
      continue;
    }

    if (info.type === "string") {
      bodyStmts.push(
        go.assign([go.sel(go.id("cfg"), key)], "=", [
          go.call(go.sel(go.id("os"), "Getenv"), go.str(key)),
        ]),
      );
      if (info.required) {
        bodyStmts.push({
          kind: "IfStmt",
          cond: go.binary(go.sel(go.id("cfg"), key), "==", go.str("")),
          body: go.block(
            go.expr(
              go.call(go.sel(go.id("log"), "Fatal"), go.str(`${key} is required but not set`)),
            ),
          ),
        });
      } else if (info.default !== undefined) {
        bodyStmts.push({
          kind: "IfStmt",
          cond: go.binary(go.sel(go.id("cfg"), key), "==", go.str("")),
          body: go.block(go.assign([go.sel(go.id("cfg"), key)], "=", [go.str(info.default)])),
        });
      }
    } else if (info.type === "number") {
      const defaultVal = info.default ?? "0";
      bodyStmts.push(go.assign([go.sel(go.id("cfg"), key)], "=", [go.int(defaultVal)]));
      const innerIf: go.IfStmt = {
        kind: "IfStmt",
        init: go.def(
          [go.id("n"), go.id("err")],
          go.call(go.sel(go.id("strconv"), "Atoi"), go.id("v")),
        ),
        cond: go.binary(go.id("err"), "!=", go.id("nil")),
        body: go.block(
          go.expr(
            go.call(
              go.sel(go.id("log"), "Fatalf"),
              go.str(`${key}: invalid number %q`),
              go.id("v"),
            ),
          ),
        ),
        elseStmt: go.block(go.assign([go.sel(go.id("cfg"), key)], "=", [go.id("n")])),
      };
      if (info.required) {
        bodyStmts.push({
          kind: "IfStmt",
          init: go.def(go.id("v"), go.call(go.sel(go.id("os"), "Getenv"), go.str(key))),
          cond: go.binary(go.id("v"), "==", go.str("")),
          body: go.block(
            go.expr(
              go.call(go.sel(go.id("log"), "Fatal"), go.str(`${key} is required but not set`)),
            ),
          ),
          elseStmt: innerIf,
        });
      } else {
        bodyStmts.push({
          kind: "IfStmt",
          init: go.def(go.id("v"), go.call(go.sel(go.id("os"), "Getenv"), go.str(key))),
          cond: go.binary(go.id("v"), "!=", go.str("")),
          body: go.block(innerIf),
        });
      }
    } else if (info.type === "boolean") {
      const defaultVal = info.default ?? "false";
      bodyStmts.push(go.assign([go.sel(go.id("cfg"), key)], "=", [go.id(defaultVal)]));
      const innerIf: go.IfStmt = {
        kind: "IfStmt",
        init: go.def(
          [go.id("b"), go.id("err")],
          go.call(go.sel(go.id("strconv"), "ParseBool"), go.id("v")),
        ),
        cond: go.binary(go.id("err"), "!=", go.id("nil")),
        body: go.block(
          go.expr(
            go.call(
              go.sel(go.id("log"), "Fatalf"),
              go.str(`${key}: invalid boolean %q`),
              go.id("v"),
            ),
          ),
        ),
        elseStmt: go.block(go.assign([go.sel(go.id("cfg"), key)], "=", [go.id("b")])),
      };
      if (info.required) {
        bodyStmts.push({
          kind: "IfStmt",
          init: go.def(go.id("v"), go.call(go.sel(go.id("os"), "Getenv"), go.str(key))),
          cond: go.binary(go.id("v"), "==", go.str("")),
          body: go.block(
            go.expr(
              go.call(go.sel(go.id("log"), "Fatal"), go.str(`${key} is required but not set`)),
            ),
          ),
          elseStmt: innerIf,
        });
      } else {
        bodyStmts.push({
          kind: "IfStmt",
          init: go.def(go.id("v"), go.call(go.sel(go.id("os"), "Getenv"), go.str(key))),
          cond: go.binary(go.id("v"), "!=", go.str("")),
          body: go.block(innerIf),
        });
      }
    }
  }

  bodyStmts.push(go.return_(go.id("cfg")));

  const sb = new go.StringBuilder();
  for (const stmt of bodyStmts) {
    go.printStatement(sb, stmt, 1);
  }
  let content = sb.toString().trimEnd();

  if ("PORT" in env) {
    content = content.replace(/\n(\tcfg\.PORT =)/, "\n\n$1");
  }

  return content;
}

export function generateEnvConfigFile(
  env: Record<string, EnvVarInfo>,
  moduleInfo: GoModuleInfo,
): GeneratedFilePatch | null {
  if (!env || Object.keys(env).length === 0) return null;

  const imports: string[] = [`"os"`];
  let needsStrconv = false;
  let needsStrings = false;

  for (const [key, info] of Object.entries(env)) {
    if (key === "PORT") {
      needsStrings = true;
    } else if (info.type === "number" || info.type === "boolean") {
      needsStrconv = true;
    }
  }

  if (needsStrconv) imports.push(`"strconv"`);
  if (needsStrings) imports.push(`"strings"`);
  imports.push(`"log"`);
  imports.push(`"github.com/joho/godotenv"`);

  const structContent = renderStructContent(env);
  const loadContent = renderLoadContent(env);

  return {
    path: configFilePath,
    regions: [
      {
        id: `${configFilePath}.imports`,
        stableHash: `${configFilePath}:imports:${moduleInfo.modulePath}`,
        owner: "schemago",
        language: "go",
        content: renderImportsRegion(imports),
        imports,
      },
      {
        id: `${configFilePath}.struct`,
        stableHash: `${configFilePath}:struct:${moduleInfo.modulePath}`,
        owner: "schemago",
        language: "go",
        content: structContent,
        symbolName: "Config",
        kind: "struct",
      },
      {
        id: `${configFilePath}.load`,
        stableHash: `${configFilePath}:load:${moduleInfo.modulePath}`,
        owner: "schemago",
        language: "go",
        content: loadContent,
        symbolName: "Load",
        kind: "function",
        signature: "func Load() Config",
      },
    ],
  };
}
