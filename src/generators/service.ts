import type { AppServiceDef, BackendExtension } from "../types/index.js";
import { serviceConstructorName, serviceImplName, serviceTypeName } from "../utils/naming.js";
import type { ScaffoldPart } from "./types.js";

export function generateServiceFile(
  svc: AppServiceDef,
  extensions?: BackendExtension[],
  modulePath?: string,
): ScaffoldPart[] {
  const typeName = serviceTypeName(svc.name);
  const implName = serviceImplName(svc.name);
  const ctorName = serviceConstructorName(svc.name);
  const needsConfig = svc.env && svc.env.length > 0;

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

  const ifaceLines: string[] = [];
  if (importsList.length > 0) {
    ifaceLines.push(`import (`);
    for (const imp of importsList) {
      ifaceLines.push(`\t"${imp}"`);
    }
    ifaceLines.push(`)`);
    ifaceLines.push(``);
  }
  ifaceLines.push(`type ${typeName} interface {`);
  if (svc.dbAccessor && svc.dbType) {
    ifaceLines.push(`\t${svc.dbAccessor}() ${svc.dbType}`);
  }
  if (svc.interfaceMethods) {
    for (const m of svc.interfaceMethods) {
      ifaceLines.push(`\t${m.name}${m.signature}`);
    }
  }
  if (svc.close) {
    ifaceLines.push(`\tClose() error`);
  }
  ifaceLines.push(`}`);
  parts.push({
    kind: "interface" as const,
    symbolName: typeName,
    content: ifaceLines.join("\n"),
    expectsUserCode: false,
    isStub: false,
  });

  const structFields: string[] = [];
  if (svc.dbType && !svc.structFields) {
    structFields.push(`\tdb ${svc.dbType}`);
  }
  if (svc.structFields) {
    for (const f of svc.structFields) {
      structFields.push(`\t${f.name} ${f.goType}`);
    }
  }
  if (needsConfig) {
    structFields.push(`\tcfg config.Config`);
  }
  const structContent =
    structFields.length === 0
      ? `type ${implName} struct {\n}`
      : `type ${implName} struct {\n${structFields.join("\n")}\n}`;
  parts.push({
    kind: "struct" as const,
    symbolName: implName,
    content: structContent,
    expectsUserCode: true,
    isStub: false,
  });

  const ctorParamParts: string[] = [];
  if (svc.ctor?.params) {
    ctorParamParts.push(svc.ctor.params);
  }
  if (needsConfig) {
    ctorParamParts.push("cfg config.Config");
  }
  const ctorParams = ctorParamParts.join(", ");

  const ctorFieldParts: string[] = [];
  if (svc.ctor?.fieldInit) {
    ctorFieldParts.push(svc.ctor.fieldInit);
  }
  if (needsConfig) {
    ctorFieldParts.push("cfg: cfg");
  }
  const ctorArg = ctorFieldParts.join(", ");

  const ctorBody = svc.ctor?.body
    ? svc.ctor.body
    : `\treturn &${implName}{${ctorArg}}, nil`;

  const ctorSig = `func ${ctorName}(${ctorParams}) (*${implName}, error)`;
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
    parts.push({
      kind: "method" as const,
      symbolName: `${implName}.${accessorName}`,
      receiver: `*${implName}`,
      signature: `func (s *${implName}) ${accessorName}() ${svc.dbType}`,
      content: `\t// TODO: return initialized ${svc.dbType}\n\treturn nil`,
      expectsUserCode: false,
      isStub: true,
    });
  }

  if (svc.close) {
    parts.push({
      kind: "method" as const,
      symbolName: `${implName}.Close`,
      receiver: `*${implName}`,
      signature: `func (s *${implName}) Close() error`,
      content: `\treturn nil`,
      expectsUserCode: false,
      isStub: false,
    });
  }

  if (svc.implementationMethods) {
    for (const m of svc.implementationMethods) {
      parts.push({
        kind: "method" as const,
        symbolName: m.name,
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
