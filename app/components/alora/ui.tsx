import type { CSSProperties, ReactNode } from "react";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";

const TONE_STYLE: Record<Tone, CSSProperties> = {
  neutral: { color: "var(--alora-muted)", borderColor: "var(--alora-line)" },
  accent: {
    color: "var(--alora-accent)",
    borderColor: "var(--alora-line-strong)",
  },
  ok: { color: "var(--alora-ok)", borderColor: "#2f5b46" },
  warn: { color: "var(--alora-warn)", borderColor: "#5d4a24" },
  danger: { color: "var(--alora-danger)", borderColor: "#6a3a42" },
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span className="alora-chip" style={TONE_STYLE[tone]}>
      {children}
    </span>
  );
}

export function Panel({
  title,
  right,
  children,
  className = "",
  tone = "neutral",
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return (
    <section
      className={`alora-panel min-w-0 rounded ${tone === "danger" ? "alora-panel-hot" : ""} ${tone === "ok" ? "alora-panel-verified" : ""} ${className}`}
    >
      {(title || right) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--alora-line)] px-4 py-2.5">
          {title ? (
            <h2 className="min-w-0 text-[13px] font-semibold">{title}</h2>
          ) : null}
          {right ? <div className="min-w-0">{right}</div> : null}
        </header>
      )}
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const color =
    tone === "danger"
      ? "var(--alora-danger)"
      : tone === "ok"
        ? "var(--alora-ok)"
        : tone === "warn"
          ? "var(--alora-warn)"
          : tone === "accent"
            ? "var(--alora-accent)"
            : "var(--alora-text)";
  return (
    <div className="min-w-0 border-l border-[var(--alora-line)] pl-3">
      <div className="alora-label">{label}</div>
      <div
        className="alora-mono mt-1 truncate text-[19px] leading-tight"
        style={{ color }}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[12px] text-[var(--alora-muted)]">{hint}</div>
      ) : null}
    </div>
  );
}

export function HashValue({
  value,
  label,
  chars = 16,
}: {
  value: string | null | undefined;
  label?: string;
  chars?: number;
}) {
  if (!value) {
    return <span className="text-[var(--alora-muted)]">Not set</span>;
  }
  const short = value.length > chars ? `${value.slice(0, chars)}…` : value;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      {label ? <span className="alora-label shrink-0">{label}</span> : null}
      <code
        className="alora-mono min-w-0 truncate text-[12px] text-[var(--alora-text)]"
        title={value}
      >
        {short}
      </code>
    </span>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 border border-dashed border-[var(--alora-line)] rounded px-5 py-7">
      <div className="text-sm font-medium">{title}</div>
      {detail ? (
        <p className="max-w-xl text-[12px] leading-relaxed text-[var(--alora-muted)]">
          {detail}
        </p>
      ) : null}
      {action}
    </div>
  );
}

export function Button({
  variant = "default",
  busy = false,
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger" | "ghost";
  busy?: boolean;
}) {
  const variantClass =
    variant === "primary"
      ? "alora-button-primary"
      : variant === "danger"
        ? "alora-button-danger"
        : variant === "ghost"
          ? "alora-button-ghost"
          : "";
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      aria-busy={busy || undefined}
      disabled={props.disabled || busy}
      className={`alora-button ${variantClass} ${className}`}
    >
      {children}
      {busy ? <span className="alora-busy">Working</span> : null}
    </button>
  );
}

export function KeyValue({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-b border-[var(--alora-line)] py-2 last:border-b-0 sm:grid-cols-[124px_minmax(0,1fr)]">
      <div className="alora-label pt-[2px]">{label}</div>
      <div className={`min-w-0 text-[12px] ${mono ? "alora-mono" : ""}`}>
        {children}
      </div>
    </div>
  );
}

export function formatMoney(
  value: number | null | undefined,
  currency: string,
) {
  if (value === null || value === undefined) return "Not calculated";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function riskTone(risk: string | undefined): Tone {
  if (risk === "red" || risk === "critical") return "danger";
  if (risk === "green") return "ok";
  return "warn";
}
