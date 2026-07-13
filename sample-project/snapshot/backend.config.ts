import {
  z,
  defineRoute,
  defineRouteGroup,
  defineRouter,
  defineMiddleware,
  defineApp,
  defineEnv,
  defineRuntime,
  defineServiceExtension,
  defineResponseFormat,
  defineService,
  defineError,
  defineCors,
  defineSSE,
  defineWS,
  HttpStatus,
  defineValidationError,
} from "@schemago/schemago";

const jwtAuth = defineMiddleware({ name: "JwtAuth" });
const adminAuth = defineMiddleware({ name: "AdminAuth" });

const OrderShippedError = defineError({
  name: "OrderShippedError",
  httpStatus: HttpStatus.Conflict,
  fields: z.object({ orderId: z.string(), shippedAt: z.string() }),
});

const stdFormat = defineResponseFormat({
  wrapper: z.object({
    status: z.boolean(),
    data: z.entity(),
  }),
});

const orderFormat = defineResponseFormat({
  wrapper: z.object({
    success: z.boolean(),
    result: z.entity(),
  }),
});

const Address = z.object({
  street: z.string(),
  city: z.string(),
  zipCode: z.string(),
  country: z.string().optional(),
});

const productRoutes = defineRouteGroup({
  prefix: "/products",
  middleware: [jwtAuth],
  routes: [
    defineRoute({
      method: "POST",
      path: "",
      body: z.object({
        name: z.string().min(1).max(100),
        price: z.number().positive(),
        category: z.enum(["electronics", "clothing", "food"]),
        tags: z.array(z.string()).optional(),
        active: z.boolean().optional(),
        metadata: z.object({}).passthrough().optional(),
      }),
      response: z.object({
        id: z.string(),
        name: z.string(),
        price: z.number(),
      }),
      handler: "Create",
    }),
    defineRoute({
      method: "GET",
      path: "",
      query: z.object({
        page: z.int32().optional(),
        limit: z.int32().optional(),
        category: z.string().optional(),
      }),
      response: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          price: z.number(),
          category: z.string(),
        }),
      ),
      handler: "List",
    }),
    defineRoute({
      method: "GET",
      path: "/:id",
      response: z.object({
        id: z.string(),
        name: z.string(),
        price: z.number(),
        category: z.string(),
        tags: z.array(z.string()).optional(),
        description: z.string().optional(),
        ratings: z
          .array(
            z.object({
              userId: z.string(),
              score: z.int32(),
              comment: z.string().optional(),
            }),
          )
          .optional(),
      }),
      handler: "Get",
    }),
    defineRoute({
      method: "PUT",
      path: "/:id",
      body: z.object({
        name: z.string().min(1).max(100).optional(),
        price: z.number().positive().optional(),
        category: z.enum(["electronics", "clothing", "food"]).optional(),
        tags: z.array(z.string()).optional(),
        active: z.boolean().optional(),
        metadata: z.object({}).passthrough().optional(),
      }),
      handler: "Update",
    }),
    defineRoute({
      method: "DELETE",
      path: "/:id",
      query: z.object({ reason: z.string().optional() }),
      handler: "Remove",
    }),
  ],
});

const orderRoutes = defineRouteGroup({
  prefix: "/orders",
  middleware: [jwtAuth],
  routes: [
    defineRoute({
      method: "POST",
      path: "",
      body: z.object({
        productId: z.string(),
        quantity: z.int32(),
        shippingAddress: Address,
        notes: z.string().max(500).optional(),
        couponCode: z.string().optional(),
      }),
      response: z.object({
        id: z.string(),
        totalPrice: z.number(),
        status: z.string(),
        estimatedDelivery: z.int64().optional(),
      }),
      responseFormat: orderFormat,
      handler: "Create",
    }),
    defineRoute({
      method: "GET",
      path: "",
      query: z.object({
        page: z.int32().optional(),
        pageSize: z.int32().optional(),
        status: z.string().optional(),
      }),
      response: z.array(
        z.object({
          id: z.string(),
          totalPrice: z.number(),
          status: z.string(),
          createdAt: z.string(),
          itemCount: z.int32(),
        }),
      ),
      responseFormat: orderFormat,
      handler: "List",
    }),
    defineRoute({
      method: "GET",
      path: "/:id",
      response: z.object({
        id: z.string(),
        totalPrice: z.number(),
        status: z.string(),
        items: z.array(
          z.object({
            productId: z.string(),
            productName: z.string(),
            quantity: z.int32(),
            unitPrice: z.number(),
          }),
        ),
        shippingAddress: Address,
        createdAt: z.string(),
        updatedAt: z.string().optional(),
      }),
      responseFormat: orderFormat,
      handler: "Get",
    }),
    defineRoute({
      method: "POST",
      path: "/:id/cancel",
      errors: [OrderShippedError],
      body: z.object({ reason: z.string().optional() }),
      handler: "Cancel",
    }),
    defineWS({
      path: "/track-ws",
      message: z.object({ orderId: z.string() }),
      events: z.object({ status: z.string(), updatedAt: z.string() }),
      handler: "TrackOrder",
      wsLibrary: "gorilla/websocket",
      codec: {
        from: "subprotocol",
        default: "json",
        options: {
          json: "json",
          protobuf: "protobuf",
        },
      },
      usecaseCodec: true,
    }),
  ],
});

