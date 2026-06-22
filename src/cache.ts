import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AppAst,
  ArchitectureAst,
  CompilerCache,
  DependencyGraph,
  DependencyNode,
  GenerationAst,
} from "./types.js";
import { stableHash } from "./hash.js";

const CACHE_DIR = ".backend-gen";
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
    return JSON.parse(raw) as CompilerCache;
  } catch {
    return undefined;
  }
}

export function writeCache(cwd: string, cache: CompilerCache): void {
  const dir = cacheDir(cwd);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = cacheFilePath(cwd) + ".tmp";
  writeFileSync(tmp, JSON.stringify(cache, null, 2));
  writeFileSync(cacheFilePath(cwd), JSON.stringify(cache, null, 2));
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

export function buildDependencyGraph(
  ast: AppAst,
  architecture: ArchitectureAst,
  generation: GenerationAst,
): DependencyGraph {
  const nodes: Record<string, DependencyNode> = {};
  const edges: Array<{ from: string; to: string; reason: string }> = [];

  const addNode = (id: string, kind: DependencyNode["kind"], hash: string) => {
    nodes[id] = { id, kind, hash };
  };

  const addEdge = (from: string, to: string, reason: string) => {
    edges.push({ from, to, reason });
  };

  addNode(ast.stableId, "app", stableHash(ast, 16));

  for (const module of ast.modules) {
    addNode(module.stableId, "module", stableHash(module, 16));
    addEdge(ast.stableId, module.stableId, "contains");

    for (const route of module.routes) {
      addNode(route.stableId, "route", stableHash(route, 16));
      addEdge(module.stableId, route.stableId, "contains");

      if (route.query) {
        const schemaId = `${route.stableId}:query`;
        addNode(schemaId, "schema", stableHash(route.query, 16));
        addEdge(route.stableId, schemaId, "has-query-schema");
      }
      if (route.body) {
        const schemaId = `${route.stableId}:body`;
        addNode(schemaId, "schema", stableHash(route.body, 16));
        addEdge(route.stableId, schemaId, "has-body-schema");
      }
      if (route.response) {
        const schemaId = `${route.stableId}:response`;
        addNode(schemaId, "schema", stableHash(route.response, 16));
        addEdge(route.stableId, schemaId, "has-response-schema");
      }
    }
  }

  for (const expansion of architecture.routes) {
    for (const layer of expansion.layers) {
      if (layer.stableId) {
        addNode(layer.stableId, "architecture-layer", stableHash(layer, 16));
        addEdge(expansion.route.stableId, layer.stableId, `has-layer:${layer.kind}`);
        addEdge(layer.stableId, layer.file, "maps-to-file");
      }
    }
  }

  for (const file of generation.files) {
    const fileId = `file:${file.path}`;
    addNode(fileId, "file", stableHash(file, 16));

    for (const region of file.regions) {
      const regionId = region.stableHash ?? `region:${region.id}`;
      addNode(regionId, "generated-region", region.contentHash ?? stableHash(region.content, 16));
      addEdge(fileId, regionId, "contains-region");
    }
  }

  for (const file of generation.files) {
    for (const region of file.regions) {
      const regionStableId = region.stableHash ?? `region:${region.id}`;
      const owner = region.owner;
      if (owner) {
        const adapterNodeId = `adapter:${owner}`;
        if (!nodes[adapterNodeId]) {
          addNode(adapterNodeId, "adapter-target", stableHash(owner, 16));
        }
        addEdge(adapterNodeId, regionStableId, "generates");
      }

      for (const expansion of architecture.routes) {
        for (const layer of expansion.layers) {
          if (layer.regionId === region.id && layer.stableId) {
            addEdge(layer.stableId, regionStableId, "codegen-result");
          }
        }
      }
    }
  }

  return { nodes, edges };
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
