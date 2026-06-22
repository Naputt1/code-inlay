import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Backend Gen",
  description: "TypeScript-powered Go backend code generator",
  cleanUrls: true,
  socialLinks: [{ icon: "github", link: "https://github.com/code-inlay/backend-gen" }],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "CLI", link: "/cli/" },
      { text: "Reference", link: "/reference/types" },
    ],
    sidebar: {
      "/guide/": [
        { text: "Getting Started", link: "/guide/getting-started" },
        { text: "Configuration", link: "/guide/configuration" },
        { text: "Defining Routes", link: "/guide/routes" },
        { text: "Route Groups", link: "/guide/route-groups" },
        { text: "Schemas & Types", link: "/guide/schemas" },
        { text: "Validation", link: "/guide/validation" },
        { text: "Middleware", link: "/guide/middleware" },
        { text: "Modules", link: "/guide/modules" },
        { text: "Architecture", link: "/guide/architecture" },
        { text: "Adapters", link: "/guide/adapters" },
        { text: "Plugin System", link: "/guide/plugin-system" },
        { text: "Targets", link: "/guide/targets" },
        { text: "Metadata", link: "/guide/metadata" },
        { text: "Runtime", link: "/guide/runtime" },
        { text: "Testing", link: "/guide/testing" },
      ],
      "/cli/": [
        { text: "Overview", link: "/cli/" },
        { text: "generate", link: "/cli/generate" },
        { text: "dev", link: "/cli/dev" },
        { text: "check", link: "/cli/check" },
        { text: "diff", link: "/cli/diff" },
        { text: "inspect", link: "/cli/inspect" },
        { text: "init", link: "/cli/init" },
        { text: "docs", link: "/cli/docs" },
        { text: "migrate", link: "/cli/migrate" },
        { text: "plugin", link: "/cli/plugin" },
      ],
      "/reference/": [
        { text: "Types", link: "/reference/types" },
        { text: "API", link: "/reference/api" },
        { text: "Generated Files", link: "/reference/generated-files" },
        { text: "Region System", link: "/reference/region-system" },
      ],
    },
    footer: {
      message: "MIT License",
    },
  },
});
