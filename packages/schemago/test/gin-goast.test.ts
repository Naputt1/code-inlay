import { describe, it, expect } from "vitest";
import type { RouteAst, SSEAst, WSAst, SchemaLike, ResolvedCodec } from "../src/types/index.js";
import {
  generateGinHandler,
  generateGinSSEHandler,
  generateGinWSHandler,
  handlerImportsForCodec,
  codecUsesProtobuf,
} from "../src/adapters/gin-goast.js";

function makeRoute(overrides: Partial<RouteAst> = {}): RouteAst {
  return {
    kind: "Route",
    id: "test",
    stableId: "test-stable",
    moduleName: "users",
    method: "GET",
    path: "/users",
    fullPath: "/users",
    handlerName: "GetUsers",
    architecture: undefined,
    adapters: undefined,
    resolvedArchitectures: [],
    resolvedAdapters: [],
    responseFormat: undefined,
    errors: [],
    query: undefined,
    body: undefined,
    response: undefined,
    middleware: [],
    usecaseGroup: undefined,
    metadata: {},
    annotations: {},
    pluginData: {},
    source: undefined,
    ...overrides,
  };
}

function makeSSE(overrides: Partial<SSEAst> = {}): SSEAst {
  return {
    kind: "SSE",
    id: "test-sse",
    stableId: "test-sse-stable",
    moduleName: "users",
    path: "/events",
    fullPath: "/events",
    handlerName: "StreamEvents",
    architecture: undefined,
    adapters: undefined,
    resolvedArchitectures: [],
    resolvedAdapters: [],
    events: { _def: { shape: () => ({}) } } as unknown as SchemaLike,
    middleware: [],
    metadata: {},
    annotations: {},
    pluginData: {},
    ...overrides,
  };
}

function makeWS(overrides: Partial<WSAst> = {}): WSAst {
  return {
    kind: "WS",
    id: "test-ws",
    stableId: "test-ws-stable",
    moduleName: "users",
    path: "/ws",
    fullPath: "/ws",
    handlerName: "HandleMessages",
    architecture: undefined,
    adapters: undefined,
    resolvedArchitectures: [],
    resolvedAdapters: [],
    message: { _def: { shape: () => ({}) } } as unknown as SchemaLike,
    middleware: [],
    metadata: {},
    annotations: {},
    pluginData: {},
    ...overrides,
  };
}

