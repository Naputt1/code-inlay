import { dirname, join, resolve } from "node:path";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
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
  defineResponseFormat,
  defineMiddleware,
} from "../src/index.js";

const SNAPSHOT_DIR = resolve(process.cwd(), "sample-project/snapshot");
const CONFIG_FILE = "backend.config.ts";
const UPDATE = process.env.UPDATE_SNAPSHOT === "true";

type Region = { id: string; content: string; signature?: string; kind?: string; imports?: string[] };

function goPackageName(path: string): string | undefined {
  if (path.startsWith("cmd/")) return "main";
  const parts = path.split("/");
  const idx = parts.indexOf("internal");
  if (idx === -1 || idx + 1 >= parts.length) return undefined;
  return parts[idx + 1];
}

function regionSortKey(r: Region): string {
  if (r.kind === "imports") return "0";
  if (r.kind === "interface") return "1";
  if (r.kind === "struct" || r.kind === "type") return "2";
  if (r.kind === "const" || r.kind === "var") return "3";
  if (r.signature) return "4";
  return "9";
}

function regionContent(region: Region): string {
  if (region.kind === "imports") {
    if (region.imports && region.imports.length > 0 && !region.imports.some((i) => /^(func|type|var|const)\s/.test(i))) {
      const lines: string[] = ["import ("];
      for (const imp of region.imports) {
        if (imp.includes('"')) {
          lines.push(`\t${imp}`);
        } else {
          lines.push(`\t"${imp}"`);
        }
      }
      lines.push(")");
      return lines.join("\n");
    }
    const body = region.content
      .split("\n")
      .filter((l) => !/^\s*\/\/\s*@gen:(start|end)\b/.test(l))
      .join("\n");
    return body.trim();
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
  const body = sorted.map((r) => regionContent(r)).join("\n\n").trimStart();
  if (!path.endsWith(".go")) return `${body}\n`;
  const pkg = goPackageName(path);
  return pkg ? `package ${pkg}\n\n${body}\n` : `${body}\n`;
}

function writeGenerated(outputDir: string, files: { path: string; regions: Region[] }[]) {
  for (const file of files) {
    const filePath = join(outputDir, file.path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, toCleanContent(file.path, file.regions), "utf8");
  }
}

function collectFiles(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  function walk(current: string, relative: string) {
    const entries = readdirSync(current, { withFileTypes: true }) as unknown as {
      name: string;
      isDirectory: () => boolean;
      isFile: () => boolean;
    }[];
    for (const entry of entries) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const abs = join(current, entry.name);
      if (entry.isFile()) {
        result[rel] = readFileSync(abs, "utf8");
      } else if (entry.isDirectory()) {
        walk(abs, rel);
      }
    }
  }
  walk(dir, "");
  return result;
}

function removeOldGenerated(baseDir: string) {
  for (const dir of ["internal", "clients", "docs", "cmd"]) {
    const full = join(baseDir, dir);
    if (existsSync(full)) rmSync(full, { recursive: true, force: true });
  }
}

