import { describe, it, expect } from "vitest";
import { parseTag, serializeTag, getTag, setTag, removeTag } from "../src/tag.js";

describe("parseTag", () => {
  it("parses a single tag", () => {
    expect(parseTag('json:"name"')).toEqual({ json: "name" });
  });

  it("parses multiple tags", () => {
    expect(parseTag('json:"name" gorm:"column:name"')).toEqual({
      json: "name",
      gorm: "column:name",
    });
  });

  it("parses tags with omitempty", () => {
    expect(parseTag('json:"name,omitempty"')).toEqual({ json: "name,omitempty" });
  });

  it("parses tags with escaped quotes", () => {
    expect(parseTag('json:"na\\"me"')).toEqual({ json: 'na"me' });
  });

  it("parses tags with colons in value", () => {
    expect(parseTag('json:"na:me"')).toEqual({ json: "na:me" });
  });

  it("returns empty object for empty string", () => {
    expect(parseTag("")).toEqual({});
  });
});

describe("serializeTag", () => {
  it("serializes a single key-value pair", () => {
    expect(serializeTag({ json: "name" })).toBe('json:"name"');
  });

  it("serializes multiple key-value pairs", () => {
    expect(serializeTag({ json: "name", gorm: "column:name" })).toBe(
      'json:"name" gorm:"column:name"',
    );
  });

  it("escapes double quotes in values", () => {
    expect(serializeTag({ json: 'na"me' })).toBe('json:"na\\"me"');
  });

  it("escapes backslashes in values", () => {
    expect(serializeTag({ json: "a\\b" })).toBe('json:"a\\\\b"');
  });
});

describe("round-trip", () => {
  const cases: Record<string, string>[] = [
    { json: "name" },
    { json: "name,omitempty" },
    { json: "name", gorm: "column:name" },
    { json: 'na"me' },
    { json: "na:me" },
    { binding: "required" },
    { validate: "max=10,min=2" },
    { json: "a\\b" },
  ];

  it.each(cases)("parseTag(serializeTag(%j)) === %j", (tags) => {
    expect(parseTag(serializeTag(tags))).toEqual(tags);
  });
});

describe("getTag", () => {
  it("returns value for existing key", () => {
    expect(getTag('json:"name"', "json")).toBe("name");
  });

  it("returns undefined for missing key", () => {
    expect(getTag('json:"name"', "gorm")).toBeUndefined();
  });

  it("returns undefined for undefined tag", () => {
    expect(getTag(undefined, "json")).toBeUndefined();
  });

  it("returns undefined for empty string tag", () => {
    expect(getTag("", "json")).toBeUndefined();
  });
});

describe("setTag", () => {
  it("adds a new key to an undefined tag", () => {
    expect(setTag(undefined, "json", "name")).toBe('json:"name"');
  });

  it("overwrites an existing key", () => {
    expect(setTag('json:"old"', "json", "name")).toBe('json:"name"');
  });

  it("preserves other keys", () => {
    const result = setTag('json:"name" gorm:"column:name"', "binding", "required");
    expect(parseTag(result)).toEqual({
      json: "name",
      gorm: "column:name",
      binding: "required",
    });
  });
});

describe("removeTag", () => {
  it("removes a key", () => {
    expect(removeTag('json:"name" gorm:"column:name"', "json")).toBe('gorm:"column:name"');
  });

  it("returns undefined when last key is removed", () => {
    expect(removeTag('json:"name"', "json")).toBeUndefined();
  });

  it("returns undefined for undefined tag", () => {
    expect(removeTag(undefined, "json")).toBeUndefined();
  });
});

describe("edge cases", () => {
  it("handles binding tag", () => {
    expect(parseTag('binding:"required"')).toEqual({ binding: "required" });
  });
});
