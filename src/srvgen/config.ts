import type { EnvVarInfo, GeneratedFilePatch } from "../types/index.js";
import type { GoModuleInfo } from "../utils/env.js";

export const configFilePath = "internal/config/env.go";

export function generateEnvConfigFile(
  env: Record<string, EnvVarInfo>,
  moduleInfo: GoModuleInfo,
): GeneratedFilePatch | null {
  if (!env || Object.keys(env).length === 0) return null;

  const imports: string[] = [`"os"`];
  let needsStrconv = false;
  let needsStrings = false;

  const structFields: string[] = [];
  const loadLines: string[] = [];

  for (const [key, info] of Object.entries(env)) {
    const fieldName = key;
    let goType: string;
    if (info.type === "string") goType = "string";
    else if (info.type === "number") goType = "int";
    else goType = "bool";

    if (info.description) {
      structFields.push(`\t// ${info.description}`);
    }
    structFields.push(`\t${fieldName} ${goType}`);

    if (key === "PORT") {
      loadLines.push(``);
      loadLines.push(`\tcfg.PORT = os.Getenv("PORT")`);
      if (info.default !== undefined) {
        loadLines.push(`\tif cfg.PORT == "" {`);
        loadLines.push(`\t\tcfg.PORT = "${info.default}"`);
        loadLines.push(`\t}`);
      } else {
        loadLines.push(`\tif cfg.PORT == "" {`);
        loadLines.push(`\t\tlog.Fatal("PORT is required but not set")`);
        loadLines.push(`\t}`);
      }
      needsStrings = true;
      loadLines.push(`\tif !strings.HasPrefix(cfg.PORT, ":") {`);
      loadLines.push(`\t\tcfg.PORT = ":" + cfg.PORT`);
      loadLines.push(`\t}`);
      continue;
    }

    if (info.type === "string") {
      loadLines.push(`\tcfg.${fieldName} = os.Getenv("${key}")`);
      if (info.required) {
        loadLines.push(`\tif cfg.${fieldName} == "" {`);
        loadLines.push(`\t\tlog.Fatal("${key} is required but not set")`);
        loadLines.push(`\t}`);
      } else if (info.default !== undefined) {
        loadLines.push(`\tif cfg.${fieldName} == "" {`);
        loadLines.push(`\t\tcfg.${fieldName} = "${info.default}"`);
        loadLines.push(`\t}`);
      }
    } else if (info.type === "number") {
      needsStrconv = true;
      const defaultVal = info.default ?? "0";
      loadLines.push(`\tcfg.${fieldName} = ${defaultVal}`);
      if (info.required) {
        loadLines.push(`\tif v := os.Getenv("${key}"); v == "" {`);
        loadLines.push(`\t\tlog.Fatal("${key} is required but not set")`);
        loadLines.push(`\t} else if n, err := strconv.Atoi(v); err != nil {`);
        loadLines.push(`\t\tlog.Fatalf("${key}: invalid number %q", v)`);
        loadLines.push(`\t} else {`);
        loadLines.push(`\t\tcfg.${fieldName} = n`);
        loadLines.push(`\t}`);
      } else {
        loadLines.push(`\tif v := os.Getenv("${key}"); v != "" {`);
        loadLines.push(`\t\tif n, err := strconv.Atoi(v); err != nil {`);
        loadLines.push(`\t\t\tlog.Fatalf("${key}: invalid number %q", v)`);
        loadLines.push(`\t\t} else {`);
        loadLines.push(`\t\t\tcfg.${fieldName} = n`);
        loadLines.push(`\t\t}`);
        loadLines.push(`\t}`);
      }
    } else if (info.type === "boolean") {
      needsStrconv = true;
      const defaultVal = info.default ?? "false";
      loadLines.push(`\tcfg.${fieldName} = ${defaultVal}`);
      if (info.required) {
        loadLines.push(`\tif v := os.Getenv("${key}"); v == "" {`);
        loadLines.push(`\t\tlog.Fatal("${key} is required but not set")`);
        loadLines.push(`\t} else if b, err := strconv.ParseBool(v); err != nil {`);
        loadLines.push(`\t\tlog.Fatalf("${key}: invalid boolean %q", v)`);
        loadLines.push(`\t} else {`);
        loadLines.push(`\t\tcfg.${fieldName} = b`);
        loadLines.push(`\t}`);
      } else {
        loadLines.push(`\tif v := os.Getenv("${key}"); v != "" {`);
        loadLines.push(`\t\tif b, err := strconv.ParseBool(v); err != nil {`);
        loadLines.push(`\t\t\tlog.Fatalf("${key}: invalid boolean %q", v)`);
        loadLines.push(`\t\t} else {`);
        loadLines.push(`\t\t\tcfg.${fieldName} = b`);
        loadLines.push(`\t\t}`);
        loadLines.push(`\t}`);
      }
    }
  }

  if (needsStrconv) imports.push(`"strconv"`);
  if (needsStrings) imports.push(`"strings"`);
  imports.push(`"log"`);
  imports.push(`"github.com/joho/godotenv"`);

  return {
    path: configFilePath,
    regions: [
      {
        id: `${configFilePath}.imports`,
        stableHash: `${configFilePath}:imports:${moduleInfo.modulePath}`,
        owner: "schemago",
        language: "go",
        content: `import (\n${imports
          .sort()
          .map((i) => `\t${i}`)
          .join("\n")}\n)`,
        imports,
      },
      {
        id: `${configFilePath}.struct`,
        stableHash: `${configFilePath}:struct:${moduleInfo.modulePath}`,
        owner: "schemago",
        language: "go",
        content: `type Config struct {\n${structFields.join("\n")}\n}`,
        symbolName: "Config",
        kind: "struct",
      },
      {
        id: `${configFilePath}.load`,
        stableHash: `${configFilePath}:load:${moduleInfo.modulePath}`,
        owner: "schemago",
        language: "go",
        content: `\tif err := godotenv.Load(); err != nil {\n\t\tlog.Println(".env file not loaded, using system env vars:", err)\n\t}\n\tvar cfg Config\n${loadLines.join("\n")}\n\treturn cfg`,
        symbolName: "Load",
        kind: "function",
        signature: "func Load() Config",
      },
    ],
  };
}
