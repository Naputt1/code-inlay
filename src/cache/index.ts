import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  CompilerCache,
  CachedSymbol,
  DependencyGraph,
  GenerationAst,
} from "../types/index.js";
import { stableHash } from "../utils/hash.js";
export { buildDependencyGraph } from "./graph.js";

const CACHE_DIR = ".schemago";
const CACHE_FILE = "cache.json";

export function cacheDir(cwd: string): string {
  return resolve(cwd, CACHE_DIR);
}

export function cacheFilePath(cwd: string): string {
  return resolve(cacheDir(cwd), CACHE_FILE);
}

export function readCache(cwd: string): CompilerCache | undefined {
  const path = cacheFilePath(cwd);
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as CompilerCache;
    return migrateCache(parsed);
  } catch {
    return undefined;
  }
}

function migrateCache(cache: CompilerCache): CompilerCache {
  if (!cache.symbols) cache.symbols = {};
  if (!cache.symbolsByFile) cache.symbolsByFile = {};
  if (cache.files) {
    for (const [, info] of Object.entries(cache.files)) {
      if (!info.symbols) info.symbols = [];
    }
  }
  return cache;
}

export function writeCache(cwd: string, cache: CompilerCache): void {
  const dir = cacheDir(cwd);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = cacheFilePath(cwd) + ".tmp";
  writeFileSync(tmp, JSON.stringify(cache, null, 2));
  renameSync(tmp, cacheFilePath(cwd));
}

export function validateCache(
  cache: CompilerCache | undefined,
  compilerVersion: string,
  astVersion: string,
  pluginManifestHash: string,
): boolean {
  if (!cache) return false;
  return (
    cache.compilerVersion === compilerVersion &&
    cache.astVersion === astVersion &&
    cache.pluginManifestHash === pluginManifestHash
  );
}

export function buildSymbolsCache(generation: GenerationAst): {
  symbols: Record<string, CachedSymbol>;
  symbolsByFile: Record<string, Record<string, string>>;
} {
  const symbols: Record<string, CachedSymbol> = {};
  const symbolsByFile: Record<string, Record<string, string>> = {};

  for (const file of generation.files) {
    for (const region of file.regions) {
      if (!region.symbolName) continue;

      const shortHash = region.stableHash
        ? region.stableHash.slice(0, 8)
        : stableHash(region.id, 8);
      const key = region.stableHash ?? region.id;

      symbols[key] = {
        stableHash: region.stableHash ?? key,
        shortHash,
        contentHash: region.contentHash ?? "",
        symbolName: region.symbolName,
        kind: region.kind ?? "function",
        file: file.path,
        owner: region.owner,
        expectsUserCode: region.expectsUserCode,
        isStub: region.isStub,
        imports: region.imports,
        signature: region.signature,
        receiver: region.receiver,
      };

      let byFile = symbolsByFile[file.path];
      if (!byFile) {
        byFile = {};
        symbolsByFile[file.path] = byFile;
      }
      byFile[region.symbolName] = key;
    }
  }

  return { symbols, symbolsByFile };
}

export function invalidateChanged(
  prev: CompilerCache,
  current: DependencyGraph,
  changedFiles?: string[],
): Set<string> {
  const invalid = new Set<string>();

  const changedPaths = new Set(changedFiles ?? []);
  for (const [nodeId, node] of Object.entries(current.nodes)) {
    const prevNode = prev.dependencyGraph.nodes[nodeId];
    if (!prevNode || prevNode.hash !== node.hash) {
      invalid.add(nodeId);
    }
  }

  for (const [nodeId] of Object.entries(prev.dependencyGraph.nodes)) {
    if (!current.nodes[nodeId]) {
      invalid.add(nodeId);
    }
  }

  if (changedPaths.size > 0) {
    for (const [nodeId, node] of Object.entries(prev.dependencyGraph.nodes)) {
      if (node.kind === "file") {
        const filePath = nodeId.replace(/^file:/, "");
        if (changedPaths.has(filePath)) {
          invalid.add(nodeId);

          for (const edge of prev.dependencyGraph.edges) {
            if (edge.from === nodeId || edge.to === nodeId) {
              invalid.add(edge.from === nodeId ? edge.to : edge.from);
            }
          }
        }
      }
    }
  }

  for (const edge of prev.dependencyGraph.edges) {
    if (invalid.has(edge.from)) {
      invalid.add(edge.to);
    }
  }

  return invalid;
}
