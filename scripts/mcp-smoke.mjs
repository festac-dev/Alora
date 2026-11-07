#!/usr/bin/env node
/**
 * Authenticated MCP end-to-end probe for Alora.
 *
 * Speaks the MCP Streamable HTTP handshake (initialize -> initialized ->
 * tools/list -> tools/call) against a running server with a bearer token, then
 * asserts that the mutation was attributed to the "mcp" caller in the ledger.
 *
 * Usage:
 *   ACCESS_TOKEN=<token> node scripts/mcp-smoke.mjs [baseUrl]
 *
 * The server must run with the same ACCESS_TOKEN. Any Streamable HTTP host
 * (Claude Desktop, Claude Code, another agent) sends the same requests.
 */
import { randomUUID } from "node:crypto";

import { validateManifest } from "../shared/manifest.ts";

const baseUrl = (process.argv[2] ?? "http://localhost:8080").replace(/\/$/, "");
const token = process.env.ACCESS_TOKEN ?? "";

if (!token) {
  console.error(
    "Missing ACCESS_TOKEN. Start the server and the probe with the same token.",
  );
  process.exit(2);
}

let sessionId = null;
let nextId = 1;

function parseBody(text, contentType) {
  if (contentType.includes("text/event-stream")) {
    const events = text
      .split(/\n\n+/)
      .map((chunk) =>
        chunk
          .split(/\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join(""),
      )
      .filter(Boolean);
    for (const event of events.reverse()) {
      try {
        return JSON.parse(event);
      } catch {
        // keep looking for a JSON payload
      }
    }
    return null;
  }
  return JSON.parse(text);
}

async function rpc(method, params) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method,
      ...(params === undefined ? {} : { params }),
    }),
  });
  const newSession = response.headers.get("mcp-session-id");
  if (newSession) sessionId = newSession;
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${method} failed: HTTP ${response.status} ${text.slice(0, 300)}`,
    );
  }
  const body = text
    ? parseBody(text, response.headers.get("content-type") ?? "")
    : null;
  if (!body) throw new Error(`${method} returned no JSON-RPC payload`);
  if (body.error) {
    const error = new Error(
      `${method} returned a JSON-RPC error: ${JSON.stringify(body.error)}`,
    );
    error.rpcError = body.error;
    throw error;
  }
  return body.result;
}

async function notify(method) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method }),
  });
  if (response.status >= 400) {
    throw new Error(`${method} failed: HTTP ${response.status}`);
  }
}

function toolPayload(result) {
  if (result?.structuredContent) return result.structuredContent;
  const text = (result?.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

const reference = `MCP-SMOKE-${randomUUID().slice(0, 8).toUpperCase()}`;

const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "alora-mcp-smoke", version: "1.0.0" },
});
console.log(
  `PASS initialize: ${init?.serverInfo?.name ?? "server"} ${init?.serverInfo?.version ?? ""} · session ${sessionId ?? "none"}`,
);

await notify("notifications/initialized");
console.log("PASS initialized");

const tools = await rpc("tools/list", {});
const toolNames = (tools?.tools ?? []).map((tool) => tool.name);
for (const required of ["create-shipment", "get-shipment"]) {
  if (!toolNames.includes(required)) {
    throw new Error(`tool ${required} is not exposed over MCP`);
  }
}
if (toolNames.includes("approve-deliverable")) {
  throw new Error(
    "approve-deliverable must not be exposed to agents; approval is a human gate",
  );
}
console.log(
  `PASS tools/list: ${toolNames.length} tools including create-shipment, no approval tool`,
);

const created = toolPayload(
  await rpc("tools/call", {
    name: "create-shipment",
    arguments: {
      reference,
      destination: "DE",
      currency: "EUR",
      origin: "CN",
      incoterms: "CIF",
      exporter: "MCP Probe Trading Co.",
      importer: "Northline Imports GmbH",
      shippingCost: 0,
      insuranceCost: 0,
      notes:
        "Authenticated MCP session probe. Created by an external MCP client.",
      items: [
        {
          description: "Industrial network router, 4-port, model AR-4",
          quantity: 2,
          unitValue: 185,
          hsCode: "85176200",
          weightKg: 1.8,
          countryOfOrigin: "CN",
        },
      ],
    },
  }),
);
if (!created?.id && !created?.reference) {
  const match = /\b([A-Z]{2,}-[A-Z]{2}-[A-Z0-9]+)\b/.exec(created?.text ?? "");
  if (match?.[1]) {
    created.reference = match[1];
  }
}
if (!created?.id && !created?.reference) {
  throw new Error(
    `create-shipment returned no reference: ${JSON.stringify(created)}`,
  );
}
const createdRef = created.reference ?? created.id;
console.log(
  `PASS tools/call create-shipment: ${createdRef}${created.id ? ` (${created.id})` : ""}`,
);

const initialBundle = toolPayload(
  await rpc("tools/call", {
    name: "get-shipment",
    arguments: { shipmentId: created.id ?? createdRef },
  }),
);
const initialLedger = (initialBundle?.ledger ?? [])
  .slice()
  .sort((a, b) => b.id - a.id);
const latest = initialLedger[0];
if (!latest) throw new Error("get-shipment returned no ledger rows");
if (latest.caller !== "mcp") {
  throw new Error(
    `ledger row ${latest.id} recorded caller "${latest.caller}", expected "mcp"`,
  );
}
const foreignCaller = initialLedger.find((entry) => entry.caller !== "mcp");
if (foreignCaller) {
  throw new Error(
    `ledger row ${foreignCaller.id} recorded caller "${foreignCaller.caller}", expected every row in this MCP shipment to be "mcp"`,
  );
}
console.log(
  `PASS ledger attribution: ${initialLedger.length} ${initialLedger.length === 1 ? "entry" : "entries"}, latest #${latest.id} ${latest.actionName} caller=${latest.caller} actor=${latest.actor}`,
);

