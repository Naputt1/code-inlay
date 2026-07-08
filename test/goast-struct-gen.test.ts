import { describe, it, expect } from "vitest";
import type { GoStruct } from "../src/schema/index.js";
import { renderStructLegacy, renderEntityStructLegacy } from "../src/schema/index.js";
import { renderStructAST, renderEntityStructAST } from "../src/schema/goast-render.js";

function compare(struct: GoStruct, responseContext = false) {
  const old_ = renderStructLegacy(struct, responseContext);
  const new_ = renderStructAST(struct, responseContext);
  expect(new_).toBe(old_);
}

function compareEntity(struct: GoStruct) {
  const old_ = renderEntityStructLegacy(struct);
  const new_ = renderEntityStructAST(struct);
  expect(new_).toBe(old_);
}

describe("goast struct generation", () => {
  it("1. basic struct with string field", () => {
    const s: GoStruct = {
      name: "User",
      fields: [{ name: "ID", type: "string", jsonName: "id", optional: false }],
    };
    compare(s, false);
    compare(s, true);
  });

  it("2. basic struct with int, float64, bool fields", () => {
    const s: GoStruct = {
      name: "Product",
      fields: [
        { name: "ID", type: "int64", jsonName: "id", optional: false },
        { name: "Price", type: "float64", jsonName: "price", optional: false },
        { name: "Active", type: "bool", jsonName: "active", optional: false },
      ],
    };
    compare(s, false);
    compare(s, true);
  });

  it("3. optional fields with omitempty", () => {
    const s: GoStruct = {
      name: "Query",
      fields: [
        { name: "Page", type: "int32", jsonName: "page", optional: true },
        { name: "Limit", type: "int32", jsonName: "limit", optional: true },
      ],
    };
    compare(s, false);
    compare(s, true);
  });

  it("4. required field in validate tag", () => {
    const s: GoStruct = {
      name: "LoginBody",
      fields: [
        { name: "Email", type: "string", jsonName: "email", optional: false },
        { name: "Password", type: "string", jsonName: "password", optional: false },
      ],
    };
    compare(s, false);
  });

  it("5. request struct with json + form + validate tags", () => {
    const s: GoStruct = {
      name: "CreateProductRequest",
      fields: [
        {
          name: "Name",
          type: "string",
          jsonName: "name",
          optional: false,
          validations: ["min=1", "max=100"],
        },
        {
          name: "Price",
          type: "float64",
          jsonName: "price",
          optional: false,
          validations: ["gt=0"],
        },
        {
          name: "Category",
          type: "string",
          jsonName: "category",
          optional: false,
          validations: ["oneof=electronics clothing food"],
        },
        { name: "Tags", type: "[]string", jsonName: "tags", optional: true },
        { name: "Active", type: "bool", jsonName: "active", optional: true },
      ],
    };
    compare(s, false);
  });

  it("6. response struct with json-only tags", () => {
    const s: GoStruct = {
      name: "ProductResponse",
      fields: [
        { name: "ID", type: "string", jsonName: "id", optional: false },
        { name: "Name", type: "string", jsonName: "name", optional: false },
        { name: "Price", type: "float64", jsonName: "price", optional: false },
      ],
    };
    compare(s, true);
  });

  it("7. empty struct", () => {
    const s: GoStruct = { name: "Empty", fields: [] };
    compare(s, false);
    compare(s, true);
  });

  it("8. pointer types", () => {
    const s: GoStruct = {
      name: "NullableFields",
      fields: [
        { name: "Name", type: "*string", jsonName: "name", optional: false },
        { name: "Count", type: "*int64", jsonName: "count", optional: false },
        { name: "Price", type: "*float64", jsonName: "price", optional: false },
        { name: "Active", type: "*bool", jsonName: "active", optional: true },
      ],
    };
    compare(s, false);
    compare(s, true);
  });

  it("9. slice types", () => {
    const s: GoStruct = {
      name: "SliceFields",
      fields: [
        { name: "Tags", type: "[]string", jsonName: "tags", optional: false },
        { name: "Scores", type: "[]int64", jsonName: "scores", optional: true },
        { name: "Items", type: "[]*Item", jsonName: "items", optional: false },
      ],
    };
    compare(s, false);
    compare(s, true);
  });

  it("10. map types", () => {
    const s: GoStruct = {
      name: "MapFields",
      fields: [
        { name: "Meta", type: "map[string]string", jsonName: "meta", optional: false },
        { name: "Counts", type: "map[string]int", jsonName: "counts", optional: true },
      ],
    };
    compare(s, false);
    compare(s, true);
  });

  it("11. entity struct - responseContext with json-only tags", () => {
    const s: GoStruct = {
      name: "User",
      fields: [
        { name: "ID", type: "string", jsonName: "id", optional: false },
        { name: "Name", type: "string", jsonName: "name", optional: true },
        { name: "Email", type: "string", jsonName: "email", optional: false },
      ],
    };
    compareEntity(s);
  });

  it("12. entity struct with sub-struct type fields", () => {
    const s: GoStruct = {
      name: "Order",
      fields: [
        { name: "ID", type: "string", jsonName: "id", optional: false },
        {
          name: "ShippingAddress",
          type: "OrderShippingAddress",
          jsonName: "shippingAddress",
          optional: false,
        },
        { name: "Items", type: "[]OrderItemsItem", jsonName: "items", optional: true },
      ],
    };
    compareEntity(s);
  });

  it("13. mixed fields with validation rules", () => {
    const s: GoStruct = {
      name: "RegisterBody",
      fields: [
        {
          name: "Name",
          type: "string",
          jsonName: "name",
          optional: false,
          validations: ["min=2", "max=50"],
        },
        {
          name: "Email",
          type: "string",
          jsonName: "email",
          optional: false,
          validations: ["email"],
        },
        {
          name: "Password",
          type: "string",
          jsonName: "password",
          optional: false,
          validations: ["min=8", "max=100"],
        },
        { name: "ReferralCode", type: "string", jsonName: "referralCode", optional: true },
        {
          name: "Age",
          type: "int32",
          jsonName: "age",
          optional: false,
          validations: ["min=18", "max=120"],
        },
        {
          name: "Role",
          type: "string",
          jsonName: "role",
          optional: false,
          validations: ["oneof=admin user moderator"],
        },
        { name: "Bio", type: "string", jsonName: "bio", optional: true, validations: ["max=500"] },
      ],
    };
    compare(s, false);
  });

  it("14. response struct with optional fields - omitempty in json", () => {
    const s: GoStruct = {
      name: "UserResponse",
      fields: [
        { name: "ID", type: "string", jsonName: "id", optional: false },
        { name: "Nickname", type: "string", jsonName: "nickname", optional: true },
        { name: "Avatar", type: "*string", jsonName: "avatar", optional: true },
      ],
    };
    compare(s, true);
  });

  it("15. qualified types (dot notation)", () => {
    const s: GoStruct = {
      name: "WithQualified",
      fields: [{ name: "CreatedAt", type: "time.Time", jsonName: "createdAt", optional: false }],
    };
    compare(s, false);
    compare(s, true);
  });

  it("16. non-optional field in request without validations adds required", () => {
    const s: GoStruct = {
      name: "SimpleRequest",
      fields: [
        { name: "Name", type: "string", jsonName: "name", optional: false },
        {
          name: "Email",
          type: "string",
          jsonName: "email",
          optional: false,
          validations: ["email"],
        },
        { name: "Description", type: "string", jsonName: "description", optional: true },
      ],
    };
    compare(s, false);
  });
});
