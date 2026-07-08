import * as go from "@schemago/goast";
import { toGoType } from "../utils/goast.js";
import { pascalCase } from "../utils/naming.js";
import type { ProtoMessage, ProtoEnum, ProtoField, FieldMapping } from "./proto.js";
import {
  buildMappings,
  protoTypeToGoStruct,
  isProtoScalar,
  protoScalarToGo,
  snakeToCamel,
} from "./proto.js";

// ─── generateStubPbGoContent ───────────────────────────────

export function generateStubPbGoContent(
  packageName: string,
  messages: ProtoMessage[],
  _enums: ProtoEnum[],
): string {
  const parts: string[] = [`package ${packageName}`, ""];

  for (const msg of messages) {
    if (msg.fields.length === 0) {
      parts.push(`type ${msg.name} struct{}`);
      parts.push("");
      continue;
    }
    const fields = msg.fields.map((f) => {
      const goType = isProtoScalar(f.protoType)
        ? protoScalarToGo[f.protoType]
        : f.protoType.endsWith("Enum")
          ? "string"
          : f.protoType;
      const goName = pascalCase(f.name);
      const jsonName = snakeToCamel(f.name);
      const fieldType = f.repeated ? `[]${goType}` : goType;
      return go.field([goName], toGoType(fieldType), go.tag({ json: jsonName }));
    });
    const st = go.structType(...fields);
    const spec = go.typeSpec(msg.name, st);
    const decl = go.genDecl("type", spec);
    const sb = new go.StringBuilder();
    go.printDeclaration(sb, decl, 0);
    parts.push(sb.toString().trimEnd());
    parts.push("");
  }

  for (const msg of messages) {
    for (const f of msg.fields) {
      const goType = isProtoScalar(f.protoType)
        ? protoScalarToGo[f.protoType]
        : f.protoType.endsWith("Enum")
          ? "string"
          : f.protoType;
      const goName = pascalCase(f.name);
      const fieldType = f.repeated ? `[]${goType}` : goType;
      let zeroValue: string;
      if (f.repeated) {
        zeroValue = "nil";
      } else if (goType === "string") {
        zeroValue = `""`;
      } else if (goType === "bool") {
        zeroValue = "false";
      } else {
        zeroValue = "0";
      }
      parts.push(
        `func (m *${msg.name}) Get${goName}() ${fieldType} {`,
        `\tif m != nil { return m.${goName} }`,
        `\treturn ${zeroValue}`,
        `}`,
        ``,
      );
    }
  }

  return parts.join("\n");
}

// ─── FromProto closure helper ──────────────────────────────

function buildFromProtoClosureStr(m: FieldMapping): string {
  const innerName = protoTypeToGoStruct(m.protoFieldType);
  const getter = `Get${m.goName}`;
  return [
    `func() []${innerName} {`,
    `\t\t\tif len(src.${getter}()) == 0 { return nil }`,
    `\t\t\tresult := make([]${innerName}, len(src.${getter}()))`,
    `\t\t\tfor i, v := range src.${getter}() {`,
    `\t\t\t\tresult[i] = ${innerName}FromProto(v)`,
    `\t\t\t}`,
    `\t\t\treturn result`,
    `\t\t}()`,
  ].join("\n");
}

// ─── generateFromProtoFunc ─────────────────────────────────

