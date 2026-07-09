import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import * as go from "../src/index.js";

const binary = "./tools/decl-parser/decl-parser";
const file = process.argv[2];

const source = readFileSync(file, "utf8");
const result = spawnSync(binary, { input: source, encoding: "utf8" });
const parsed = JSON.parse(result.stdout);

let printed;
try {
  printed = go.printFile(parsed.file);
} catch(e) {
  console.log("=== printFile error ===");
  console.log(e.message);
  process.exit(1);
}

const check = spawnSync("gofmt", { input: printed, encoding: "utf8" });
if (check.status !== 0) {
  const lines = check.stderr.split("\n").filter(l => l.trim());
  console.log("=== gofmt errors ===");
  console.log(lines.slice(0, 20).join("\n"));
  // output the problematic area
  for (const line of lines) {
    const m = line.match(/:(\d+):/);
    if (m) {
      const ln = parseInt(m[1]);
      const ctxLines = printed.split("\n").slice(Math.max(0,ln-3), ln+2);
      console.log("--- context near line", ln, "---");
      console.log(ctxLines.map((l,i) => `${ln-2+i}: ${l}`).join("\n"));
      break;
    }
  }
} else {
  console.log("SUCCESS");
}
