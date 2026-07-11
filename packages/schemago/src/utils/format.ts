import {
  formatFile as goastFormatFile,
  formatGoSnippet as goastFormatSnippet,
  type FormatWarning,
} from "@schemago/goast";
import type { Diagnostic } from "../types/index.js";

function fromWarning(w: FormatWarning): Diagnostic {
  return {
    level: "warning",
    code: w.code,
    message: w.message,
    regionId: w.regionId,
  };
}

export function formatFile(absolutePath: string, diagnostics: Diagnostic[]): void {
  const warnings: FormatWarning[] = [];
  goastFormatFile(absolutePath, undefined, warnings);
  for (const w of warnings) diagnostics.push(fromWarning(w));
}

export function formatGoSnippet(
  content: string,
  diagnostics: Diagnostic[],
  regionId: string,
): string {
  const warnings: FormatWarning[] = [];
  const result = goastFormatSnippet(content, regionId, warnings);
  for (const w of warnings) diagnostics.push(fromWarning(w));
  return result;
}
