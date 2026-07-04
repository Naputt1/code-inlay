import type { CodeTarget } from "../types/index.js";
import { tsClientTarget } from "./ts-client.js";
import { openapiTarget } from "./openapi.js";
import { asyncapiTarget } from "./asyncapi.js";

export const builtinTargets: Record<string, CodeTarget> = {
  "ts-client": tsClientTarget,
  openapi: openapiTarget,
  asyncapi: asyncapiTarget,
};

export { tsClientTarget } from "./ts-client.js";
export { openapiTarget } from "./openapi.js";
export { asyncapiTarget } from "./asyncapi.js";
