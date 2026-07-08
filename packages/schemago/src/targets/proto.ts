import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CodeTarget,
  Diagnostic,
  GeneratedRegion,
  ResolvedCodec,
  RouteLikeAst,
  SchemaLike,
  SSEAst,
  WSAst,
} from "../types/index.js";
import { pascalCase, snakeCase } from "../utils/naming.js";
import {
  isZodArray,
  isZodObject,
  isZodDiscriminatedUnion,
  typeName,
  unwrap,
} from "../schema/extras.js";

import {
  generateStubPbGoContent,
  generateFromProtoFunc,
  generateToProtoFunc,
  generateFromProtoBytesFunc,
  generateToProtoBytesFunc,
} from "./proto-goast.js";

export type ProtoField = {
  name: string;
  protoType: string;
  number: number;
  repeated: boolean;
};

export type ProtoMessage = {
  name: string;
  fields: ProtoField[];
};

export type ProtoEnum = {
  name: string;
  values: string[];
};

export type FieldMapping = {
  goName: string;
  protoName: string;
  goType: string;
  protoFieldType: string;
  repeated: boolean;
  nested: boolean;
};

function codecUsesProtobuf(codec: ResolvedCodec | undefined): boolean {
  if (!codec) return false;
  if (codec.kind === "preset") return codec.preset === "protobuf";
  if (codec.kind === "negotiated") {
    return Object.values(codec.codecs).some((c) => c.kind === "preset" && c.preset === "protobuf");
  }
  return false;
}

function shouldGenerateProto(route: RouteLikeAst): boolean {
  if (route.kind === "SSE" && codecUsesProtobuf((route as SSEAst).codec)) return true;
  if (route.kind === "WS" && codecUsesProtobuf((route as WSAst).codec)) return true;
  return false;
}

export const protoScalarToGo: Record<string, string> = {
  string: "string",
  bool: "bool",
  int32: "int32",
  int64: "int64",
  float: "float32",
  double: "float64",
};

export function isProtoScalar(t: string): boolean {
  return t in protoScalarToGo;
}

function protoTypeToGoType(
  protoType: string,
  messages: ProtoMessage[],
): { goType: string; nested: boolean } {
  if (isProtoScalar(protoType)) return { goType: protoScalarToGo[protoType], nested: false };
  if (protoType.endsWith("Enum")) return { goType: "string", nested: false };
  if (messages.find((m) => m.name === protoType)) {
    const goName = protoType.endsWith("Msg") ? protoType.slice(0, -3) : protoType;
    return { goType: goName, nested: true };
  }
  return { goType: protoType, nested: false };
}

export function buildMappings(msg: ProtoMessage, allMessages: ProtoMessage[]): FieldMapping[] {
  return msg.fields.map((f) => {
    const { goType, nested } = protoTypeToGoType(f.protoType, allMessages);
    return {
      goName: pascalCase(f.name),
      protoName: f.name,
      goType,
      protoFieldType: f.protoType,
      repeated: f.repeated,
      nested,
    };
  });
}

export function protoTypeToGoStruct(protoType: string): string {
  if (protoType.endsWith("Msg")) return protoType.slice(0, -3);
  return protoType;
}

function schemaToProtoType(
  schema: SchemaLike,
  messages: ProtoMessage[],
  enums: ProtoEnum[],
  contextName: string,
): string {
  const inner = unwrap(schema);
  const t = typeName(inner);
  if (t === "ZodString") return "string";
  if (t === "ZodBoolean") return "bool";
  if (t === "ZodInt32") return "int32";
  if (t === "ZodInt64") return "int64";
  if (t === "ZodFloat32") return "float";
  if (t === "ZodNumber") return "double";
  if (t === "ZodLiteral") return "string";
  if (t === "ZodEnum") {
    const values = (inner._def as { values?: string[] }).values ?? [];
    const enumName = `${contextName}Enum`;
    if (!enums.find((e) => e.name === enumName)) enums.push({ name: enumName, values });
    return enumName;
  }
  if (t === "ZodObject") {
    const shape = (inner as unknown as Record<string, unknown>).shape as Record<string, SchemaLike>;
    const msgName = `${contextName}Msg`;
    if (!messages.find((m) => m.name === msgName)) {
      messages.push(objectToProtoMessage(shape, msgName, messages, enums));
    }
    return msgName;
  }
  if (t === "ZodDiscriminatedUnion") {
    const du = inner as unknown as { _def: { discriminator: string; options: SchemaLike[] } };
    const msgName = `${contextName}Msg`;
    if (!messages.find((m) => m.name === msgName)) {
      const fields: ProtoField[] = [
        { name: snakeCase(du._def.discriminator), protoType: "string", number: 1, repeated: false },
      ];
      for (let i = 0; i < du._def.options.length; i++) {
        const u = unwrap(du._def.options[i]);
        if (isZodObject(u)) {
          const optMsgName = `${contextName}Option${i}`;
          const optShape = (u as unknown as Record<string, unknown>).shape as Record<
            string,
            SchemaLike
          >;
          if (!messages.find((m) => m.name === optMsgName)) {
            messages.push(objectToProtoMessage(optShape, optMsgName, messages, enums));
          }
          fields.push({
            name: `option${i}`,
            protoType: optMsgName,
            number: i + 2,
            repeated: false,
          });
        }
      }
      messages.push({ name: msgName, fields });
    }
    return msgName;
  }
  if (t === "ZodEntity") return "google.protobuf.Any";
  return "string";
}

