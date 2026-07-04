import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  compile,
  defineApp,
  defineModule,
  defineRoute,
  defineSSE,
  defineWS,
} from "../src/index.js";

describe("SSE", () => {
  it("builds SSEAst from defineSSE", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "notifications",
          routes: [
            defineSSE({
              path: "/events",
              events: z.discriminatedUnion("type", [
                z.object({ type: z.literal("notification"), message: z.string() }),
                z.object({ type: z.literal("alert"), severity: z.number() }),
              ]),
              handler: "Subscribe",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const sseRoute = result.ast?.modules[0]?.routes[0];
    expect(sseRoute).toBeDefined();
    expect(sseRoute!.kind).toBe("SSE");
    if (sseRoute?.kind === "SSE") {
      expect(sseRoute.path).toBe("/events");
      expect(sseRoute.handlerName).toBe("Subscribe");
      expect(sseRoute.events).toBeDefined();
    }
  });

  it("generates Go handler for SSE route", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "events",
          routes: [
            defineSSE({
              path: "/stream",
              events: z.object({ data: z.string() }),
              handler: "StreamEvents",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerRegion = result.generation.files.find((f) => f.path.includes("events/handler.go"));
    expect(handlerRegion).toBeDefined();
    const content = handlerRegion!.regions.map((r) => r.content).join("\n");
    expect(content).toContain("StreamEvents");
    expect(content).toContain("text/event-stream");
    expect(content).toContain("StreamEventsUsecase");
  });
});

describe("WebSocket", () => {
  it("builds WSAst from defineWS", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "chat",
          routes: [
            defineWS({
              path: "/ws",
              message: z.object({ text: z.string() }),
              events: z.object({ user: z.string(), text: z.string() }),
              handler: "HandleChat",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const wsRoute = result.ast?.modules[0]?.routes[0];
    expect(wsRoute).toBeDefined();
    expect(wsRoute!.kind).toBe("WS");
    if (wsRoute?.kind === "WS") {
      expect(wsRoute.path).toBe("/ws");
      expect(wsRoute.handlerName).toBe("HandleChat");
      expect(wsRoute.message).toBeDefined();
      expect(wsRoute.events).toBeDefined();
    }
  });

  it("generates Go handler for WS route", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "chat",
          routes: [
            defineWS({
              path: "/chat",
              message: z.object({ text: z.string() }),
              events: z.object({ user: z.string(), text: z.string() }),
              handler: "HandleChat",
              wsLibrary: "gorilla/websocket",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerRegion = result.generation.files.find((f) => f.path.includes("chat/handler.go"));
    expect(handlerRegion).toBeDefined();
    const content = handlerRegion!.regions.map((r) => r.content).join("\n");
    expect(content).toContain("HandleChat");
    expect(content).toContain("websocket.Upgrader");
    expect(content).toContain("HandleChatUsecase");
  });

  it("generates WS usecase interface", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "chat",
          routes: [
            defineWS({
              path: "/ws",
              message: z.object({ msg: z.string() }),
              events: z.object({ reply: z.string() }),
              handler: "HandleChat",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const filePaths = result.generation.files.map((f) => f.path);
    const hasWsFile = filePaths.some((p) => p.includes("chat/ws.go"));
    const hasHandler = filePaths.some((p) => p.includes("chat/handler.go"));
    const architectureRoutes = result.architecture?.routes ?? [];
    expect(architectureRoutes.length).toBeGreaterThan(0);
    expect(hasHandler).toBe(true);
    expect(hasWsFile).toBe(true);
    const handlerFile = result.generation.files.find((f) => f.path.includes("chat/handler.go"));
    expect(handlerFile).toBeDefined();
    const handlerContent = handlerFile!.regions.map((r) => r.content).join("\n");
    expect(handlerContent).toContain("HandleChat");
    expect(handlerContent).toContain("HandleChatUsecase");
    expect(handlerContent).toContain("websocket.Upgrader");
  });
});

describe("AsyncAPI target", () => {
  it("generates asyncapi.json for SSE routes", async () => {
    const app = defineApp({
      options: { targets: ["go-server", "asyncapi"] },
      modules: [
        defineModule({
          name: "notifications",
          routes: [
            defineSSE({
              path: "/events",
              events: z.object({ message: z.string() }),
              handler: "Subscribe",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(result.generation.files.some((f) => f.path === "docs/asyncapi.json")).toBe(true);
  });

  it("generates asyncapi.json for WS routes", async () => {
    const app = defineApp({
      options: { targets: ["go-server", "asyncapi"] },
      modules: [
        defineModule({
          name: "chat",
          routes: [
            defineWS({
              path: "/ws",
              message: z.object({ text: z.string() }),
              events: z.object({ reply: z.string() }),
              handler: "HandleChat",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    expect(result.generation.files.some((f) => f.path === "docs/asyncapi.json")).toBe(true);
  });
});

describe("SSE + HTTP + WS in same module", () => {
  it("generates all three route types together", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "api",
          routes: [
            defineRoute({
              method: "GET",
              path: "/status",
              handler: "GetStatus",
              response: z.object({ ok: z.boolean() }),
            }),
            defineSSE({
              path: "/events",
              events: z.object({ type: z.string(), data: z.string() }),
              handler: "Subscribe",
            }),
            defineWS({
              path: "/chat",
              message: z.object({ text: z.string() }),
              handler: "HandleChat",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerRegions = result.generation.files.filter((f) => f.path.includes("api/handler.go"));
    expect(handlerRegions.length).toBeGreaterThan(0);
    const content = handlerRegions.flatMap((f) => f.regions.map((r) => r.content)).join("\n");
    expect(content).toContain("GetStatus");
    expect(content).toContain("Subscribe");
    expect(content).toContain("HandleChat");
  });
});
