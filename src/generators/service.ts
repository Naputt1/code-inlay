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

  if (svc.dbTypePkg) {
    parts.push({
      kind: "imports" as const,
      symbolName: "",
      content: `import "${svc.dbTypePkg}"`,
      expectsUserCode: false,
      isStub: false,
      imports: [svc.dbTypePkg],
    });
  }

  const ifaceLines: string[] = [`type ${typeName} interface {`];
  if (svc.dbAccessor && svc.dbType) {
    ifaceLines.push(`\t${svc.dbAccessor}() ${svc.dbType}`);
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
  if (needsConfig) {
    structFields.push(`\tcfg config.Config`);
  }
  parts.push({
    kind: "struct" as const,
    symbolName: implName,
    content: `type ${implName} struct {\n${structFields.join("\n")}\n}`,
    expectsUserCode: false,
    isStub: false,
  });

  const ctorParams = needsConfig ? "cfg config.Config" : "";
  const ctorArg = needsConfig ? "cfg: cfg" : "";
  const ctorSig = `func ${ctorName}(${ctorParams}) (*${implName}, error)`;
  parts.push({
    kind: "function" as const,
    symbolName: ctorName,
    signature: ctorSig,
    content: `\treturn &${implName}{${ctorArg}}, nil`,
    expectsUserCode: false,
    isStub: false,
  });

  if (needsConfig && modulePath) {
    const cfgPath = `"${modulePath}/internal/config"`;
    parts.push({
      kind: "imports" as const,
      symbolName: "",
      content: `import ${cfgPath}`,
      expectsUserCode: false,
      isStub: false,
      imports: [cfgPath],
    });
  }

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

  return parts;
}
