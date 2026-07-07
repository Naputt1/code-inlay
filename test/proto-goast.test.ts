import { describe, it, expect } from "vitest";
import type { ProtoMessage, ProtoEnum, ProtoField, FieldMapping } from "../src/targets/proto.js";
import {
  generateStubPbGoContent,
  generateStubPbGoContentLegacy,
  generateFromProtoFunc,
  generateFromProtoFuncLegacy,
  generateToProtoFunc,
  generateToProtoFuncLegacy,
  generateFromProtoBytesFunc,
  generateFromProtoBytesFuncLegacy,
  generateToProtoBytesFunc,
  generateToProtoBytesFuncLegacy,
} from "../src/targets/proto.js";

function compareStub(packageName: string, messages: ProtoMessage[], enums: ProtoEnum[]) {
  const old_ = generateStubPbGoContentLegacy(packageName, messages, enums);
  const new_ = generateStubPbGoContent(packageName, messages, enums);
  expect(new_).toBe(old_);
}

function compareFromProto(msg: ProtoMessage, allMessages: ProtoMessage[]) {
  const old_ = generateFromProtoFuncLegacy(msg, allMessages);
  const new_ = generateFromProtoFunc(msg, allMessages);
  expect(new_).toBe(old_);
}

function compareToProto(msg: ProtoMessage, allMessages: ProtoMessage[]) {
  const old_ = generateToProtoFuncLegacy(msg, allMessages);
  const new_ = generateToProtoFunc(msg, allMessages);
  expect(new_).toBe(old_);
}

function compareFromBytes(msg: ProtoMessage) {
  const old_ = generateFromProtoBytesFuncLegacy(msg);
  const new_ = generateFromProtoBytesFunc(msg);
  expect(new_).toBe(old_);
}

function compareToBytes(msg: ProtoMessage) {
  const old_ = generateToProtoBytesFuncLegacy(msg);
  const new_ = generateToProtoBytesFunc(msg);
  expect(new_).toBe(old_);
}

describe("go-ast proto generation", () => {
  it("1. empty struct — no fields", () => {
    const msg: ProtoMessage = { name: "Empty", fields: [] };
    compareStub("pkg", [msg], []);
  });

  it("2. simple struct with string, bool, int32 fields", () => {
    const msg: ProtoMessage = {
      name: "Simple",
      fields: [
        { name: "name", protoType: "string", number: 1, repeated: false },
        { name: "is_active", protoType: "bool", number: 2, repeated: false },
        { name: "count", protoType: "int32", number: 3, repeated: false },
      ],
    };
    compareStub("pkg", [msg], []);
  });

  it("3. struct with repeated field", () => {
    const msg: ProtoMessage = {
      name: "Tags",
      fields: [
        { name: "tags", protoType: "string", number: 1, repeated: true },
      ],
    };
    compareStub("pkg", [msg], []);
  });

  it("4. enum type field", () => {
    const msg: ProtoMessage = {
      name: "Status",
      fields: [
        { name: "status", protoType: "StatusEnum", number: 1, repeated: false },
      ],
    };
    compareStub("pkg", [msg], []);
  });

  it("5. float64 (double) field", () => {
    const msg: ProtoMessage = {
      name: "Metrics",
      fields: [
        { name: "score", protoType: "double", number: 1, repeated: false },
      ],
    };
    compareStub("pkg", [msg], []);
  });

  it("6. FromProto with no fields", () => {
    const msg: ProtoMessage = { name: "Empty", fields: [] };
    compareFromProto(msg, [msg]);
  });

  it("7. FromProto with scalar fields", () => {
    const msg: ProtoMessage = {
      name: "Simple",
      fields: [
        { name: "name", protoType: "string", number: 1, repeated: false },
        { name: "count", protoType: "int32", number: 2, repeated: false },
      ],
    };
    compareFromProto(msg, [msg]);
  });

  it("8. FromProto with repeated scalar", () => {
    const msg: ProtoMessage = {
      name: "Tags",
      fields: [
        { name: "tags", protoType: "string", number: 1, repeated: true },
      ],
    };
    compareFromProto(msg, [msg]);
  });

  it("9. FromProto with nested field", () => {
    const inner: ProtoMessage = { name: "Inner", fields: [{ name: "val", protoType: "string", number: 1, repeated: false }] };
    const msg: ProtoMessage = {
      name: "Outer",
      fields: [
        { name: "inner", protoType: "Inner", number: 1, repeated: false },
      ],
    };
    compareFromProto(msg, [inner, msg]);
  });

  it("10. FromProto with repeated+nested closure", () => {
    const item: ProtoMessage = { name: "Item", fields: [{ name: "name", protoType: "string", number: 1, repeated: false }] };
    const msg: ProtoMessage = {
      name: "ItemList",
      fields: [
        { name: "items", protoType: "ItemMsg", number: 1, repeated: true },
      ],
    };
    compareFromProto(msg, [item, msg]);
  });

  it("11. ToProto with no fields", () => {
    const msg: ProtoMessage = { name: "Empty", fields: [] };
    compareToProto(msg, [msg]);
  });

  it("12. ToProto with scalar fields", () => {
    const msg: ProtoMessage = {
      name: "Simple",
      fields: [
        { name: "name", protoType: "string", number: 1, repeated: false },
        { name: "count", protoType: "int32", number: 2, repeated: false },
      ],
    };
    compareToProto(msg, [msg]);
  });

  it("13. ToProto with repeated scalar", () => {
    const msg: ProtoMessage = {
      name: "Tags",
      fields: [
        { name: "tags", protoType: "string", number: 1, repeated: true },
      ],
    };
    compareToProto(msg, [msg]);
  });

  it("14. ToProto with nested field", () => {
    const inner: ProtoMessage = { name: "Inner", fields: [{ name: "val", protoType: "string", number: 1, repeated: false }] };
    const msg: ProtoMessage = {
      name: "Outer",
      fields: [
        { name: "inner", protoType: "Inner", number: 1, repeated: false },
      ],
    };
    compareToProto(msg, [inner, msg]);
  });

  it("15. ToProto with repeated+nested closure", () => {
    const item: ProtoMessage = { name: "Item", fields: [{ name: "name", protoType: "string", number: 1, repeated: false }] };
    const msg: ProtoMessage = {
      name: "ItemList",
      fields: [
        { name: "items", protoType: "ItemMsg", number: 1, repeated: true },
      ],
    };
    compareToProto(msg, [item, msg]);
  });

  it("16. FromProtoBytes", () => {
    const msg: ProtoMessage = { name: "Simple", fields: [{ name: "name", protoType: "string", number: 1, repeated: false }] };
    compareFromBytes(msg);
  });

  it("17. ToProtoBytes", () => {
    const msg: ProtoMessage = { name: "Simple", fields: [{ name: "name", protoType: "string", number: 1, repeated: false }] };
    compareToBytes(msg);
  });
});
