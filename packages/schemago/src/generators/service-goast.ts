import * as go from "@schemago/goast";
import { toGoType } from "../utils/goast.js";
import type { AppServiceDef, BackendExtension } from "../types/index.js";
import { serviceConstructorName, serviceImplName, serviceTypeName } from "../utils/naming.js";
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
  svcFields?: { name: string; goType: string }[],
): string {
  const structFields: go.Field[] = [];
  if (svcFields) {
    for (const f of svcFields) {
      structFields.push(go.field([f.name], toGoType(f.goType)));
    }
  }
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

function constructorSignature(ctorName: string, params: string, implName: string): string {
  const sig = `func ${ctorName}(${params}) (*${implName}, error)`;
  return sig;
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
      return [
        {
          kind: "interface" as const,
          symbolName: typeName,
          content: ext.service.generateFile({
            name: svc.name,
            options: svc.extensionOptions ?? {},
            typeName,
            implName,
            ctorName,
            close: svc.close,
          }),
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
  );
  if (svc.interfaceMethods) {
    for (const m of svc.interfaceMethods) {
      const lastIdx = interfaceParts.length - 1;
      const last = interfaceParts[lastIdx];
      if (last.startsWith("type ")) {
        const lines = last.split("\n");
        lines.splice(lines.length - 1, 0, `\t${m.name}${m.signature}`);
        interfaceParts[lastIdx] = lines.join("\n");
      }
    }
  }
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

  const ctorParams: string[] = [];
  if (svc.ctor?.params) {
    ctorParams.push(svc.ctor.params);
  }
  if (needsConfig) {
    ctorParams.push("cfg config.Config");
  }
  const ctorSig = constructorSignature(ctorName, ctorParams.join(", "), implName);

  const ctorFieldParts: string[] = [];
  if (svc.ctor?.fieldInit) {
    ctorFieldParts.push(svc.ctor.fieldInit);
  }
  if (needsConfig) {
    ctorFieldParts.push("cfg: cfg");
  }
  const ctorArg = ctorFieldParts.join(", ");

  const ctorBody = svc.ctor?.body ? svc.ctor.body : `\treturn &${implName}{${ctorArg}}, nil`;

  parts.push({
    kind: "function" as const,
    symbolName: ctorName,
    signature: ctorSig,
    content: ctorBody,
    expectsUserCode: true,
    isStub: false,
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
      expectsUserCode: false,
      isStub: false,
    });
  }

  if (svc.implementationMethods) {
    for (const m of svc.implementationMethods) {
      parts.push({
        kind: "method" as const,
        symbolName: `${implName}.${m.name}`,
        receiver: `*${implName}`,
        signature: m.signature,
        content: m.body,
        expectsUserCode: false,
        isStub: false,
      });
    }
  }

  return parts;
}
