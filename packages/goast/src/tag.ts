// ─────────────────────────────────────────────────────────────
// @schemago/goast — Go struct tag parser / builder
// ─────────────────────────────────────────────────────────────

import type { Tag } from "./nodes.js";

// Parse `json:"name,omitempty" gorm:"column:name"` into { json: "name,omitempty", gorm: "column:name" }
export function parseTag(tag: Tag): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /(\w+):"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag)) !== null) {
    result[match[1]] = match[2].replace(/\\(.)/g, "$1");
  }
  return result;
}

// Serialize { json: "name,omitempty" } into `json:"name,omitempty"`
export function serializeTag(tags: Record<string, string>): Tag {
  return Object.entries(tags)
    .map(([key, value]) => `${key}:"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(" ");
}

// Get a single tag value, or undefined
export function getTag(tag: Tag | undefined, key: string): string | undefined {
  if (!tag) return undefined;
  const parsed = parseTag(tag);
  return parsed[key];
}

// Set a single tag value, returning a new tag string
export function setTag(tag: Tag | undefined, key: string, value: string): Tag {
  const parsed = tag ? parseTag(tag) : {};
  parsed[key] = value;
  return serializeTag(parsed);
}

// Remove a single tag key, returning a new tag string
export function removeTag(tag: Tag | undefined, key: string): Tag | undefined {
  if (!tag) return undefined;
  const parsed = parseTag(tag);
  delete parsed[key];
  const keys = Object.keys(parsed);
  return keys.length > 0 ? serializeTag(parsed) : undefined;
}
