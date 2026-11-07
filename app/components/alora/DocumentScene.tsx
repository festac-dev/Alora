import { useEffect, useRef, useState } from "react";

import "./document-scene.css";

const phases = [
  "Build the package",
  "Recompute the amounts",
  "Bind the evidence",
  "Ready for human review",
];
/** Illustrative only: this scene never reads or mutates product records. */
export function DocumentScene() {
  const host = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    import("./motion/alora-scene")
      .then((module) => {
        if (!controller.signal.aborted && host.current) {
          dispose = module.start(host.current, setPhase);
        }
      })
      .catch(() => {
        if (host.current) host.current.dataset.render = "fallback";
      });
    return () => {
      controller.abort();
      dispose?.();
    };
  }, []);
  return (
    <figure className="al-cinema">
      <figcaption className="al-cinema-heading">
        <span>Inside the package</span>
        <span>Workflow illustration</span>
      </figcaption>
      <div
        ref={host}
        className="al-cinema-stage"
        data-cinema
        role="img"
        aria-label="An illustrative package assembles from source documents, is checked, and binds to its evidence. Human approval remains a separate step."
      >
        <div className="al-cinema-fallback" aria-hidden="true">
          <img src="/logo-mark.svg" alt="" width="64" height="64" />
          <strong>Alora</strong>
          <p>Source → Checks → Evidence</p>
        </div>
      </div>
      <div className="al-cinema-footer">
        <div>
          <span>{phases[phase]}</span>
          <div className="al-cinema-progress" aria-hidden="true">
            {phases.map((name, i) => (
              <i key={name} data-active={phase === i} />
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