function objectToProtoMessage(
  shape: Record<string, SchemaLike>,
  name: string,
  messages: ProtoMessage[],
  enums: ProtoEnum[],
): ProtoMessage {
  const fields: ProtoField[] = [];
  const keys = Object.keys(shape).sort();
  let fieldNum = 0;
  for (const key of keys) {
    fieldNum++;
    const fieldSchema = shape[key];
    const inner = unwrap(fieldSchema);
    if (isZodArray(inner)) {
      const elemType = schemaToProtoType(
        inner.element,
        messages,
        enums,
        `${name}${pascalCase(key)}`,
      );
      fields.push({ name: snakeCase(key), protoType: elemType, number: fieldNum, repeated: true });
    } else {
      const fieldType = schemaToProtoType(
        fieldSchema,
        messages,
        enums,
        `${name}${pascalCase(key)}`,
      );
      fields.push({
        name: snakeCase(key),
        protoType: fieldType,
        number: fieldNum,
        repeated: false,
      });
    }
  }
  return { name, fields };
}

function messageToProto(def: ProtoMessage): string {
  const lines: string[] = [`message ${def.name} {`];
  for (const f of def.fields) {
    lines.push(`  ${f.repeated ? "repeated " : ""}${f.protoType} ${f.name} = ${f.number};`);
  }
  lines.push(`}`);
  return lines.join("\n");
}

function enumToProto(def: ProtoEnum): string {
  const lines: string[] = [`enum ${def.name} {`];
  lines.push(`  ${def.name}_UNSPECIFIED = 0;`);
  for (let i = 0; i < def.values.length; i++) {
    lines.push(`  ${def.name}_${def.values[i].toUpperCase()} = ${i + 1};`);
  }
  lines.push(`}`);
  return lines.join("\n");
}

function getObjectShape(schema: SchemaLike): Record<string, SchemaLike> | undefined {
  const inner = unwrap(schema);
  if (isZodObject(inner))
    return (inner as unknown as Record<string, unknown>).shape as Record<string, SchemaLike>;
  if (isZodDiscriminatedUnion(inner)) {
    const firstOpt = (inner as unknown as { _def: { options: SchemaLike[] } })._def.options[0];
    if (firstOpt) {
      const u = unwrap(firstOpt);
      if (isZodObject(u))
        return (u as unknown as Record<string, unknown>).shape as Record<string, SchemaLike>;
    }
  }
  return undefined;
}

function generateProtoFileContent(
  packageName: string,
  messages: ProtoMessage[],
  enums: ProtoEnum[],
): string {
  const parts: string[] = [
    `syntax = "proto3";`,
    ``,
    `package ${packageName};`,
    ``,
    `option go_package = "gen/proto/go/${packageName}";`,
    ``,
  ];
  for (const e of enums) {
    parts.push(enumToProto(e));
    parts.push(``);
  }
  for (const m of messages) {
    parts.push(messageToProto(m));
    parts.push(``);
  }
  return parts.join("\n");
}

