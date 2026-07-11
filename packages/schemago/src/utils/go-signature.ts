import * as go from "@schemago/goast";
import type { Field } from "@schemago/goast";
import { toGoType } from "./goast.js";

export function parseGoSignature(sig: string): { params: Field[]; results?: Field[] } {
  sig = sig.trim();

  const closingParen = findClosingParen(sig, 0);
  const paramContent = sig.slice(1, closingParen);
  const afterParams = sig.slice(closingParen + 1).trim();

  const params = parseFieldList(paramContent);

  let results: Field[] | undefined;

  if (afterParams) {
    if (afterParams.startsWith("(")) {
      const resultClosingParen = findClosingParen(afterParams, 0);
      results = parseFieldList(afterParams.slice(1, resultClosingParen));
    } else {
      results = [go.field([], toGoType(afterParams))];
    }
  }

  return { params, results: results?.length ? results : undefined };
}

function findClosingParen(s: string, start: number): number {
  let depth = 1;
  let i = start + 1;
  while (i < s.length && depth > 0) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    if (depth > 0) i++;
  }
  if (depth !== 0) throw new Error(`Unmatched parenthesis in: ${s}`);
  return i;
}

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function parseFieldList(content: string): Field[] {
  const fields: Field[] = [];
  for (const group of splitTopLevel(content)) {
    const trimmed = group.trim();
    if (!trimmed) continue;
    fields.push(parseFieldGroup(trimmed));
  }
  return fields;
}

function parseFieldGroup(group: string): Field {
  const tokens = group.trim().split(/\s+/);
  const typeStr = tokens.length <= 1 ? tokens[0] : tokens[tokens.length - 1];
  const names = tokens.slice(0, -1);

  if (typeStr.startsWith("...")) {
    const f = go.field(names, toGoType(typeStr));
    f.variadic = true;
    return f;
  }

  if (tokens.length <= 1) {
    return go.field([], toGoType(typeStr));
  }
  return go.field(names, toGoType(typeStr));
}
