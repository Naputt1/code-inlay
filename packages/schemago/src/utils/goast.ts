import * as go from "@schemago/goast";

export function toGoType(typeStr: string): go.Type {
  if (typeStr.startsWith("[]")) {
    return go.sliceType(toGoType(typeStr.slice(2)));
  }
  if (typeStr.startsWith("*")) {
    return go.star(toGoType(typeStr.slice(1)));
  }
  if (typeStr.startsWith("map[")) {
    const rest = typeStr.slice(4);
    const bracketIdx = rest.indexOf("]");
    if (bracketIdx !== -1) {
      return go.mapType(toGoType(rest.slice(0, bracketIdx)), toGoType(rest.slice(bracketIdx + 1)));
    }
  }
  if (typeStr.startsWith("...")) {
    return go.sliceType(toGoType(typeStr.slice(3)));
  }
  if (typeStr.includes(".")) {
    const parts = typeStr.split(".");
    return go.qual(parts[0], parts[1]);
  }
  return go.id(typeStr);
}