function readGoModulePath(cwd: string): string | undefined {
  try {
    const goModPath = join(cwd, "go.mod");
    if (!existsSync(goModPath)) return undefined;
    const match = readFileSync(goModPath, "utf8").match(/^module\s+(\S+)/m);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function runProtoc(
  protoDir: string,
  cwd: string,
  modulePath: string,
  diagnostics: Diagnostic[],
): void {
  let hasProtoc = true;
  try {
    execSync("which protoc", { stdio: "pipe", encoding: "utf8" });
  } catch {
    diagnostics.push({
      level: "warning",
      code: "protoc-missing",
      message: `protoc not found. Skipping proto compilation. Install from https://github.com/protocolbuffers/protobuf/releases`,
    });
    hasProtoc = false;
  }
  if (hasProtoc) {
    try {
      execSync("protoc-gen-go --version", { stdio: "pipe", encoding: "utf8" });
    } catch {
      diagnostics.push({
        level: "warning",
        code: "protoc-gen-go-missing",
        message: `protoc-gen-go not found. Skipping proto compilation. Install: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest`,
      });
      hasProtoc = false;
    }
  }
  if (!hasProtoc) return;
  try {
    execSync(`protoc --go_out=. --go_opt=module=${modulePath} ${protoDir}/*.proto`, {
      cwd,
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (e) {
    diagnostics.push({
      level: "warning",
      code: "protoc-failed",
      message: `protoc failed: ${(e as Error).message}`,
    });
  }
}

export const protoTarget: CodeTarget = {
  name: "proto",
  version: "0.1.0",
  apiVersion: "3",
  stage: "postTransform",
  generate(ctx) {
    const { ast, options, diagnostics, cwd } = ctx;
    const patches: Array<{ path: string; regions: GeneratedRegion[] }> = [];
    const outputDir = (options.targetOptions?.["proto"]?.outputDir as string) ?? "gen/proto";
    const goOutputDir = "gen/proto/go";
    const modulePath = readGoModulePath(cwd);

    let hasProto = false;
    const moduleConversions = new Map<
      string,
      { moduleSnake: string; messages: ProtoMessage[]; enums: ProtoEnum[] }
    >();

    for (const module of ast.modules) {
      let moduleHasProto = false;
      const messages: ProtoMessage[] = [];
      const enums: ProtoEnum[] = [];
      const moduleSnake = snakeCase(module.name);

      for (const route of module.routes) {
        if (!shouldGenerateProto(route)) continue;
        moduleHasProto = true;
        hasProto = true;

        if (route.kind === "SSE") {
          const sse = route as SSEAst;
          const msgName = `${pascalCase(sse.handlerName)}${pascalCase(sse.moduleName)}Event`;
          const shape = getObjectShape(sse.events);
          if (shape) messages.push(objectToProtoMessage(shape, msgName, messages, enums));
          patches.push({
            path: `${outputDir}/${moduleSnake}/${snakeCase(sse.handlerName)}.proto`,
            regions: [
              {
                id: `proto.${module.name}.${sse.id}`,
                stableHash: `proto:${module.name}:${sse.handlerName}`,
                owner: "proto",
                language: "go" as const,
                content: generateProtoFileContent(moduleSnake, messages, enums),
              },
            ],
          });
        }

        if (route.kind === "WS") {
          const ws = route as WSAst;
          const msgName = `${pascalCase(ws.handlerName)}${pascalCase(ws.moduleName)}Message`;
          const msgShape = getObjectShape(ws.message);
          if (msgShape) messages.push(objectToProtoMessage(msgShape, msgName, messages, enums));
          if (ws.events) {
            const evtName = `${pascalCase(ws.handlerName)}${pascalCase(ws.moduleName)}Event`;
            const evtShape = getObjectShape(ws.events);
            if (evtShape) messages.push(objectToProtoMessage(evtShape, evtName, messages, enums));
          }
          patches.push({
            path: `${outputDir}/${moduleSnake}/${snakeCase(ws.handlerName)}.proto`,
            regions: [
              {
                id: `proto.${module.name}.${ws.id}`,
                stableHash: `proto:${module.name}:${ws.handlerName}`,
                owner: "proto",
                language: "go" as const,
                content: generateProtoFileContent(moduleSnake, messages, enums),
              },
            ],
          });
        }
      }

      if (moduleHasProto) {
        moduleConversions.set(module.name, { moduleSnake, messages, enums });
      }
    }

    // Generate stub .pb.go files + conversion functions once per module
    if (modulePath) {
      for (const [modName, info] of moduleConversions) {
        // Stub .pb.go
        const stubContent = generateStubPbGoContent(info.moduleSnake, info.messages, info.enums);
        patches.push({
          path: `${goOutputDir}/${info.moduleSnake}/stubs.pb.go`,
          regions: [
            {
              id: `proto.stubs.${modName}`,
              stableHash: `proto-stubs:${modName}`,
              owner: "proto",
              language: "go" as const,
              content: stubContent + "\n",
            },
          ],
        });

        // Conversion functions (FromProto, ToProto, FromProtoBytes, ToProtoBytes)
        const parts: string[] = [
          `import (`,
          `\t"encoding/json"`,
          `\tpb "${modulePath}/${goOutputDir}/${info.moduleSnake}"`,
          `)`,
          ``,
        ];
        for (const msg of info.messages) {
          parts.push(generateFromProtoFunc(msg, info.messages));
          parts.push(``);
          parts.push(generateToProtoFunc(msg, info.messages));
          parts.push(``);
          parts.push(generateFromProtoBytesFunc(msg));
          parts.push(``);
          parts.push(generateToProtoBytesFunc(msg));
          parts.push(``);
        }
        patches.push({
          path: `internal/${info.moduleSnake}/proto.go`,
          regions: [
            {
              id: `proto.conversion.${modName}`,
              stableHash: `proto-conversion:${modName}`,
              owner: "proto",
              language: "go" as const,
              content: parts.join("\n") + "\n",
            },
          ],
        });
      }
    }

    if (hasProto && modulePath) {
      runProtoc(join(cwd, outputDir), cwd, modulePath, diagnostics);
    }

    return patches;
  },
};

export {
  generateStubPbGoContent,
  generateFromProtoFunc,
  generateToProtoFunc,
  generateFromProtoBytesFunc,
  generateToProtoBytesFunc,
};
