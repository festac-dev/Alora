import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { Button } from "./ui";

const TOUR_STEPS = [
  {
    title: "Shipment",
    body: "Package, totals and claim state.",
  },
  {
    title: "Evidence",
    body: "Hashes, checks and the ledger chain.",
  },
  {
    title: "Approval",
    body: "One hash, one human approval.",
  },
  {
    title: "Replay",
    body: "Every mutation, with rewind.",
  },
  {
    title: "Extensions",
    body: "Intake, outreach and templates.",
  },
] as const;

const CONSTRAINTS = [
  "Single-tenant workspace. Records are not scoped per user.",
  "Ledger appends are serialized inside one server process.",
  "UAE tariff rows are 8-digit GCC/HS base codes. The national suffix is unconfirmed.",
  "Capabilities activate only from a reviewed template. A changed template is refused.",
] as const;

export function Tour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const current = TOUR_STEPS[step] ?? TOUR_STEPS[0];
  const last = step === TOUR_STEPS.length - 1;

  return (
    <div className="alora-tour-backdrop" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alora-tour-title"
        className="alora-tour"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="alora-label">
            Step {step + 1} of {TOUR_STEPS.length}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="alora-button alora-button-ghost -mt-2 -mr-2 px-2"
            aria-label="Close tour"
          >
            <IconX size={15} />
          </button>
        </div>
        <h2 id="alora-tour-title" className="mt-1 text-[16px] font-semibold">
          {current.title}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--alora-muted)]">
          {current.body}
        </p>
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button onClick={() => setStep(step - 1)}>
                <IconChevronLeft size={14} /> Back
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => (last ? onClose() : setStep(step + 1))}
            >
              {last ? "Done" : "Next"}
              {last ? null : <IconChevronRight size={14} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HelpDialog({
  open,
  onClose,
  onStartTour,
}: {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="alora-tour-backdrop" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alora-help-title"
        className="alora-tour"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="alora-help-title" className="text-[16px] font-semibold">
            Help
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="alora-button alora-button-ghost -mt-2 -mr-2 px-2"
            aria-label="Close help"
          >
            <IconX size={15} />
          </button>
        </div>

        <div className="mt-4">
          <div className="alora-label">Tour</div>
          <Button className="mt-2" onClick={onStartTour}>
            Show tour
          </Button>
        </div>

        <div className="mt-5">
          <div className="alora-label">Constraints</div>
          <ul className="mt-2 grid gap-2">
            {CONSTRAINTS.map((item) => (
              <li
                key={item}
                className="border-l border-[var(--alora-line-strong)] pl-3 text-[12px] leading-relaxed text-[var(--alora-muted)]"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