// A refusal is a negative answer from the server (unknown tool, rejected tool
// call, or an action error), never a transport failure. Anything that is not an
// explicit refusal fails the probe instead of counting as a pass.
const REFUSAL =
  /unknown tool|not allowed|not permitted|unauthor|forbidden|human|approval/i;
let refusalEvidence = "";
try {
  const attempt = await rpc("tools/call", {
    name: "approve-deliverable",
    arguments: {
      shipmentId: created.id ?? createdRef,
      deliverableId: "probe",
      approverId: "mcp-probe@alora.local",
      approverKind: "human",
    },
  });
  const text = JSON.stringify(attempt);
  if (attempt?.isError !== true || !REFUSAL.test(text)) {
    throw new Error(
      `approve-deliverable answered without an explicit refusal: ${text}`,
    );
  }
  refusalEvidence = text;
} catch (error) {
  if (!error?.rpcError) throw error;
  const text = JSON.stringify(error.rpcError);
  if (!REFUSAL.test(text)) throw error;
  refusalEvidence = text;
}

const afterApproval = toolPayload(
  await rpc("tools/call", {
    name: "get-shipment",
    arguments: { shipmentId: created.id ?? createdRef },
  }),
);
if ((afterApproval?.approvals ?? []).length > 0) {
  throw new Error("an approval was recorded for a non-human MCP caller");
}
console.log(
  `PASS approval refusal: approve-deliverable was refused (${refusalEvidence.slice(0, 120)}) and no approval was recorded`,
);

const built = toolPayload(
  await rpc("tools/call", {
    name: "builder-classify",
    arguments: { shipmentId: created.id ?? createdRef },
  }),
);
if (!built?.deliverableId || !built?.sha256) {
  throw new Error(
    `builder-classify returned no locked deliverable: ${JSON.stringify(built)}`,
  );
}
console.log(
  `PASS tools/call builder-classify: v${built.version} ${String(built.sha256).slice(0, 16)}…`,
);

const verifierResult = await rpc("tools/call", {
  name: "verifier-check",
  arguments: { shipmentId: created.id ?? createdRef },
});
const verifierText = (verifierResult?.content ?? [])
  .filter((item) => item.type === "text")
  .map((item) => item.text)
  .join("");
if (verifierResult?.isError || !verifierText.includes('"status":"verified"')) {
  throw new Error(
    `verifier-check did not pass the MCP-built package: ${JSON.stringify(verifierResult)}`,
  );
}
const passCount = (verifierText.match(/"status":"pass"/g) ?? []).length;
if (passCount === 0) {
  throw new Error("verifier-check returned no passing checks");
}
console.log(
  "PASS tools/call verifier-check: verified with passing deterministic checks",
);

const chain = toolPayload(
  await rpc("tools/call", {
    name: "verify-evidence-chain",
    arguments: { shipmentId: created.id ?? createdRef },
  }),
);
if (!chain?.valid || !chain?.chainValid) {
  throw new Error(`verify-evidence-chain failed: ${JSON.stringify(chain)}`);
}
if ((chain.deliverables ?? []).some((row) => !row.hashMatches)) {
  throw new Error("verify-evidence-chain found a deliverable hash mismatch");
}
console.log(
  `PASS tools/call verify-evidence-chain: ${chain.ledgerEntries} entries, ${chain.deliverables?.length ?? 0} deliverable hashes match`,
);

const exportResult = await rpc("tools/call", {
  name: "export-shipment",
  arguments: { shipmentId: created.id ?? createdRef },
});
const exportText = (exportResult?.content ?? [])
  .filter((item) => item.type === "text")
  .map((item) => item.text)
  .join("");
if (exportResult?.isError || !exportText.includes('"manifestVersion":2')) {
  throw new Error(
    `export-shipment returned no manifest: ${JSON.stringify(exportResult)}`,
  );
}
const exported = toolPayload(exportResult);
const validation = validateManifest(exported);
if (
  !validation.valid ||
  validation.status !== "incomplete" ||
  !validation.currentVerificationPassed
) {
  throw new Error(
    `Exported proof did not validate as verified but unapproved: ${JSON.stringify(validation)}`,
  );
}
console.log(
  "PASS tools/call export-shipment: version 2 proof validated, human approval remains incomplete",
);

console.log(`PASS reference: ${reference}`);