describe("full pipeline snapshot", () => {
  it("generates expected output for complex API config", { timeout: 30000 }, async () => {
    const jwtAuth = defineMiddleware({ name: "JwtAuth" });
    const adminAuth = defineMiddleware({ name: "AdminAuth" });

    const stdFormat = defineResponseFormat({
      wrapper: z.object({
        status: z.boolean(),
        data: z.entity(),
      }),
    });

    const orderFormat = defineResponseFormat({
      wrapper: z.object({
        success: z.boolean(),
        result: z.entity(),
      }),
    });

    const productRoutes = defineRouteGroup({
      prefix: "/products",
      middleware: [jwtAuth],
      routes: [
        defineRoute({
          id: "create",
          method: "POST",
          path: "",
          body: z.object({
            name: z.string().min(1).max(100),
            price: z.number().positive(),
            category: z.enum(["electronics", "clothing", "food"]),
            tags: z.array(z.string()).optional(),
            active: z.boolean().optional(),
            metadata: z.object({}).passthrough().optional(),
          }),
          response: z.object({
            id: z.string(),
            name: z.string(),
            price: z.number(),
          }),
          handler: "CreateProduct",
        }),
        defineRoute({
          id: "list",
          method: "GET",
          path: "",
          query: z.object({
            page: z.int32().optional(),
            limit: z.int32().optional(),
            category: z.string().optional(),
          }),
          response: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              price: z.number(),
              category: z.string(),
            }),
          ),
          handler: "ListProducts",
        }),
        defineRoute({
          id: "get",
          method: "GET",
          path: "/:id",
          response: z.object({
            id: z.string(),
            name: z.string(),
            price: z.number(),
            category: z.string(),
            tags: z.array(z.string()).optional(),
            description: z.string().optional(),
            ratings: z
              .array(
                z.object({
                  userId: z.string(),
                  score: z.int32(),
                  comment: z.string().optional(),
                }),
              )
              .optional(),
          }),
          handler: "GetProduct",
        }),
        defineRoute({
          id: "update",
          method: "PUT",
          path: "/:id",
          body: z.object({
            name: z.string().min(1).max(100).optional(),
            price: z.number().positive().optional(),
            category: z.enum(["electronics", "clothing", "food"]).optional(),
            tags: z.array(z.string()).optional(),
            active: z.boolean().optional(),
            metadata: z.object({}).passthrough().optional(),
          }),
          handler: "UpdateProduct",
        }),
        defineRoute({
          id: "remove",
          method: "DELETE",
          path: "/:id",
          query: z.object({ reason: z.string().optional() }),
          handler: "RemoveProduct",
        }),
      ],
    });

    const orderRoutes = defineRouteGroup({
      prefix: "/orders",
      middleware: [jwtAuth],
      routes: [
        defineRoute({
          id: "create",
          method: "POST",
          path: "",
          body: z.object({
            productId: z.string(),
            quantity: z.int32(),
            shippingAddress: z.object({
              street: z.string(),
              city: z.string(),
              zipCode: z.string(),
              country: z.string().optional(),
            }),
            notes: z.string().max(500).optional(),
            couponCode: z.string().optional(),
          }),
          response: z.object({
            id: z.string(),
            totalPrice: z.number(),
            status: z.string(),
            estimatedDelivery: z.int64().optional(),
          }),
          responseFormat: orderFormat,
          handler: "CreateOrder",
        }),
        defineRoute({
          id: "list",
          method: "GET",
          path: "",
          query: z.object({
            page: z.int32().optional(),
            pageSize: z.int32().optional(),
            status: z.string().optional(),
          }),
          response: z.array(
            z.object({
              id: z.string(),
              totalPrice: z.number(),
              status: z.string(),
              createdAt: z.string(),
              itemCount: z.int32(),
            }),
          ),
          responseFormat: orderFormat,
          handler: "ListOrders",
        }),
        defineRoute({
          id: "get",
          method: "GET",
          path: "/:id",
          response: z.object({
            id: z.string(),
            totalPrice: z.number(),
            status: z.string(),
            items: z.array(
              z.object({
                productId: z.string(),
                productName: z.string(),
                quantity: z.int32(),
                unitPrice: z.number(),
              }),
            ),
            shippingAddress: z.object({
              street: z.string(),
              city: z.string(),
              zipCode: z.string(),
            }),
            createdAt: z.string(),
            updatedAt: z.string().optional(),
          }),
          responseFormat: orderFormat,
          handler: "GetOrder",
        }),
        defineRoute({
          id: "cancel",
          method: "POST",
          path: "/:id/cancel",
          body: z.object({ reason: z.string().optional() }),
          handler: "CancelOrder",
        }),
      ],
    });

    const adminOrderRoutes = defineRouteGroup({
      prefix: "/orders",
      middleware: [jwtAuth, adminAuth],
      routes: [
        defineRoute({
          id: "adminListAll",
          method: "GET",
          path: "/admin/all",
          query: z.object({
            page: z.int32().optional(),
            pageSize: z.int32().optional(),
          }),
          response: z.array(
            z.object({
              id: z.string(),
              totalPrice: z.number(),
              status: z.string(),
              userId: z.string(),
            }),
          ),
          responseFormat: orderFormat,
          handler: "AdminListAllOrders",
        }),
      ],
    });

    const authRoutes = defineRouteGroup({
      prefix: "/auth",
      routes: [
        defineRoute({
          id: "login",
          method: "POST",
          path: "/login",
          body: z.object({
            email: z.string().email(),
            password: z.string().min(8),
          }),
          response: z.object({
            token: z.string(),
            user: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string(),
              roles: z.array(z.string()),
            }),
          }),
          handler: "Login",
        }),
        defineRoute({
          id: "logout",
          method: "POST",
          path: "/logout",
          handler: "Logout",
        }),
        defineRoute({
          id: "register",
          method: "POST",
          path: "/register",
          body: z.object({
            name: z.string().min(2).max(50),
            email: z.string().email(),
            password: z.string().min(8).max(100),
            referralCode: z.string().optional(),
          }),
          response: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            createdAt: z.string(),
          }),
          handler: "Register",
        }),
      ],
    });

    const gorm = defineServiceExtension({
      name: "gorm",
      service: {
        provides: "database",
        optionsSchema: z.object({
          driver: z.enum(["mysql", "postgres", "sqlite"]),
        }),
        dbAccessor: "DB",
        dbType: "*gorm.DB",
        dbTypePkg: "gorm.io/gorm",
      },
    });

    const app = defineApp({
      architecture: "clean",
      router: defineRouter({ adapter: "gin", prefix: "/api/v1" }),
      extensions: [gorm],
      services: [
        gorm({ name: "mygorm", driver: "sqlite", close: true }),
        defineService({ name: "redis", close: true }),
      ],
      modules: [
        defineModule({
          name: "products",
          services: ["mygorm"],
          routes: productRoutes,
        }),
        defineModule({
          name: "orders",
          services: ["mygorm", "redis"],
          routes: [...orderRoutes, ...adminOrderRoutes],
        }),
        defineModule({
          name: "auth",
          routes: authRoutes,
        }),
      ],
      metadata: { enabled: true, routeRegistry: true, schemaReflection: false },
      options: {
        responseFormat: stdFormat,
        fileCreation: "skeleton",
        targets: ["go-server", "ts-client", "openapi"],
        targetOptions: {
          "ts-client": { outputDir: "clients" },
          openapi: { title: "Store API", version: "1.0.0" },
        },
      },
    });

    const result = await compile({ app, configFile: CONFIG_FILE, cwd: SNAPSHOT_DIR, dryRun: true });

    expect(result.diagnostics.filter((d) => d.level === "error")).toEqual([]);

    const genFiles = result.generation.files.map((f) => ({
      path: f.path,
      regions: f.regions.map((r) => ({
        id: r.id,
        content: r.content,
        signature: r.signature,
        kind: r.kind,
        imports: r.imports,
      })),
    }));

    if (UPDATE) {
      removeOldGenerated(SNAPSHOT_DIR);
      writeGenerated(SNAPSHOT_DIR, genFiles);
      const { spawnSync } = await import("node:child_process");
      spawnSync("go", ["mod", "tidy"], { cwd: SNAPSHOT_DIR, stdio: "pipe", encoding: "utf8" });
    } else {
      const tempDir = join(tmpdir(), `snapshot-test-${Date.now()}`);
      writeGenerated(tempDir, genFiles);

      const actualFiles = collectFiles(tempDir);
      const expectedFiles = collectFiles(SNAPSHOT_DIR);

      for (const key of Object.keys(expectedFiles)) {
        if (
          key === "backend.config.ts" ||
          key === ".gitignore" ||
          key.startsWith("go.") ||
          key.startsWith(".backend-gen/")
        ) {
          delete expectedFiles[key];
        }
      }

      const actualPaths = Object.keys(actualFiles).sort();
      const expectedPaths = Object.keys(expectedFiles).sort();
      expect(actualPaths).toEqual(expectedPaths);

      for (const filePath of actualPaths) {
        expect(actualFiles[filePath]).toEqual(expectedFiles[filePath]);
      }
    }
  });
});
