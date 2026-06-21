import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ParsedArgs } from "./index.js";

export async function initCommand(parsed: ParsedArgs): Promise<void> {
  const cwd = (parsed.flags.cwd as string) ?? process.cwd();
  const projectDir = parsed.args[0] ?? ".";

  const targetDir = resolve(cwd, projectDir);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const configContent = `import { z, defineRoute, defineModule, defineRouter, defineApp } from "@code-inlay/backend-gen";

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

export default defineApp({
  architecture: "clean",
  router: defineRouter({ adapter: "gin" }),
  modules: [
    defineModule({ name: "items", routes: [listItems] }),
  ],
});
`;

  const goModContent = `module ${projectDir === "." ? "my-api" : projectDir}

go 1.26
`;

  const mainGoContent = `package main

import (
	"log"
	"net/http"
	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	// Routes will be generated here

	log.Println("Starting server on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}
`;

  const configPath = resolve(targetDir, "backend.config.ts");
  const goModPath = resolve(targetDir, "go.mod");
  const mainGoPath = resolve(targetDir, "cmd/server/main.go");

  if (!existsSync(configPath)) {
    writeFileSync(configPath, configContent);
    console.log(`Created: ${configPath}`);
  } else {
    console.log(`Skipped (exists): ${configPath}`);
  }

  if (!existsSync(goModPath)) {
    writeFileSync(goModPath, goModContent);
    console.log(`Created: ${goModPath}`);
  }

  if (!existsSync(mainGoPath)) {
    const mainDir = resolve(targetDir, "cmd/server");
    if (!existsSync(mainDir)) mkdirSync(mainDir, { recursive: true });
    writeFileSync(mainGoPath, mainGoContent);
    console.log(`Created: ${mainGoPath}`);
  }

  console.log(`\nProject initialized. Run:
  cd ${projectDir}
  go mod init my-api
  backend-gen generate
`);
}