describe("generateGinHandler", () => {
  it("generates GET handler without domain", () => {
    const region = generateGinHandler(makeRoute(), [], "gin");
    expect(region.id).toBe("users.test.handler");
    expect(region.owner).toBe("gin");
    expect(region.language).toBe("go");
    expect(region.content).toContain("func (h *UsersHandler) GetUsers(c *gin.Context) {");
    expect(region.content).toContain(
      "output, err := h.GetUsersUsecase.Execute(c.Request.Context(), input)",
    );
    expect(region.content).toContain("input := struct{}{}");
    expect(region.content).toContain("c.JSON(http.StatusOK, output)");
  });

  it("generates GET handler with domain", () => {
    const region = generateGinHandler(makeRoute({ path: "/users/:id" }), [], "gin", true);
    expect(region.content).toContain('id := UsersID(c.Param("id"))');
    expect(region.content).toContain(
      "output, err := h.GetUsersUsecase.Execute(c.Request.Context(), id)",
    );
    expect(region.content).toContain("c.JSON(http.StatusOK, output)");
  });

  it("generates POST handler with body", () => {
    const region = generateGinHandler(
      makeRoute({
        method: "POST",
        handlerName: "CreateUser",
        body: { _def: { shape: () => ({ name: "string" }) } } as unknown as SchemaLike,
      }),
      [],
      "gin",
      false,
    );
    expect(region.content).toContain("func (h *UsersHandler) CreateUser(c *gin.Context) {");
    expect(region.content).toContain("var input TestUsersRequest");
    expect(region.content).toContain("if err := c.ShouldBindJSON(&input); err != nil {");
    expect(region.content).toContain("status, body := httperr.ResolveBindingError(err)");
    expect(region.content).toContain(
      "output, err := h.CreateUserUsecase.Execute(c.Request.Context(), input)",
    );
  });

  it("generates POST with query and body", () => {
    const region = generateGinHandler(
      makeRoute({
        method: "POST",
        handlerName: "CreateUser",
        query: { _def: { shape: () => ({ page: "number" }) } } as unknown as SchemaLike,
        body: { _def: { shape: () => ({ name: "string" }) } } as unknown as SchemaLike,
      }),
      [],
      "gin",
      false,
    );
    expect(region.content).toContain("var query TestUsersQuery");
    expect(region.content).toContain("if err := c.ShouldBindQuery(&query); err != nil {");
    expect(region.content).toContain("var requestBody TestUsersBody");
    expect(region.content).toContain("if err := c.ShouldBindJSON(&requestBody); err != nil {");
    expect(region.content).toContain("input.Page = query.Page");
    expect(region.content).toContain("input.Name = requestBody.Name");
  });

  it("uses input := struct{}{} for handler without query, body, or path params", () => {
    const region = generateGinHandler(makeRoute({ method: "GET" }), [], "gin", false);
    expect(region.content).toContain("input := struct{}{}");
  });

  it("DELETE handler uses StatusNoContent and error pattern", () => {
    const region = generateGinHandler(
      makeRoute({ method: "DELETE", handlerName: "DeleteUser", path: "/users/:id" }),
      [],
      "gin",
      true,
    );
    expect(region.content).toContain('id := UsersID(c.Param("id"))');
    expect(region.content).toContain("c.Status(http.StatusNoContent)");
    expect(region.content).toContain("c.Status(httpErr.HTTPStatus())");
    expect(region.content).toContain("_ = output");
  });

  it("List handler with query uses ShouldBindQuery", () => {
    const region = generateGinHandler(
      makeRoute({
        handlerName: "ListUsers",
        query: { _def: { shape: () => ({}) } } as unknown as SchemaLike,
      }),
      [],
      "gin",
      true,
    );
    expect(region.content).toContain("if err := c.ShouldBindQuery(&input); err != nil {");
    expect(region.content).toContain(
      "output, err := h.ListUsersUsecase.Execute(c.Request.Context(), input)",
    );
  });

  it("Update handler with path param uses ShouldBindJSON and UsersID", () => {
    const region = generateGinHandler(
      makeRoute({
        handlerName: "UpdateUser",
        method: "PUT",
        path: "/users/:id",
      }),
      [],
      "gin",
      true,
    );
    expect(region.content).toContain("var binding TestUsersRequest");
    expect(region.content).toContain("if err := c.ShouldBindJSON(&binding); err != nil {");
    expect(region.content).toContain('id := UsersID(c.Param("id"))');
    expect(region.content).toContain(
      "output, err := h.UpdateUserUsecase.Execute(c.Request.Context(), id, entity)",
    );
  });

  it("has error handling block with errors.As", () => {
    const region = generateGinHandler(makeRoute(), [], "gin");
    expect(region.content).toContain("var httpErr httperr.HTTPError");
    expect(region.content).toContain("if errors.As(err, &httpErr) {");
    expect(region.content).toContain("c.JSON(httpErr.HTTPStatus(), err)");
    expect(region.content).toContain('"error": err.Error()');
    expect(region.content).toContain("c.JSON(http.StatusOK, output)");
  });
});

