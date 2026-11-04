// Checks that every `nomba.<resource>.<method>(` used in the skills' JS/TS code
// blocks exists on the published @nombaoss/nomba-node client.
// Run after `node scripts/validate.mjs` and `npm install @nombaoss/nomba-node`.

import { readFileSync } from "node:fs";
import Nomba from "@nombaoss/nomba-node";

const { node: calls } = JSON.parse(readFileSync("build/api-calls.json", "utf8"));
const client = new Nomba({ clientId: "x", clientSecret: "x", accountId: "x" });
const missing = calls.filter((c) => {
  const [res, method] = c.split(".");
  return typeof client[res]?.[method] !== "function";
});
if (missing.length) {
  console.error(`✗ not in @nombaoss/nomba-node ${Nomba.VERSION}: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`✓ ${calls.length} Node calls exist in @nombaoss/nomba-node ${Nomba.VERSION}`);
