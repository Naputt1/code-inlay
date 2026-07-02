import {
  z,
  defineRoute,
  defineRouteGroup,
  defineModule,
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
  HttpStatus,
  defineValidationError,
} from "@code-inlay/backend-gen";

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

const productRoutes = defineRouteGroup({
  prefix: "/products",
  middleware: [jwtAuth],
  routes: [
    defineRoute({
      id: "create",
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
      handler: "CreateProduct",
    }),
    defineRoute({
      id: "list",
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
      handler: "ListProducts",
    }),
    defineRoute({
      id: "get",
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
      handler: "GetProduct",
    }),
    defineRoute({
      id: "update",
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
      handler: "UpdateProduct",
    }),
    defineRoute({
      id: "remove",
      method: "DELETE",
      path: "/:id",
      query: z.object({ reason: z.string().optional() }),
      handler: "RemoveProduct",
    }),
  ],
});

const orderRoutes = defineRouteGroup({
  prefix: "/orders",
  middleware: [jwtAuth],
  routes: [
    defineRoute({
      id: "create",
      method: "POST",
      path: "",
      body: z.object({
        productId: z.string(),
        quantity: z.int32(),
        shippingAddress: z.object({
          street: z.string(),
          city: z.string(),
          zipCode: z.string(),
          country: z.string().optional(),
        }),
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
      handler: "CreateOrder",
    }),
    defineRoute({
      id: "list",
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
      handler: "ListOrders",
    }),
    defineRoute({
      id: "get",
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
        shippingAddress: z.object({
          street: z.string(),
          city: z.string(),
          zipCode: z.string(),
        }),
        createdAt: z.string(),
        updatedAt: z.string().optional(),
      }),
      responseFormat: orderFormat,
      handler: "GetOrder",
    }),
    defineRoute({
      id: "cancel",
      method: "POST",
      path: "/:id/cancel",
      errors: [OrderShippedError],
      body: z.object({ reason: z.string().optional() }),
      handler: "CancelOrder",
    }),
  ],
});

const adminOrderRoutes = defineRouteGroup({
  prefix: "/orders",
  middleware: [jwtAuth, adminAuth],
  routes: [
    defineRoute({
      id: "adminListAll",
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
      id: "login",
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
      id: "logout",
      method: "POST",
      path: "/logout",
      handler: "Logout",
    }),
    defineRoute({
      id: "register",
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

export default defineApp({
  env: defineEnv({
    PORT: z.string().default("8080").describe("Server listen port"),
  }),
  architecture: "clean",
  router: defineRouter({
    adapter: "gin",
    prefix: "/api/v1",
    cors: defineCors({
      allowOrigins: ["http://localhost:5173"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Origin", "Content-Type", "Authorization"],
      allowCredentials: true,
      maxAge: 86400,
    }),
  }),
  extensions: [gorm],
  services: [
    gorm({ name: "mygorm", driver: "sqlite", close: true }),
    defineService({ name: "redis", close: true }),
  ],
  modules: [
    defineModule({
      name: "products",
      services: ["mygorm"],
      routes: productRoutes,
    }),
    defineModule({
      name: "orders",
      services: ["mygorm", "redis"],
      routes: [...orderRoutes, ...adminOrderRoutes],
    }),
    defineModule({
      name: "auth",
      routes: authRoutes,
    }),
  ],
  runtime: defineRuntime({
    enabled: true,
    logger: { provider: "slog", level: "info", format: "json" },
  }),
  metadata: { enabled: true, routeRegistry: true, schemaReflection: false },
  options: {
    responseFormat: stdFormat,
    fileCreation: "skeleton",
    targets: ["go-server", "ts-client", "openapi"],
    targetOptions: {
      "ts-client": { outputDir: "clients" },
      openapi: { title: "Store API", version: "1.0.0" },
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