describe("generateGinSSEHandler", () => {
  it("generates basic SSE handler with JSON marshal", () => {
    const region = generateGinSSEHandler(makeSSE());
    expect(region.content).toContain("func (h *UsersHandler) StreamEvents(c *gin.Context) {");
    expect(region.content).toContain('c.Writer.Header().Set("Content-Type", "text/event-stream")');
    expect(region.content).toContain("ch := make(chan StreamEventsUsersEvent)");
    expect(region.content).toContain("go h.StreamEventsUsecase.Execute(c.Request.Context(), ch)");
    expect(region.content).toContain("c.Stream(func(w io.Writer) bool {");
    expect(region.content).toContain("event, ok := <-ch");
    expect(region.content).toContain("data, err := json.Marshal(event)");
  });

  it("generates SSE handler with negotiated codec (accept-header)", () => {
    const codec: ResolvedCodec = {
      kind: "negotiated",
      strategy: ["accept-header"],
      defaultKey: "json",
      codecs: {
        json: { kind: "preset", preset: "json" },
        proto: { kind: "preset", preset: "protobuf" },
      },
    };
    const region = generateGinSSEHandler(makeSSE({ codec }));
    expect(region.content).toContain('accept := c.GetHeader("Accept")');
    expect(region.content).toContain(
      "marshalEvent := func(v StreamEventsUsersEvent) ([]byte, error) {",
    );
    expect(region.content).toContain('case strings.Contains(accept, "application/x-proto"):');
    expect(region.content).toContain(
      "marshalEvent = func(v StreamEventsUsersEvent) ([]byte, error) {",
    );
  });

  it("generates SSE handler with query-param negotiation", () => {
    const codec: ResolvedCodec = {
      kind: "negotiated",
      strategy: ["query-param"],
      defaultKey: "json",
      codecs: {
        json: { kind: "preset", preset: "json" },
        proto: { kind: "preset", preset: "protobuf" },
      },
    };
    const region = generateGinSSEHandler(makeSSE({ codec }));
    expect(region.content).toContain('format := c.Query("format")');
    expect(region.content).toContain("switch format {");
    expect(region.content).toContain('case "proto":');
  });

  it("generates SSE handler with usecaseCodec", () => {
    const region = generateGinSSEHandler(makeSSE({ usecaseCodec: true }));
    expect(region.content).toContain(
      "marshalEvent := func(v StreamEventsUsersEvent) ([]byte, error) {",
    );
    expect(region.content).toContain("json.Marshal(v)");
    expect(region.content).toContain(
      "go h.StreamEventsUsecase.Execute(c.Request.Context(), ch, marshalEvent)",
    );
  });
});

describe("generateGinWSHandler", () => {
  it("generates basic WS handler with JSON codec", () => {
    const region = generateGinWSHandler(makeWS());
    expect(region.content).toContain("func (h *UsersHandler) HandleMessages(c *gin.Context) {");
    expect(region.content).toContain("upgrader := websocket.Upgrader{}");
    expect(region.content).toContain("conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)");
    expect(region.content).toContain("defer conn.Close()");
    expect(region.content).toContain("readCh := make(chan HandleMessagesUsersMessage)");
    expect(region.content).toContain("writeCh := make(chan struct{}, 8)");
  });

  it("generates WS handler with protobuf codec", () => {
    const codec: ResolvedCodec = { kind: "preset", preset: "protobuf" };
    const region = generateGinWSHandler(makeWS({ codec }));
    expect(region.content).toContain("readMessage := func() (HandleMessagesUsersMessage, error) {");
    expect(region.content).toContain("_, data, err := conn.ReadMessage()");
    expect(region.content).toContain("return HandleMessagesUsersMessageFromProtoBytes(data), nil");
    expect(region.content).toContain("writeEvent := func(v struct{}) error {");
    expect(region.content).toContain(
      "return conn.WriteMessage(websocket.BinaryMessage, struct{}ToProtoBytes(v))",
    );
  });

  it("generates WS handler with custom codec", () => {
    const codec: ResolvedCodec = {
      kind: "custom",
      marshal: "customMarshal",
      unmarshal: "customUnmarshal",
    };
    const region = generateGinWSHandler(makeWS({ codec }));
    expect(region.content).toContain("readMessage := func() (HandleMessagesUsersMessage, error) {");
    expect(region.content).toContain("_, data, err := conn.ReadMessage()");
    expect(region.content).toContain("err = customUnmarshal(data, &msg)");
    expect(region.content).toContain("writeEvent := func(v struct{}) error {");
    expect(region.content).toContain("data, err := customMarshal(v)");
  });

  it("generates WS handler with events type", () => {
    const region = generateGinWSHandler(
      makeWS({
        events: { _def: { shape: () => ({}) } } as unknown as SchemaLike,
      }),
    );
    expect(region.content).toContain("writeCh := make(chan HandleMessagesUsersEvent, 8)");
  });

  it("generates WS handler with negotiated codec (accept-header)", () => {
    const codec: ResolvedCodec = {
      kind: "negotiated",
      strategy: ["accept-header"],
      defaultKey: "json",
      codecs: {
        json: { kind: "preset", preset: "json" },
        proto: { kind: "preset", preset: "protobuf" },
      },
    };
    const region = generateGinWSHandler(makeWS({ codec }));
    expect(region.content).toContain('accept := c.GetHeader("Accept")');
    expect(region.content).toContain("readMessage := func() (HandleMessagesUsersMessage, error) {");
    expect(region.content).toContain('case strings.Contains(accept, "application/x-proto"):');
  });

  it("generates WS handler with negotiated codec (subprotocol)", () => {
    const codec: ResolvedCodec = {
      kind: "negotiated",
      strategy: ["subprotocol"],
      defaultKey: "json",
      codecs: {
        json: { kind: "preset", preset: "json" },
        proto: { kind: "preset", preset: "protobuf" },
      },
    };
    const region = generateGinWSHandler(makeWS({ codec }));
    expect(region.content).toContain("subproto := conn.Subprotocol()");
    expect(region.content).toContain("switch subproto {");
    expect(region.content).toContain('case "proto":');
  });
});

