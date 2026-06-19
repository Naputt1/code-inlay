import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  compile,
  defineApp,
  defineModule,
  defineRoute,
  defineRouter,
  type InferInput,
} from "../src/index.js";

describe("compiler", () => {
  it("generates deterministic clean architecture patches", async () => {
    const route = defineRoute({
      id: "create",
      method: "POST",
      path: "/users",
      input: z.object({ name: z.string(), active: z.boolean().optional() }),
      response: z.object({ id: z.string() }),
      handler: "CreateUser",
    });
    type Input = InferInput<typeof route>;
    const input: Input = { name: "Ada" };

    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin", prefix: "/api" }),
      modules: [defineModule({ name: "user", routes: [route] })],
    });

    const first = await compile({ app, dryRun: true });
    const second = await compile({ app, dryRun: true });

    expect(input.name).toBe("Ada");
    expect(first.diagnostics.filter((diagnostic) => diagnostic.level === "error")).toEqual([]);
    expect(first.generation).toEqual(second.generation);
    expect(first.architecture?.routes[0]?.layers.map((layer) => layer.kind)).toEqual([
      "types",
      "domain",
      "repository",
      "usecase",
      "handler",
    ]);
  });

  it("injects generated regions into existing files only", async () => {
    const cwd = join(tmpdir(), `backend-gen-${Date.now()}`);
    mkdirSync(join(cwd, "internal/user"), { recursive: true });
    mkdirSync(join(cwd, "internal/http"), { recursive: true });
    writeFileSync(
      join(cwd, "internal/user/types.go"),
      [
        "package user",
        "",
        "// @gen:start user.create.domain",
        "// @gen:end user.create.domain",
        "",
        "// @gen:start user.create.types",
        "// @gen:end user.create.types",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "internal/user/repo.go"),
      ["package user", "", "// @gen:start user.create.repository", "// @gen:end user.create.repository", ""].join("\n"),
    );
    writeFileSync(
      join(cwd, "internal/user/usecase.go"),
      ["package user", "", "// @gen:start user.create.usecase", "// @gen:end user.create.usecase", ""].join("\n"),
    );
    writeFileSync(
      join(cwd, "internal/user/handler.go"),
      [
        "package user",
        "",
        "// @gen:start user.0handler.struct",
        "// @gen:end user.0handler.struct",
        "",
        "func Manual() {}",
        "",
        "// @gen:start user.create.handler",
        "// @gen:end user.create.handler",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "internal/http/routes.go"),
      [
        "package http",
        "",
        "// @gen:start user.create.route",
        "// @gen:end user.create.route",
        "",
      ].join("\n"),
    );

    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin", prefix: "/api" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({
              id: "create",
              method: "POST",
              path: "/users",
              input: z.object({ name: z.string() }),
              handler: "CreateUser",
            }),
          ],
        }),
      ],
    });

    const result = await compile({ app, cwd });
    const handler = readFileSync(join(cwd, "internal/user/handler.go"), "utf8");

    expect(result.diagnostics.filter((diagnostic) => diagnostic.level === "error")).toEqual([]);
    expect(result.changedFiles.sort()).toEqual([
      "internal/http/routes.go",
      "internal/user/handler.go",
      "internal/user/repo.go",
      "internal/user/types.go",
      "internal/user/usecase.go",
    ]);
    expect(handler).toContain("func Manual() {}");
    expect(handler).toContain("type UserHandler struct");
    expect(handler).toContain("CreateUserUsecase CreateUserUsecase");
    expect(handler).toContain("func (h *UserHandler) CreateUser(c *gin.Context)");
  });

  it("filters partial generation by module and route", async () => {
    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin" }),
      modules: [
        defineModule({
          name: "user",
          routes: [
            defineRoute({ id: "create", method: "POST", path: "/users", handler: "CreateUser" }),
            defineRoute({ id: "delete", method: "DELETE", path: "/users/:id", handler: "DeleteUser" }),
          ],
        }),
      ],
    });

    const result = await compile({ app, module: "user", route: "delete", dryRun: true });
    const regionIds = result.generation.files.flatMap((file) => file.regions.map((region) => region.id));

    expect(regionIds.every((id) => !id.includes("user.create"))).toBe(true);
  });
});