export function generateFromProtoFunc(msg: ProtoMessage, allMessages: ProtoMessage[]): string {
  const mappings = buildMappings(msg, allMessages);
  const funcName = `${msg.name}FromProto`;
  const params = [go.field(["src"], go.star(go.qual("pb", msg.name)))];
  const results = [go.field([], go.id(msg.name))];

  if (mappings.length === 0) {
    const body = go.block(go.return_(go.elt(go.id(msg.name))));
    const decl = go.function_(funcName, params, results, body);
    const sb = new go.StringBuilder();
    go.printDeclaration(sb, decl, 0);
    return sb.toString().trimEnd();
  }

  const kvs: go.KeyValueExpr[] = [];
  for (const m of mappings) {
    if (m.repeated && m.nested) {
      kvs.push(go.kv(m.goName, go.id(buildFromProtoClosureStr(m))));
    } else if (m.repeated) {
      kvs.push(go.kv(m.goName, go.call(go.sel(go.id("src"), `Get${m.goName}`))));
    } else if (m.nested) {
      kvs.push(
        go.kv(
          m.goName,
          go.call(
            go.id(`${protoTypeToGoStruct(m.protoFieldType)}FromProto`),
            go.call(go.sel(go.id("src"), `Get${m.goName}`)),
          ),
        ),
      );
    } else {
      kvs.push(go.kv(m.goName, go.call(go.sel(go.id("src"), `Get${m.goName}`))));
    }
  }

  const body = go.block(go.return_(go.elt(go.id(msg.name), ...kvs)));
  const decl = go.function_(funcName, params, results, body);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

// ─── ToProto closure helper ────────────────────────────────

function buildToProtoClosureStr(m: FieldMapping): string {
  const innerName = protoTypeToGoStruct(m.protoFieldType);
  return [
    `func() []*pb.${m.protoFieldType} {`,
    `\t\t\tif len(src.${m.goName}) == 0 { return nil }`,
    `\t\t\tresult := make([]*pb.${m.protoFieldType}, len(src.${m.goName}))`,
    `\t\t\tfor i, v := range src.${m.goName} {`,
    `\t\t\t\tresult[i] = ${innerName}ToProto(v)`,
    `\t\t\t}`,
    `\t\t\treturn result`,
    `\t\t}()`,
  ].join("\n");
}

// ─── generateToProtoFunc ───────────────────────────────────

export function generateToProtoFunc(msg: ProtoMessage, allMessages: ProtoMessage[]): string {
  const mappings = buildMappings(msg, allMessages);
  const funcName = `${msg.name}ToProto`;
  const params = [go.field(["src"], go.id(msg.name))];
  const results = [go.field([], go.star(go.qual("pb", msg.name)))];

  if (mappings.length === 0) {
    const body = go.block(go.return_(go.addr(go.elt(go.qual("pb", msg.name)))));
    const decl = go.function_(funcName, params, results, body);
    const sb = new go.StringBuilder();
    go.printDeclaration(sb, decl, 0);
    return sb.toString().trimEnd();
  }

  const kvs: go.KeyValueExpr[] = [];
  for (const m of mappings) {
    if (m.repeated && m.nested) {
      kvs.push(go.kv(m.goName, go.id(buildToProtoClosureStr(m))));
    } else if (m.repeated) {
      kvs.push(go.kv(m.goName, go.sel(go.id("src"), m.goName)));
    } else if (m.nested) {
      kvs.push(
        go.kv(
          m.goName,
          go.call(
            go.id(`${protoTypeToGoStruct(m.protoFieldType)}ToProto`),
            go.sel(go.id("src"), m.goName),
          ),
        ),
      );
    } else {
      kvs.push(go.kv(m.goName, go.sel(go.id("src"), m.goName)));
    }
  }

  const body = go.block(go.return_(go.addr(go.elt(go.qual("pb", msg.name), ...kvs))));
  const decl = go.function_(funcName, params, results, body);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

// ─── generateFromProtoBytesFunc ────────────────────────────

export function generateFromProtoBytesFunc(msg: ProtoMessage): string {
  const funcName = `${msg.name}FromProtoBytes`;
  const params = [go.field(["data"], go.sliceType(go.id("byte")))];
  const results = [go.field([], go.id(msg.name))];
  const body = go.block(
    go.declStmt(go.genDecl("var", go.valueSpec(["src"], go.qual("pb", msg.name)))),
    {
      kind: "IfStmt",
      init: go.def(
        go.id("err"),
        go.call(go.sel(go.id("json"), "Unmarshal"), go.id("data"), go.addr(go.id("src"))),
      ),
      cond: go.binary(go.id("err"), "!=", go.id("nil")),
      body: go.block(go.return_(go.elt(go.id(msg.name)))),
    } as go.IfStmt,
    go.return_(go.call(go.id(`${msg.name}FromProto`), go.addr(go.id("src")))),
  );
  const decl = go.function_(funcName, params, results, body);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}

// ─── generateToProtoBytesFunc ──────────────────────────────

export function generateToProtoBytesFunc(msg: ProtoMessage): string {
  const funcName = `${msg.name}ToProtoBytes`;
  const params = [go.field(["src"], go.id(msg.name))];
  const results = [go.field([], go.sliceType(go.id("byte")))];
  const body = go.block(
    go.def(go.id("dst"), go.call(go.id(`${msg.name}ToProto`), go.id("src"))),
    go.def([go.id("data"), go.id("_")], go.call(go.sel(go.id("json"), "Marshal"), go.id("dst"))),
    go.return_(go.id("data")),
  );
  const decl = go.function_(funcName, params, results, body);
  const sb = new go.StringBuilder();
  go.printDeclaration(sb, decl, 0);
  return sb.toString().trimEnd();
}
