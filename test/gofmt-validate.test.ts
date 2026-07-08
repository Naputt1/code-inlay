import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  z,
  compile,
  defineApp,
  defineModule,
  defineRoute,
  defineRouteGroup,
  defineRouter,
  defineService,
  defineServiceExtension,
  defineMiddleware,
  defineEnv,
  defineRuntime,
  defineCors,
  HttpStatus,
} from "../src/index.js";

type Region = {
  id: string;
  content: string;
  signature?: string;
  kind?: string;
  imports?: string[];
};

function goPackageName(path: string): string | undefined {
  if (path.startsWith("cmd/")) return "main";
  const parts = path.split("/");
  const idx = parts.indexOf("internal");
  if (idx !== -1 && idx + 1 < parts.length) return parts[idx + 1];
  if (parts[0] === "pkg" && parts.length >= 2) return parts[1];
  return undefined;
}

function regionSortKey(r: Region): string {
  if (r.kind === "imports") return "0";
  return `1:${r.id}`;
}

function regionContent(region: Region): string {
  if (region.kind === "imports" && region.imports && region.imports.length > 0) {
    const stdlib = region.imports.filter((i) => !i.includes("."));
    const thirdParty = region.imports.filter((i) => i.includes("."));
    const sorted = [...stdlib.sort(), "", ...thirdParty.sort()];
    return `import (\n${sorted.map((i) => `\t"${i}"`).join("\n")}\n)`;
  }
  if (region.signature) {
    const body = region.content.replace(/^\n+/, "").replace(/\n+$/, "");
    return `${region.signature} {\n${body}\n}`;
  }
  return region.content.trim();
}

function toCleanContent(path: string, regions: Region[]): string {
  const sorted = [...regions].sort(
    (a, b) => regionSortKey(a).localeCompare(regionSortKey(b)) || a.id.localeCompare(b.id),
  );
  const body = sorted
    .map((r) => regionContent(r))
    .join("\n\n")
    .trimStart();
  if (!path.endsWith(".go")) return `${body}\n`;
  if (body.startsWith("package ")) return `${body}\n`;
  return `package ${goPackageName(path) ?? "main"}\n\n${body}\n`;
}

describe("gofmt validation", () => {
  it("all generated Go files pass gofmt", { timeout: 60000 }, async () => {
    const jwtAuth = defineMiddleware({ name: "JwtAuth" });
    const adminAuth = defineMiddleware({ name: "AdminAuth" });
    const gorm = defineServiceExtension({
      name: "gorm",
      service: {
        provides: "database",
        optionsSchema: z.object({ driver: z.enum(["mysql", "postgres", "sqlite"]) }),
        dbAccessor: "DB",
        dbType: "*gorm.DB",
        dbTypePkg: "gorm.io/gorm",
      },
    });

    const app = defineApp({
      env: defineEnv({
        DATABASE_URL: z.string().describe("PostgreSQL connection string"),
        REDIS_URL: z.string().optional(),
      }),
      router: defineRouter({
        adapter: "gin",
        cors: defineCors({ allowOrigins: ["*"], allowMethods: ["GET"], allowHeaders: ["*"] }),
        middleware: [jwtAuth, adminAuth],
      }),
      extensions: [gorm],
      services: {
        mygorm: gorm({ driver: "sqlite" }),
        paymentsvc: defineService({}),
      },
      modules: [
        defineModule({
          name: "user",
          services: ["mygorm"],
          routes: [
            defineRoute({ method: "GET", path: "/users", handler: "ListUsers" }),
            ...defineRouteGroup({
              prefix: "/users/:id",
              routes: [
                defineRoute({ method: "GET", path: "", handler: "GetUser" }),
                defineRoute({ method: "PUT", path: "", handler: "UpdateUser" }),
                defineRoute({ method: "DELETE", path: "", handler: "DeleteUser" }),
              ],
            }),
          ],
        }),
        defineModule({
          name: "auth",
          routes: [
            defineRoute({ method: "POST", path: "/auth/login", handler: "Login" }),
            defineRoute({ method: "POST", path: "/auth/register", handler: "Register" }),
          ],
        }),
        defineModule({
          name: "payment",
          services: ["paymentsvc"],
          routes: [
            defineRoute({ method: "POST", path: "/payments", handler: "ProcessPayment" }),
          ],
        }),
      ],
      runtime: defineRuntime({
        enabled: true,
        logger: { provider: "slog", level: "info", format: "json" },
      }),
      metadata: { enabled: true, routeRegistry: true, schemaReflection: false },
    });

    const result = await compile({ app, dryRun: true });

    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const tmpDir = mkdtempSync(join(tmpdir(), "gofmt-test-"));
    const failures: Array<{ path: string; stderr: string; preview?: string }> = [];

    try {
      for (const file of result.generation.files) {
        if (!file.path.endsWith(".go")) continue;

        const content = toCleanContent(
          file.path,
          file.regions.map((r) => ({
            id: r.id,
            content: r.content,
            signature: r.signature,
            kind: r.kind,
            imports: r.imports,
          })),
        );

        // write the full file content to a temp file
        const absPath = join(tmpDir, file.path);
        const dir = join(tmpDir, file.path.split("/").slice(0, -1).join("/"));
        const { mkdirSync } = await import("node:fs");
        mkdirSync(dir, { recursive: true });
        writeFileSync(absPath, content, "utf8");

        const gofmt = spawnSync("gofmt", ["-e", absPath], { encoding: "utf8" });
        if (gofmt.status !== 0) {
          const lines = content.split("\n");
          const preview = lines.slice(0, Math.min(6, lines.length)).join("\n");
          failures.push({ path: file.path, stderr: gofmt.stderr?.trim() || "gofmt failed", preview });
        }
      }

      if (failures.length > 0) {
        const msg = failures
          .map((f) => `  ${f.path}:\n    stderr: ${f.stderr.replace(/\n/g, "\n    ")}`)
          .join("\n");
        const firstPreview = failures[0].preview ? `\n  first file content:\n    ${failures[0].preview.replace(/\n/g, "\n    ")}` : "";
        expect.fail(`gofmt failures (${failures.length}/${result.generation.files.filter(f => f.path.endsWith('.go')).length} files):\n${msg}${firstPreview}`);
      }
    } catch (e) {
      // ignore cleanup errors
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
