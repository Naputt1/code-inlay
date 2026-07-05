import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "../compiler/compiler.js";
import { readCache } from "../cache/index.js";
import type { ParsedArgs } from "./index.js";

export async function migrateCommand(parsed: ParsedArgs): Promise<void> {
  const cwd = process.cwd();
  const configFile = (parsed.flags.config as string) ?? "backend.config.ts";
  const dryRun = parsed.flags.dryRun === true;
  const configPath = resolve(cwd, configFile);

  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }

  const cache = readCache(cwd);
  const result = await compile({
    configFile,
    cwd,
    dryRun: true,
  });

  if (!cache) {
    console.log("No previous cache found. Run `schemago generate` first.");
    return;
  }

  const oldUsecaseFiles = new Map<string, string[]>();
  for (const [, region] of Object.entries(cache.regions)) {
    if (region.groupKey) {
      const list = oldUsecaseFiles.get(region.file) ?? [];
      list.push(`${region.id} (group: ${region.groupKey})`);
      oldUsecaseFiles.set(region.file, list);
    }
  }

  const newUsecaseFiles = new Map<string, string[]>();
  for (const file of result.generation.files) {
    for (const region of file.regions) {
      if (region.groupKey) {
        const list = newUsecaseFiles.get(file.path) ?? [];
        list.push(`${region.id} (group: ${region.groupKey})`);
        newUsecaseFiles.set(file.path, list);
      }
    }
  }

  let migrationNeeded = false;

  const addedFiles: string[] = [];
  const removedFiles: string[] = [];
  const movedRegions: Array<{ regionId: string; from: string; to: string }> = [];

  for (const [file] of newUsecaseFiles) {
    if (!oldUsecaseFiles.has(file)) {
      addedFiles.push(file);
      migrationNeeded = true;
    }
  }

  for (const [file] of oldUsecaseFiles) {
    if (!newUsecaseFiles.has(file)) {
      removedFiles.push(file);
      migrationNeeded = true;
    }
  }

  const allOldRegionIds = new Map<string, string>();
  for (const [file, regions] of oldUsecaseFiles) {
    for (const r of regions) {
      const id = r.split(" ")[0];
      allOldRegionIds.set(id, file);
    }
  }

  for (const [file, regions] of newUsecaseFiles) {
    for (const r of regions) {
      const id = r.split(" ")[0];
      const oldFile = allOldRegionIds.get(id);
      if (oldFile && oldFile !== file) {
        movedRegions.push({ regionId: id, from: oldFile, to: file });
        migrationNeeded = true;
      }
    }
  }

  if (!migrationNeeded) {
    console.log("No migration needed. Usecase organization is up to date.");
    return;
  }

  console.log("Usecase organization changes detected:\n");

  if (addedFiles.length > 0) {
    console.log("New usecase files to be created:");
    for (const f of addedFiles.sort()) {
      console.log(`  + ${f}`);
      for (const r of newUsecaseFiles.get(f) ?? []) {
        console.log(`      ${r}`);
      }
    }
    console.log();
  }

  if (removedFiles.length > 0) {
    console.log("Use case files with orphaned regions (will be cleaned up):");
    for (const f of removedFiles.sort()) {
      console.log(`  ~ ${f}`);
      for (const r of oldUsecaseFiles.get(f) ?? []) {
        console.log(`      ${r}`);
      }
    }
    console.log();
  }

  if (movedRegions.length > 0) {
    console.log("Regions moving between files:");
    for (const mr of movedRegions) {
      console.log(`  ${mr.regionId}`);
      console.log(`    from: ${mr.from}`);
      console.log(`    to:   ${mr.to}`);
    }
    console.log();
  }

  if (dryRun) {
    console.log("Run with `--dry-run=false` to apply migration.");
  } else {
    console.log("Re-running generation with updates applied...");
    const applyResult = await compile({ configFile, cwd });
    if (applyResult.diagnostics.filter((d) => d.level === "error").length > 0) {
      console.error("Migration completed with errors:");
      for (const d of applyResult.diagnostics) {
        console.error(`  ${d.level}: ${d.message}`);
      }
    } else {
      console.log(`Migration complete. ${applyResult.changedFiles.length} file(s) updated.`);
    }
  }
}
