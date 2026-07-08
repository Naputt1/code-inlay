import { describe, it, expect } from "vitest";
import type { ProtoMessage } from "../src/targets/proto.js";
import {
  generateStubPbGoContent,
  generateFromProtoFunc,
  generateToProtoFunc,
  generateFromProtoBytesFunc,
  generateToProtoBytesFunc,
} from "../src/targets/proto.js";

describe("goast proto generation", () => {
  it("1. empty struct — no fields", () => {
    const msg: ProtoMessage = { name: "Empty", fields: [] };
    const result = generateStubPbGoContent("pkg", [msg], []);
    expect(result).toContain("type Empty struct{}");
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
    const result = generateStubPbGoContent("pkg", [msg], []);
    expect(result).toContain("Name string");
    expect(result).toContain("IsActive bool");
    expect(result).toContain("Count int32");
  });

  it("3. struct with repeated field", () => {
    const msg: ProtoMessage = {
      name: "Tags",
      fields: [{ name: "tags", protoType: "string", number: 1, repeated: true }],
    };
    const result = generateStubPbGoContent("pkg", [msg], []);
    expect(result).toContain("Tags []string");
  });

  it("4. enum type field", () => {
    const msg: ProtoMessage = {
      name: "Status",
      fields: [{ name: "status", protoType: "StatusEnum", number: 1, repeated: false }],
    };
    const result = generateStubPbGoContent("pkg", [msg], []);
    expect(result).toContain("Status string");
  });

  it("5. float64 (double) field", () => {
    const msg: ProtoMessage = {
      name: "Metrics",
      fields: [{ name: "score", protoType: "double", number: 1, repeated: false }],
    };
    const result = generateStubPbGoContent("pkg", [msg], []);
    expect(result).toContain("Score float64");
  });

  it("6. FromProto with no fields", () => {
    const msg: ProtoMessage = { name: "Empty", fields: [] };
    const result = generateFromProtoFunc(msg, [msg]);
    expect(result).toContain("EmptyFromProto");
    expect(result).toContain("return Empty{}");
  });

  it("7. FromProto with scalar fields", () => {
    const msg: ProtoMessage = {
      name: "Simple",
      fields: [
        { name: "name", protoType: "string", number: 1, repeated: false },
        { name: "count", protoType: "int32", number: 2, repeated: false },
      ],
    };
    const result = generateFromProtoFunc(msg, [msg]);
    expect(result).toContain("src.GetName()");
    expect(result).toContain("src.GetCount()");
  });

  it("8. FromProto with repeated scalar", () => {
    const msg: ProtoMessage = {
      name: "Tags",
      fields: [{ name: "tags", protoType: "string", number: 1, repeated: true }],
    };
    const result = generateFromProtoFunc(msg, [msg]);
    expect(result).toContain("src.GetTags()");
  });

  it("9. FromProto with nested field", () => {
    const inner: ProtoMessage = {
      name: "Inner",
      fields: [{ name: "val", protoType: "string", number: 1, repeated: false }],
    };
    const msg: ProtoMessage = {
      name: "Outer",
      fields: [{ name: "inner", protoType: "Inner", number: 1, repeated: false }],
    };
    const result = generateFromProtoFunc(msg, [inner, msg]);
    expect(result).toContain("InnerFromProto");
  });

  it("10. FromProto with repeated+nested closure", () => {
    const item: ProtoMessage = {
      name: "Item",
      fields: [{ name: "name", protoType: "string", number: 1, repeated: false }],
    };
    const msg: ProtoMessage = {
      name: "ItemList",
      fields: [{ name: "items", protoType: "ItemMsg", number: 1, repeated: true }],
    };
    const result = generateFromProtoFunc(msg, [item, msg]);
    expect(result).toContain("ItemListFromProto");
  });

  it("11. ToProto with no fields", () => {
    const msg: ProtoMessage = { name: "Empty", fields: [] };
    const result = generateToProtoFunc(msg, [msg]);
    expect(result).toContain("EmptyToProto");
    expect(result).toContain("return &pb.Empty{}");
  });

  it("12. ToProto with scalar fields", () => {
    const msg: ProtoMessage = {
      name: "Simple",
      fields: [
        { name: "name", protoType: "string", number: 1, repeated: false },
        { name: "count", protoType: "int32", number: 2, repeated: false },
      ],
    };
    const result = generateToProtoFunc(msg, [msg]);
    expect(result).toContain("src.Name");
    expect(result).toContain("src.Count");
  });

  it("13. ToProto with repeated scalar", () => {
    const msg: ProtoMessage = {
      name: "Tags",
      fields: [{ name: "tags", protoType: "string", number: 1, repeated: true }],
    };
    const result = generateToProtoFunc(msg, [msg]);
    expect(result).toContain("src.Tags");
  });

  it("14. ToProto with nested field", () => {
    const inner: ProtoMessage = {
      name: "Inner",
      fields: [{ name: "val", protoType: "string", number: 1, repeated: false }],
    };
    const msg: ProtoMessage = {
      name: "Outer",
      fields: [{ name: "inner", protoType: "Inner", number: 1, repeated: false }],
    };
    const result = generateToProtoFunc(msg, [inner, msg]);
    expect(result).toContain("InnerToProto(src.Inner)");
  });

  it("15. ToProto with repeated+nested closure", () => {
    const item: ProtoMessage = {
      name: "Item",
      fields: [{ name: "name", protoType: "string", number: 1, repeated: false }],
    };
    const msg: ProtoMessage = {
      name: "ItemList",
      fields: [{ name: "items", protoType: "ItemMsg", number: 1, repeated: true }],
    };
    const result = generateToProtoFunc(msg, [item, msg]);
    expect(result).toContain("ItemListToProto");
  });

  it("16. FromProtoBytes", () => {
    const msg: ProtoMessage = {
      name: "Simple",
      fields: [{ name: "name", protoType: "string", number: 1, repeated: false }],
    };
    const result = generateFromProtoBytesFunc(msg);
    expect(result).toContain("SimpleFromProtoBytes");
    expect(result).toContain("json.Unmarshal");
  });

  it("17. ToProtoBytes", () => {
    const msg: ProtoMessage = {
      name: "Simple",
      fields: [{ name: "name", protoType: "string", number: 1, repeated: false }],
    };
    const result = generateToProtoBytesFunc(msg);
    expect(result).toContain("SimpleToProtoBytes");
    expect(result).toContain("json.Marshal");
  });
});