describe("handlerImportsForCodec", () => {
  it("returns encoding/json for no codec", () => {
    expect(handlerImportsForCodec(undefined)).toEqual(["encoding/json"]);
  });

  it("returns encoding/json for preset json", () => {
    expect(handlerImportsForCodec({ kind: "preset", preset: "json" })).toEqual(["encoding/json"]);
  });

  it("returns empty for custom codec", () => {
    expect(handlerImportsForCodec({ kind: "custom", marshal: "x" })).toEqual([]);
  });

  it("returns encoding/json and strings for negotiated with accept-header", () => {
    expect(
      handlerImportsForCodec({
        kind: "negotiated",
        strategy: ["accept-header"],
        defaultKey: "json",
        codecs: { json: { kind: "preset", preset: "json" } },
      }),
    ).toEqual(["encoding/json", "strings"]);
  });

  it("returns only encoding/json for negotiated with query-param", () => {
    expect(
      handlerImportsForCodec({
        kind: "negotiated",
        strategy: ["query-param"],
        defaultKey: "json",
        codecs: { json: { kind: "preset", preset: "json" } },
      }),
    ).toEqual(["encoding/json"]);
  });
});

describe("codecUsesProtobuf", () => {
  it("returns false for undefined codec", () => {
    expect(codecUsesProtobuf(undefined)).toBe(false);
  });

  it("returns true for preset protobuf", () => {
    expect(codecUsesProtobuf({ kind: "preset", preset: "protobuf" })).toBe(true);
  });

  it("returns false for preset json", () => {
    expect(codecUsesProtobuf({ kind: "preset", preset: "json" })).toBe(false);
  });

  it("returns true for negotiated with protobuf option", () => {
    expect(
      codecUsesProtobuf({
        kind: "negotiated",
        strategy: ["accept-header"],
        defaultKey: "json",
        codecs: {
          json: { kind: "preset", preset: "json" },
          proto: { kind: "preset", preset: "protobuf" },
        },
      }),
    ).toBe(true);
  });

  it("returns false for negotiated without protobuf", () => {
    expect(
      codecUsesProtobuf({
        kind: "negotiated",
        strategy: ["accept-header"],
        defaultKey: "json",
        codecs: {
          json: { kind: "preset", preset: "json" },
          msgpack: { kind: "custom", marshal: "m" },
        },
      }),
    ).toBe(false);
  });
});
