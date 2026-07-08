import type { CodeTarget } from "../types/index.js";
import { openapiTarget } from "./openapi.js";
import { asyncapiTarget } from "./asyncapi.js";
import { protoTarget } from "./proto.js";

export const builtinTargets: Record<string, CodeTarget> = {
  openapi: openapiTarget,
  asyncapi: asyncapiTarget,
  proto: protoTarget,
};

export { openapiTarget } from "./openapi.js";
export { asyncapiTarget } from "./asyncapi.js";
export { protoTarget } from "./proto.js";
