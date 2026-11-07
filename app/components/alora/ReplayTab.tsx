import { IconArrowBackUp, IconGitFork } from "@tabler/icons-react";

import type { AloraBundle } from "./types";
import { Badge, Button, HashValue, Panel } from "./ui";

function callerTone(caller: string) {
  if (caller === "mcp") return "accent" as const;
  if (caller === "agent" || caller === "tool") return "warn" as const;
  if (caller === "seed") return "neutral" as const;
  return "ok" as const;
}

export function ReplayTab({
  bundle,
  busy,
  onRewind,
}: {
  bundle: AloraBundle;
  busy: string | null;
  onRewind: (ledgerId: number) => Promise<unknown>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)]">
      <Panel
        title="Replay"
        right={
          <Badge tone={bundle.chain.valid ? "ok" : "danger"}>
            {bundle.chain.entries} entries ·{" "}
            {bundle.chain.valid ? "chain valid" : "chain broken"}
          </Badge>
        }
      >
        <div className="relative grid gap-0">
          {bundle.ledger.map((entry, index) => (
            <div
              key={entry.id}
              className="grid grid-cols-[20px_minmax(0,1fr)_auto] gap-3 border-b border-[var(--alora-line)] py-3 last:border-b-0"
            >
              <div className="relative flex justify-center">
                <div
                  className="mt-[6px] size-[7px] rounded-full"
                  style={{
                    background:
                      index === bundle.ledger.length - 1
                        ? "var(--alora-accent)"
                        : "var(--alora-line-strong)",
                  }}
                />
                {index < bundle.ledger.length - 1 ? (
                  <div className="absolute top-[15px] bottom-[-15px] left-1/2 w-px -translate-x-1/2 bg-[var(--alora-line)]" />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="alora-mono text-[12px]">
                    #{entry.id} {entry.actionName}
                  </span>
                  <Badge tone={callerTone(entry.caller)}>{entry.caller}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--alora-muted)]">
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  <span>{entry.actor}</span>
                  <span>inverse {entry.inverseAction}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3">
                  <HashValue label="Prev" value={entry.prevHash} chars={10} />
                  <HashValue label="Hash" value={entry.entryHash} chars={10} />
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-[var(--alora-muted)]">
                    Advanced
                  </summary>
                  <pre className="alora-mono mt-1 max-h-40 overflow-auto rounded bg-[var(--alora-bg)] p-2 text-[11px] leading-relaxed">
                    {entry.payload}
                  </pre>
                </details>
              </div>
              <div className="flex items-start">
                {entry.actionName !== "rewindShipment" ? (
                  <Button
                    variant="ghost"
                    busy={busy === `rewind-${entry.id}`}
                    onClick={() => void onRewind(entry.id)}
                    aria-label={`Rewind to entry ${entry.id}`}
                    title={`Rewind to entry ${entry.id}`}
                    className="px-2"
                  >
                    <IconArrowBackUp size={14} />
                  </Button>
                ) : (
                  <Badge tone="accent">Rewind</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid min-w-0 content-start gap-4">
        <Panel
          title="Acceptance criteria"
          right={<Badge tone="accent">{bundle.tasks.length} tasks</Badge>}
        >
          {bundle.mission ? (
            <>
              <p className="text-[12px] leading-relaxed">
                {bundle.mission.outcome}
              </p>
              <div className="mt-3 grid gap-2">
                {bundle.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start justify-between gap-2 rounded border border-[var(--alora-line)] px-2 py-2"
                  >
                    <div>
                      <div className="text-[12px]">{task.title}</div>
                      <div className="alora-mono mt-1 text-[11px] text-[var(--alora-muted)]">
                        {task.assigneeAgentId}
                      </div>
                    </div>
                    <Badge
                      tone={
                        task.assigneeAgentId?.startsWith("human")
                          ? "ok"
                          : "neutral"
                      }
                    >
                      {task.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[12px] text-[var(--alora-muted)]">
              Mission not planned.
            </p>
          )}
        </Panel>

        <Panel title="Fork lineage">
          <div className="flex items-center gap-2 text-[12px] text-[var(--alora-muted)]">
            <IconGitFork size={14} className="text-[var(--alora-accent)]" />
            {bundle.shipment.forkedFrom
              ? `Forked from ${bundle.shipment.forkedFrom}`
              : "Root shipment"}
          </div>
        </Panel>
      </div>
    </div>
  );
}
