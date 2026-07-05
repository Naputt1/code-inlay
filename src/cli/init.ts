import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { ParsedArgs } from "./index.js";

export async function initCommand(parsed: ParsedArgs): Promise<void> {
  const cwd = (parsed.flags.cwd as string) ?? process.cwd();
  const projectDir = parsed.args[0] ?? ".";

  const targetDir = resolve(cwd, projectDir);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const configContent = `import { z, defineRoute, defineRouter, defineApp, defineEnv } from "@schemago/schemago";

const listItems = defineRoute({
  id: "listItems",
  method: "GET",
  path: "/items",
  response: z.object({
    items: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })),
  }),
  handler: "ListItems",
});

const app = defineApp({
  // Uncomment to define env vars used at runtime:
  // env: defineEnv({
  //   PORT: z.string().default("8080").describe("Server listen port"),
  //   DB_URL: z.string().describe("Database URL"),
  // }),
  architecture: "clean",
  router: defineRouter({ adapter: "gin" }),
});

app.defineModule({ name: "items", routes: [listItems] });

export default app;
`;

  const configPath = resolve(targetDir, "backend.config.ts");

  if (!existsSync(configPath)) {
    writeFileSync(configPath, configContent);
    console.log(`Created: ${configPath}`);
  } else {
    console.log(`Skipped (exists): ${configPath}`);
  }

  const goModPath = resolve(targetDir, "go.mod");
  if (!existsSync(goModPath)) {
    const name = basename(targetDir);
    const result = spawnSync("go", ["mod", "init", name], {
      cwd: targetDir,
      stdio: "pipe",
      encoding: "utf8",
    });
    if (result.status === 0) {
      console.log(`Created: ${goModPath}`);
    } else {
      console.error(
        `Failed to run "go mod init ${name}": ${(result.stderr || result.stdout || "unknown error").trim()}`,
      );
    }
  }

  console.log(`Config file created. Run \`schemago generate\` to generate code.`);
}
