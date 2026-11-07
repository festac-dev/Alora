#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { validateManifest } from "../shared/manifest.ts";

const [path, option, expectedTip] = process.argv.slice(2);
if (
  !path ||
  (option !== undefined && (option !== "--expected-tip" || !expectedTip))
) {
  console.error(
    "Usage: node scripts/verify-manifest.mjs <manifest.json> [--expected-tip <sha256>]",
  );
  process.exit(2);
}
try {
  const result = validateManifest(
    JSON.parse(readFileSync(path, "utf8")),
    expectedTip,
  );
  for (const error of result.errors) console.error(`INVALID: ${error}`);
  for (const warning of result.warnings) console.warn(`NOTE: ${warning}`);
  if (result.status === "approved")
    console.log(
      "APPROVED: document, current verification, human approval and ledger bindings match.",
    );
  else if (result.status === "incomplete")
    console.log(
      "INCOMPLETE: evidence is consistent, but the current artifact has no effective human approval.",
    );
  process.exitCode =
    result.status === "approved" ? 0 : result.status === "invalid" ? 1 : 2;
} catch (error) {
  console.error(
    `INVALID: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
