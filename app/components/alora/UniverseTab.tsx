import type { AgentTrust, AloraBundle } from "./types";
import { Badge, Panel } from "./ui";

function scoreColor(score: number) {
  if (score >= 75) return "var(--alora-ok)";
  if (score >= 45) return "var(--alora-warn)";
  return "var(--alora-danger)";
}

export function UniverseTab({
  bundle,
  agents,
}: {
  bundle: AloraBundle;
  agents: AgentTrust[];
}) {
  const width = 720;
  const height = 380;
  const centerX = width / 2;
  const centerY = height / 2;
  const ring = agents.filter((agent) => !agent.country);
  const desks = agents.filter((agent) => Boolean(agent.country));
  const inner = ring.slice(0, 8);
  const outer = desks.slice(0, 8);

  const ringNodes = inner.map((agent, index) => {
    const angle =
      (index / Math.max(inner.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      agent,
      x: centerX + Math.cos(angle) * 118,
      y: centerY + Math.sin(angle) * 92,
    };
  });
  const deskNodes = outer.map((agent, index) => {
    const angle =
      (index / Math.max(outer.length, 1)) * Math.PI * 2 +
      Math.PI / Math.max(outer.length, 1);
    return {
      agent,
      x: centerX + Math.cos(angle) * 250,
      y: centerY + Math.sin(angle) * 145,
    };
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.85fr)]">
      <Panel
        title="Agents"
        right={
          <Badge tone={bundle.chain.valid ? "ok" : "danger"}>
            {bundle.chain.entries} ledger events
          </Badge>
        }
      >
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="min-w-[640px]"
            role="img"
            aria-label="Agent relationship graph"
          >
            <circle
              cx={centerX}
              cy={centerY}
              r={70}
              fill="none"
              stroke="var(--alora-line-strong)"
            />
            {ringNodes.map((node) => (
              <line
                key={`edge-${node.agent.id}`}
                x1={centerX}
                y1={centerY}
                x2={node.x}
                y2={node.y}
                stroke="var(--alora-line)"
              />
            ))}
            {deskNodes.map((node, index) => {
              const anchor = ringNodes[index % Math.max(ringNodes.length, 1)];
              return (
                <line
                  key={`desk-edge-${node.agent.id}`}
                  x1={anchor?.x ?? centerX}
                  y1={anchor?.y ?? centerY}
                  x2={node.x}
                  y2={node.y}
                  stroke="var(--alora-line)"
                  strokeDasharray="3 4"
                />
              );
            })}
            <text
              x={centerX}
              y={centerY - 6}
              textAnchor="middle"
              fill="var(--alora-text)"
              fontSize="11"
              fontFamily="ui-monospace, monospace"
            >
              {bundle.shipment.reference}
            </text>
            <text
              x={centerX}
              y={centerY + 10}
              textAnchor="middle"
              fill="var(--alora-muted)"
              fontSize="9"
              fontFamily="ui-monospace, monospace"
            >
              {bundle.shipment.destination} · {bundle.risk}
            </text>
            {[...ringNodes, ...deskNodes].map((node) => (
              <g key={node.agent.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.agent.country ? 13 : 16}
                  fill="var(--alora-surface)"
                  stroke={scoreColor(node.agent.trustScore)}
                  strokeWidth="1.4"
                />
                <text
                  x={node.x}
                  y={node.y + 3}
                  textAnchor="middle"
                  fill={scoreColor(node.agent.trustScore)}
                  fontSize="8"
                  fontFamily="ui-monospace, monospace"
                >
                  {node.agent.role.slice(0, 2).toUpperCase()}
                </text>
                <text
                  x={node.x}
                  y={node.y + (node.agent.country ? 25 : 28)}
                  textAnchor="middle"
                  fill="var(--alora-muted)"
                  fontSize="8"
                  fontFamily="ui-monospace, monospace"
                >
                  {node.agent.country ?? node.agent.role}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <p className="mt-2 text-[11px] text-[var(--alora-muted)]">
          Colour is the ledger-derived trust score.
        </p>
      </Panel>

      <Panel title="Trust scores">
        <div className="overflow-x-auto">
          <table className="alora-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th className="text-right">Score</th>
                <th className="text-right">Verified</th>
                <th className="text-right">Approvals</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td>
                    <div className="alora-mono text-[11px]">
                      {agent.displayName}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--alora-muted)]">
                      {agent.country ? `${agent.country} desk` : "Core team"}
                    </div>
                  </td>
                  <td className="text-right">
                    <span
                      className="alora-mono text-[13px]"
                      style={{ color: scoreColor(agent.trustScore) }}
                    >
                      {agent.trustScore}
                    </span>
                  </td>
                  <td className="alora-mono text-right text-[12px]">
                    {agent.verifiedClaims}/{agent.totalClaims}
                  </td>
                  <td className="text-right">
                    <Badge
                      tone={agent.approvalsGranted === 0 ? "ok" : "danger"}
                    >
                      {agent.approvalsGranted}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
