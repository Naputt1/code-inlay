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

describe("SSE codec", () => {
  it("generates json.Marshal for default (no codec)", async () => {
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
    expect(content).toContain("json.Marshal(event)");
    expect(content).toContain("text/event-stream");
    expect(content).toContain('fmt.Fprintf(w, "data:');
    expect(content).not.toContain("// TODO: marshal event");
  });

  it("generates import for encoding/json when no codec specified", async () => {
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
    const content = handlerRegion!.regions.map((r) => r.content).join("\n");
    expect(content).toContain('"encoding/json"');
  });

  it("generates accept-header negotiation with switch", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "events",
          routes: [
            defineSSE({
              path: "/stream",
              events: z.object({ data: z.string() }),
              handler: "StreamEvents",
              codec: {
                from: "accept-header",
                default: "json",
                options: {
                  json: "json",
                  protobuf: "protobuf",
                },
              },
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerRegion = result.generation.files.find((f) => f.path.includes("events/handler.go"));
    expect(handlerRegion).toBeDefined();
    const content = handlerRegion!.regions.map((r) => r.content).join("\n");
    expect(content).toContain(`accept := c.GetHeader("Accept")`);
    expect(content).toContain("marshalEvent");
    expect(content).toContain(`case strings.Contains(accept, "application/x-protobuf"):`);
  });

  it("generates sseFields for full SSE spec", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "events",
          routes: [
            defineSSE({
              path: "/stream",
              events: z.object({ eventType: z.string(), data: z.string() }),
              handler: "StreamEvents",
              codec: "sse",
              sseFields: { eventField: "EventType" },
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerRegion = result.generation.files.find((f) => f.path.includes("events/handler.go"));
    expect(handlerRegion).toBeDefined();
    const content = handlerRegion!.regions.map((r) => r.content).join("\n");
    expect(content).toContain(`event.EventType`);
    expect(content).toContain(`fmt.Fprintf(w, "event:`);
    expect(content).toContain(`json.Marshal(event)`);
  });

  it("generates query-param negotiation", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "events",
          routes: [
            defineSSE({
              path: "/stream",
              events: z.object({ data: z.string() }),
              handler: "StreamEvents",
              codec: {
                from: "query-param",
                default: "json",
                options: {
                  json: "json",
                  protobuf: "protobuf",
                },
              },
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerRegion = result.generation.files.find((f) => f.path.includes("events/handler.go"));
    expect(handlerRegion).toBeDefined();
    const content = handlerRegion!.regions.map((r) => r.content).join("\n");
    expect(content).toContain(`format := c.Query("format")`);
    expect(content).toContain(`case "protobuf":`);
  });

  it("generates custom codec marshal call", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "events",
          routes: [
            defineSSE({
              path: "/stream",
              events: z.object({ data: z.string() }),
              handler: "StreamEvents",
              codec: { marshal: "myapp.MarshalEvent" },
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerRegion = result.generation.files.find((f) => f.path.includes("events/handler.go"));
    expect(handlerRegion).toBeDefined();
    const content = handlerRegion!.regions.map((r) => r.content).join("\n");
    expect(content).toContain("myapp.MarshalEvent");
    expect(content).toContain("marshalEvent");
    expect(content).not.toContain("json.Marshal");
  });
});

describe("WS codec", () => {
  it("generates ReadJSON/WriteJSON for default (no codec)", async () => {
    const app = defineApp({
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
    const handlerRegion = result.generation.files.find((f) => f.path.includes("chat/handler.go"));
    expect(handlerRegion).toBeDefined();
    const content = handlerRegion!.regions.map((r) => r.content).join("\n");
    expect(content).toContain("conn.ReadJSON");
    expect(content).toContain("conn.WriteJSON");
  });

  it("generates subprotocol negotiation for WS", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "chat",
          routes: [
            defineWS({
              path: "/ws",
              message: z.object({ text: z.string() }),
              events: z.object({ reply: z.string() }),
              handler: "HandleChat",
              codec: {
                from: "subprotocol",
                default: "json",
                options: {
                  json: "json",
                  protobuf: "protobuf",
                },
              },
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerRegion = result.generation.files.find((f) => f.path.includes("chat/handler.go"));
    expect(handlerRegion).toBeDefined();
    const content = handlerRegion!.regions.map((r) => r.content).join("\n");
    expect(content).toContain("Subprotocols:");
    expect(content).toContain(`subproto := conn.Subprotocol()`);
    expect(content).toContain(`case "protobuf":`);
  });

  it("generates query-param negotiation for WS", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "chat",
          routes: [
            defineWS({
              path: "/ws",
              message: z.object({ text: z.string() }),
              events: z.object({ reply: z.string() }),
              handler: "HandleChat",
              codec: {
                from: "query-param",
                default: "json",
                options: {
                  json: "json",
                  protobuf: "protobuf",
                },
              },
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerRegion = result.generation.files.find((f) => f.path.includes("chat/handler.go"));
    expect(handlerRegion).toBeDefined();
    const content = handlerRegion!.regions.map((r) => r.content).join("\n");
    expect(content).toContain(`format := c.Query("format")`);
    expect(content).toContain(`case "protobuf":`);
  });

  it("generates custom codec marshal/unmarshal for WS", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "chat",
          routes: [
            defineWS({
              path: "/ws",
              message: z.object({ text: z.string() }),
              events: z.object({ reply: z.string() }),
              handler: "HandleChat",
              codec: { marshal: "myapp.EncodeChat", unmarshal: "myapp.DecodeChat" },
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerRegion = result.generation.files.find((f) => f.path.includes("chat/handler.go"));
    expect(handlerRegion).toBeDefined();
    const content = handlerRegion!.regions.map((r) => r.content).join("\n");
    expect(content).toContain("myapp.DecodeChat");
    expect(content).toContain("myapp.EncodeChat");
    expect(content).toContain("conn.ReadMessage()");
    expect(content).toContain("conn.WriteMessage");
  });
});

describe("SSE usecase codec", () => {
  it("passes marshal function to usecase when usecaseCodec is true", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "events",
          routes: [
            defineSSE({
              path: "/stream",
              events: z.object({ data: z.string() }),
              handler: "StreamEvents",
              usecaseCodec: true,
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const sseLayer = result.architecture?.routes
      .find((r) => r.route.kind === "SSE")
      ?.layers.find((l) => l.kind === "sse");
    expect(sseLayer).toBeDefined();
    const sseContent = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === sseLayer!.regionId)?.content;
    expect(sseContent).toContain("marshal func(");
    expect(sseContent).toContain("(ctx context.Context, events chan<- ");
    expect(sseContent).toContain("([]byte, error)");

    const handlerContent = result.generation.files
      .filter((f) => f.path.includes("events/handler.go"))
      .flatMap((f) => f.regions.map((r) => r.content))
      .join("\n");
    expect(handlerContent).toContain("Execute(c.Request.Context(), ch, marshalEvent)");
  });

  it("passes marshal function to usecase with custom codec", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "events",
          routes: [
            defineSSE({
              path: "/stream",
              events: z.object({ data: z.string() }),
              handler: "StreamEvents",
              codec: { marshal: "myapp.MarshalEvent" },
              usecaseCodec: true,
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerContent = result.generation.files
      .filter((f) => f.path.includes("events/handler.go"))
      .flatMap((f) => f.regions.map((r) => r.content))
      .join("\n");
    expect(handlerContent).toContain("Execute(c.Request.Context(), ch, marshalEvent)");
    expect(handlerContent).toContain("myapp.MarshalEvent");
  });
});

describe("WS usecase codec", () => {
  it("passes marshal and unmarshal functions to usecase when usecaseCodec is true", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "chat",
          routes: [
            defineWS({
              path: "/ws",
              message: z.object({ text: z.string() }),
              events: z.object({ reply: z.string() }),
              handler: "HandleChat",
              usecaseCodec: true,
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const wsLayer = result.architecture?.routes
      .find((r) => r.route.kind === "WS")
      ?.layers.find((l) => l.kind === "ws");
    expect(wsLayer).toBeDefined();
    const wsContent = result.generation.files
      .flatMap((f) => f.regions)
      .find((r) => r.id === wsLayer!.regionId)?.content;
    expect(wsContent).toContain("marshal func(");
    expect(wsContent).toContain("unmarshal func(");
    expect(wsContent).toContain("([]byte, error)");
    expect(wsContent).toContain("([]byte, *");

    const handlerContent = result.generation.files
      .filter((f) => f.path.includes("chat/handler.go"))
      .flatMap((f) => f.regions.map((r) => r.content))
      .join("\n");
    expect(handlerContent).toContain(
      "Execute(c.Request.Context(), readCh, writeCh, marshalEvent, unmarshalMessage)",
    );
  });

  it("passes codec functions to usecase with custom codec", async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: "chat",
          routes: [
            defineWS({
              path: "/ws",
              message: z.object({ text: z.string() }),
              events: z.object({ reply: z.string() }),
              handler: "HandleChat",
              codec: { marshal: "myapp.EncodeChat", unmarshal: "myapp.DecodeChat" },
              usecaseCodec: true,
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const handlerContent = result.generation.files
      .filter((f) => f.path.includes("chat/handler.go"))
      .flatMap((f) => f.regions.map((r) => r.content))
      .join("\n");
    expect(handlerContent).toContain(
      "Execute(c.Request.Context(), readCh, writeCh, marshalEvent, unmarshalMessage)",
    );
    expect(handlerContent).toContain("myapp.DecodeChat");
    expect(handlerContent).toContain("myapp.EncodeChat");
  });
});

describe("proto target", () => {
  it("generates .proto file for SSE route with protobuf codec", async () => {
    const app = defineApp({
      options: { targets: ["go-server", "proto"] },
      modules: [
        defineModule({
          name: "events",
          routes: [
            defineSSE({
              path: "/stream",
              events: z.object({ data: z.string(), count: z.number() }),
              handler: "StreamEvents",
              codec: "protobuf",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const protoFile = result.generation.files.find((f) => f.path.includes(".proto"));
    expect(protoFile).toBeDefined();
    const content = protoFile!.regions.map((r) => r.content).join("\n");
    expect(content).toContain('syntax = "proto3"');
    expect(content).toContain("package events");
    expect(content).toContain("StreamEventsEvent");
    expect(content).toContain("string data");
    expect(content).toContain("double count");
  });

  it("generates .proto file for WS route with protobuf codec and events", async () => {
    const app = defineApp({
      options: { targets: ["go-server", "proto"] },
      modules: [
        defineModule({
          name: "chat",
          routes: [
            defineWS({
              path: "/ws",
              message: z.object({ text: z.string() }),
              events: z.object({ reply: z.string() }),
              handler: "HandleChat",
              codec: "protobuf",
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const protoFile = result.generation.files.find((f) => f.path.includes(".proto"));
    expect(protoFile).toBeDefined();
    const content = protoFile!.regions.map((r) => r.content).join("\n");
    expect(content).toContain("HandleChatChatMessage");
    expect(content).toContain("HandleChatChatEvent");
    expect(content).toContain("string text");
    expect(content).toContain("string reply");
  });

  it("generates proto for negotiated codec with protobuf option", async () => {
    const app = defineApp({
      options: { targets: ["go-server", "proto"] },
      modules: [
        defineModule({
          name: "events",
          routes: [
            defineSSE({
              path: "/stream",
              events: z.object({ data: z.string() }),
              handler: "StreamEvents",
              codec: {
                from: "accept-header",
                default: "json",
                options: {
                  json: "json",
                  protobuf: "protobuf",
                },
              },
            }),
          ],
        }),
      ],
    });
    const result = await compile({ app, dryRun: true });
    const protoFile = result.generation.files.find((f) => f.path.includes(".proto"));
    expect(protoFile).toBeDefined();
    const content = protoFile!.regions.map((r) => r.content).join("\n");
    expect(content).toContain("StreamEventsEvent");
  });

  it("does not generate .proto for routes without protobuf codec", async () => {
    const app = defineApp({
      options: { targets: ["go-server", "proto"] },
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
    const protoFile = result.generation.files.find((f) => f.path.includes(".proto"));
    expect(protoFile).toBeUndefined();
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