const adminOrderRoutes = defineRouteGroup({
  prefix: "/orders",
  middleware: [jwtAuth, adminAuth],
  routes: [
    defineRoute({
      method: "GET",
      path: "/admin/all",
      query: z.object({
        page: z.int32().optional(),
        pageSize: z.int32().optional(),
      }),
      response: z.array(
        z.object({
          id: z.string(),
          totalPrice: z.number(),
          status: z.string(),
          userId: z.string(),
        }),
      ),
      responseFormat: orderFormat,
      handler: "AdminListAllOrders",
    }),
  ],
});

const authRoutes = defineRouteGroup({
  prefix: "/auth",
  routes: [
    defineRoute({
      method: "POST",
      path: "/login",
      body: z.object({
        email: z.string().email(),
        password: z.string().min(8),
      }),
      response: z.object({
        token: z.string(),
        user: z.object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
          roles: z.array(z.string()),
        }),
      }),
      handler: "Login",
    }),
    defineRoute({
      method: "POST",
      path: "/logout",
      handler: "Logout",
    }),
    defineRoute({
      method: "POST",
      path: "/register",
      body: z.object({
        name: z.string().min(2).max(50),
        email: z.string().email(),
        password: z.string().min(8).max(100),
        referralCode: z.string().optional(),
      }),
      response: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        createdAt: z.string(),
      }),
      handler: "Register",
    }),
    defineSSE({
      path: "/events",
      events: z.discriminatedUnion("type", [
        z.object({ type: z.literal("login"), userId: z.string(), timestamp: z.string() }),
        z.object({ type: z.literal("logout"), userId: z.string(), timestamp: z.string() }),
      ]),
      handler: "StreamAuthEvents",
      codec: "sse",
      usecaseCodec: true,
    }),
  ],
});

const gorm = defineServiceExtension({
  name: "gorm",
  service: {
    provides: "database",
    optionsSchema: z.object({
      driver: z.enum(["mysql", "postgres", "sqlite"]),
    }),
    dbAccessor: "DB",
    dbType: "*gorm.DB",
    dbTypePkg: "gorm.io/gorm",
  },
});

const app = defineApp({
  env: defineEnv({
    PORT: z.string().default("8080").describe("Server listen port"),
  }),
  architecture: "clean",
  router: defineRouter((ctx) => ({
    adapter: "gin",
    prefix: `/api/v1`,
    cors: defineCors({
      allowOrigins: [`http://localhost${ctx.env.PORT}`],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Origin", "Content-Type", "Authorization"],
      allowCredentials: true,
      maxAge: 86400,
    }),
  })),
  extensions: [gorm],
  services: {
    mygorm: gorm({ driver: "sqlite", close: true }),
    redis: defineService({
      close: true,
      interfaceMethods: [
        {
          name: "Set",
          signature:
            "(ctx context.Context, key string, value interface{}, ttl time.Duration) error",
        },
        {
          name: "Get",
          signature: "(ctx context.Context, key string) (string, error)",
        },
        {
          name: "Del",
          signature: "(ctx context.Context, keys ...string) error",
        },
      ],
    }),
  },
  types: { Address },
  runtime: defineRuntime({
    enabled: true,
    logger: { provider: "slog", level: "info", format: "json" },
  }),
  metadata: { enabled: true, routeRegistry: true, schemaReflection: false },
  options: {
    responseFormat: stdFormat,
    fileCreation: "skeleton",
    targets: ["go-server", "openapi", "asyncapi", "proto"],
    targetOptions: {
      openapi: { title: "Store API", version: "1.0.0" },
      asyncapi: { title: "Store Events", version: "1.0.0", serverUrl: "localhost:8080" },
    },
    validationError: defineValidationError({
      httpStatus: HttpStatus.UnprocessableEntity,
      body: (z) =>
        z.object({
          message: z.literal("validation failed"),
          errors: z.array(
            z.object({
              field: z.field(),
              rule: z.tag(),
            }),
          ),
        }),
    }),
  },
});

app.defineModule({ name: "products", services: ["mygorm"], routes: productRoutes });
app.defineModule({
  name: "orders",
  services: ["mygorm", "redis"],
  routes: [orderRoutes, adminOrderRoutes],
});
app.defineModule({ name: "auth", routes: authRoutes });

export default app;
