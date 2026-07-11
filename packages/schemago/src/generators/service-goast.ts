import * as go from "@schemago/goast";
import { createParser } from "@schemago/goast";
import type { AppServiceDef, BackendExtension } from "../types/index.js";
import { serviceConstructorName, serviceImplName, serviceTypeName } from "../utils/naming.js";
import { toGoType } from "../utils/goast.js";
import type { ScaffoldPart } from "./types.js";

function renderImports(imports: string[]): string {
  const specs = imports.map((i) => go.importSpec(i));
  const decl: go.GenDecl = { kind: "GenDecl", token: "import", specs, lparen: true };
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

function renderInterfaceContent(
  typeName: string,
  importsList: string[],
  dbAccessor: string | undefined,
  dbType: string | undefined,
  close: boolean | undefined,
  interfaceMethods?: { name: string; params: go.Field[]; results?: go.Field[] }[],
): string[] {
  const parts: string[] = [];

  if (importsList.length > 0) {
    parts.push(renderImports(importsList));
  }

  const methods: go.Field[] = [];
  if (dbAccessor && dbType) {
    methods.push(go.field([dbAccessor], go.funcType([], [go.field([], toGoType(dbType))])));
  }
  if (close) {
    methods.push(go.field(["Close"], go.funcType([], [go.field([], go.id("error"))])));
  }
  if (interfaceMethods) {
    for (const m of interfaceMethods) {
      methods.push(go.field([m.name], go.funcType(m.params, m.results)));
    }
  }

  if (methods.length === 0) {
    parts.push(`type ${typeName} interface {\n}`);
  } else {
    const iface = go.interfaceType(...methods);
    const spec = go.typeSpec(typeName, iface);
    const decl = go.genDecl("type", spec);
    const sb = new go.StringBuilder();
    go.printDeclaration(sb, decl, 0);
    let content = sb.toString().trimEnd();
    content = content.replace(/^(\t+)(\w+)\s+func\(/gm, "$1$2(");
    parts.push(content);
  }

  return parts;
}

function renderStructContent(
  implName: string,
  needsConfig: boolean,
  svcFields?: go.Field[],
): string {
  const structFields: go.Field[] = [...(svcFields ?? [])];
  if (needsConfig) {
    structFields.push(go.field(["cfg"], go.qual("config", "Config")));
  }
  if (structFields.length === 0) {
    return `type ${implName} struct {\n\n}`;
  }
  const st = go.structType(...structFields);
  const spec = go.typeSpec(implName, st);
  const decl = go.genDecl("type", spec);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

function methodSignature(
  receiverType: string,
  name: string,
  params: go.Field[],
  results: go.Field[],
): string {
  const m = go.method(go.field(["s"], go.star(go.id(receiverType))), name, params, results);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, m, 0);
  return sb.toString().trimEnd();
}

function funcDeclParts(fn: go.FuncDecl): { signature: string; body: string } {
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, fn, 0);
  const rendered = sb.toString().trimEnd();
  const braceIdx = rendered.indexOf("{\n");
  if (braceIdx === -1) return { signature: rendered, body: "" };
  const sig = rendered.substring(0, braceIdx).trimEnd();
  const bodyContent = rendered.substring(braceIdx + 1);
  const trimmed = bodyContent.replace(/^\{\n/, "").replace(/\n\}$/, "");
  return { signature: sig, body: trimmed };
}

export function generateServiceFile(
  svc: AppServiceDef,
  extensions?: BackendExtension[],
  modulePath?: string,
): ScaffoldPart[] {
  const typeName = serviceTypeName(svc.name);
  const implName = serviceImplName(svc.name);
  const ctorName = serviceConstructorName(svc.name);
  const needsConfig = (svc.env?.length ?? 0) > 0;

  if (svc.extension && extensions) {
    const ext = extensions.find((e) => e.name === svc.extension);
    if (ext?.service?.generateFile) {
      const content = ext.service.generateFile({
        name: svc.name,
        options: svc.extensionOptions ?? {},
        typeName,
        implName,
        ctorName,
        close: svc.close,
      });

      const parser = createParser();
      const wrapped = `package p\n\n${content}`;
      const result = parser.parseSummary(wrapped);
      if (Array.isArray(result) && result.length > 1) {
        const lines = wrapped.split("\n");
        const parts: ScaffoldPart[] = [];

        for (const d of result) {
          if (d.kind === "imports" || !d.symbolName) continue;

          const declText = lines.slice(d.startLine - 1, d.endLine).join("\n");
          const part: ScaffoldPart = {
            symbolName: d.symbolName,
            content: declText,
            expectsUserCode: d.symbolName !== typeName,
            isStub: d.symbolName === ctorName,
            kind: "interface",
          };

          if (d.kind === "function" || d.kind === "method") {
            part.kind = d.kind === "method" ? "method" : "function";
            const braceIdx = declText.indexOf("{");
            if (braceIdx >= 0) {
              part.signature = declText.substring(0, braceIdx).trimEnd();
              let body = declText.substring(braceIdx + 1);
              body = body
                .replace(/^\r?\n?/, "")
                .replace(/\r?\n?\}\s*$/, "")
                .trimEnd();
              part.content = body;
            }
          } else if (d.kind === "struct") {
            part.kind = "struct";
          } else {
            part.kind = "interface";
          }

          parts.push(part);
        }

        if (parts.length > 0) return parts;
      }

      return [
        {
          kind: "interface" as const,
          symbolName: typeName,
          content,
          expectsUserCode: false,
          isStub: false,
        },
      ];
    }
  }

  const parts: ScaffoldPart[] = [];

  const importsList: string[] = [];
  if (svc.dbTypePkg) {
    importsList.push(svc.dbTypePkg);
  }
  if (svc.extraImports) {
    for (const imp of svc.extraImports) {
      importsList.push(imp);
    }
  }
  if (needsConfig && modulePath) {
    importsList.push(`${modulePath}/internal/config`);
  }

  const interfaceParts = renderInterfaceContent(
    typeName,
    importsList,
    svc.dbAccessor,
    svc.dbType,
    svc.close,
    svc.interfaceMethods,
  );
  parts.push({
    kind: "interface" as const,
    symbolName: typeName,
    content: interfaceParts.join("\n\n"),
    expectsUserCode: false,
    isStub: false,
  });

  parts.push({
    kind: "struct" as const,
    symbolName: implName,
    content: renderStructContent(implName, needsConfig, svc.structFields),
    expectsUserCode: true,
    isStub: false,
  });

  const allParams: go.Field[] = [];
  if (svc.ctor?.params) {
    allParams.push(...svc.ctor.params);
  }
  if (needsConfig) {
    allParams.push(go.field(["cfg"], go.qual("config", "Config")));
  }

  const allBody = svc.ctor?.body ?? [go.return_(go.call(go.addr(go.id(implName)), go.id("nil")))];

  const ctorFn = go.function_(
    ctorName,
    allParams,
    [go.field([], go.star(go.id(implName))), go.field([], go.id("error"))],
    go.block(...allBody),
  );
  const { signature: ctorSig, body: ctorBody } = funcDeclParts(ctorFn);

  parts.push({
    kind: "function" as const,
    symbolName: ctorName,
    signature: ctorSig,
    content: ctorBody,
    expectsUserCode: !svc.ctor?.body,
    isStub: true,
  });

  if (svc.dbAccessor && svc.dbType) {
    const accessorName = svc.dbAccessor;
    const sig = methodSignature(implName, accessorName, [], [go.field([], toGoType(svc.dbType))]);
    parts.push({
      kind: "method" as const,
      symbolName: `${implName}.${accessorName}`,
      receiver: `*${implName}`,
      signature: sig,
      content: `\t// TODO: return initialized ${svc.dbType}\n\treturn nil`,
      expectsUserCode: false,
      isStub: true,
    });
  }

  if (svc.close) {
    const sig = methodSignature(implName, "Close", [], [go.field([], go.id("error"))]);
    parts.push({
      kind: "method" as const,
      symbolName: `${implName}.Close`,
      receiver: `*${implName}`,
      signature: sig,
      content: `\treturn nil`,
      expectsUserCode: true,
      isStub: false,
    });
  }

  if (svc.implementationMethods) {
    for (const m of svc.implementationMethods) {
      const fn = go.method(
        go.field(["s"], go.star(go.id(implName))),
        m.name,
        m.params,
        m.results,
        go.block(...m.body),
      );
      const { signature, body } = funcDeclParts(fn);
      parts.push({
        kind: "method" as const,
        symbolName: `${implName}.${m.name}`,
        receiver: `*${implName}`,
        signature,
        content: body,
        expectsUserCode: false,
        isStub: false,
      });
    }
  }

  return parts;
}
