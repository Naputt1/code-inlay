import type {
  AppAst,
  ArchitectureAst,
  DependencyGraph,
  GeneratedFilePatch,
} from "./types.js";
import { buildDependencyGraph } from "./cache.js";

export type GraphFormat = "tree" | "mermaid" | "json";

export function renderGraph(
  ast: AppAst,
  architecture: ArchitectureAst,
  generation: { files: GeneratedFilePatch[] },
  format: GraphFormat = "tree",
): string {
  const graph = buildDependencyGraph(ast, architecture, generation);

  switch (format) {
    case "json":
      return renderJsonGraph(graph);
    case "mermaid":
      return renderMermaidGraph(ast, architecture, graph);
    case "tree":
      return renderTreeGraph(ast, architecture, graph);
  }
}

function renderJsonGraph(graph: DependencyGraph): string {
  return JSON.stringify(graph, null, 2);
}

function renderMermaidGraph(
  ast: AppAst,
  architecture: ArchitectureAst,
  graph: DependencyGraph,
): string {
  const lines: string[] = [];
  lines.push("graph TD");

  for (const module of ast.modules) {
    const moduleId = sanitizeMermaidId(`mod_${module.name}`);
    lines.push(`  ${moduleId}["Module: ${module.name}"]`);
    lines.push(`  APP["App"] --> ${moduleId}`);

    for (const route of module.routes) {
      const routeId = sanitizeMermaidId(`route_${module.name}_${route.id}`);
      lines.push(`  ${routeId}["${route.method} ${route.fullPath}"]`);
      lines.push(`  ${moduleId} --> ${routeId}`);
    }
  }

  for (const expansion of architecture.routes) {
    for (const layer of expansion.layers) {
      const layerId = sanitizeMermaidId(`layer_${layer.regionId}`);
      const fileLabel = layer.file.split("/").pop() ?? layer.file;
      lines.push(`  ${layerId}["${layer.kind} (${fileLabel})"]`);
      const routeId = sanitizeMermaidId(
        `route_${expansion.route.moduleName}_${expansion.route.id}`,
      );
      lines.push(`  ${routeId} -.-> ${layerId}`);
    }
  }

  return lines.join("\n");
}

function renderTreeGraph(
  ast: AppAst,
  architecture: ArchitectureAst,
  graph: DependencyGraph,
): string {
  const lines: string[] = [];
  lines.push(`App: ${ast.id}`);

  for (const module of ast.modules) {
    lines.push(`├── Module: ${module.name}`);
    lines.push(
      `│   ├── Adapter: ${typeof ast.router.adapter === "string" ? ast.router.adapter : ast.router.adapter.name}`,
    );
    lines.push(`│   └── Prefix: ${ast.router.prefix || "/"}`);

    for (const route of module.routes) {
      lines.push(`│   │`);
      lines.push(`│   ├── Route: ${route.method} ${route.fullPath}`);
      if (route.input) lines.push(`│   │   ├── Input: ${route.stableId}`);
      if (route.response) lines.push(`│   │   ├── Response: ${route.stableId}`);

      const expansion = architecture.routes.find(
        (e) => e.route.id === route.id && e.route.moduleName === module.name,
      );
      if (expansion && expansion.layers.length > 0) {
        lines.push(`│   │   └── Architecture Layers:`);
        for (const layer of expansion.layers) {
          lines.push(
            `│   │       ├── ${layer.kind} (file: ${layer.file}, region: ${layer.regionId})`,
          );
        }
      }
    }
  }

  lines.push(`│`);
  lines.push(`└── Plugins [${ast.plugins.length}]`);
  for (const plugin of ast.plugins) {
    lines.push(`    ├── ${plugin.name}@${plugin.version}`);
  }

  return lines.join("\n");
}

function sanitizeMermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export function renderPluginExecutionOrder(
  registry: import("./plugins.js").PluginRegistry,
): string {
  const lines: string[] = [];
  lines.push("Plugin Execution Order:");
  lines.push("");

  const stages: string[] = [
    "preTransform",
    "architecture",
    "adapter",
    "codegen",
    "postTransform",
    "target",
    "validate",
  ];

  for (const stage of stages) {
    const hooksInStage = registry.transformers
      .flatMap((t) => (t.hooks ?? []).map((h) => ({ transformer: t, hook: h })))
      .filter((entry) => entry.hook.stage === stage)
      .sort(
        (a, b) =>
          (a.hook.order ?? 0) - (b.hook.order ?? 0) ||
          a.transformer.name.localeCompare(b.transformer.name),
      );

    lines.push(`Stage: ${stage}`);
    if (hooksInStage.length === 0) {
      lines.push(`  (no hooks)`);
    } else {
      for (const { transformer, hook } of hooksInStage) {
        lines.push(`  ${transformer.name} (order: ${hook.order ?? 0})`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
