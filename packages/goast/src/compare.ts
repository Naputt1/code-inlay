import { parseSummarySource } from "./parser.js";
import type { SummaryDeclaration } from "./parser.js";

function compareDecl(a: SummaryDeclaration, b: SummaryDeclaration): boolean {
  return (
    a.kind === b.kind &&
    a.symbolName === b.symbolName &&
    a.receiver === b.receiver &&
    a.signature === b.signature &&
    compareBody(a.body, b.body)
  );
}

function compareBody(a?: string, b?: string): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const strip = (s: string) =>
    s
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n")
      .replace(/\s+/g, " ")
      .trim();
  return strip(a) === strip(b);
}

function compareDecls(a: SummaryDeclaration[], b: SummaryDeclaration[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((d, i) => compareDecl(d, b[i]));
}

/** Compare two valid Go snippets structurally, ignoring comments and whitespace. */
export function goSnippetEqual(a: string, b: string): boolean {
  return compareDecls(parseSummarySource(a), parseSummarySource(b));
}

/** Compare two Go function/method bodies (content between { and }), ignoring comments and whitespace. */
export function goBodyEqual(a: string, b: string): boolean {
  const wrap = (body: string) => `package p\n\nfunc _() {\n${body}\n}`;
  return goSnippetEqual(wrap(a), wrap(b));
}
