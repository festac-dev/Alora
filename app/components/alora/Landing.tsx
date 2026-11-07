import { PageMotion } from "./PageMotion";
import { DocumentScene } from "./DocumentScene";
import { MotionRegion } from "./MotionRegion";
import { ThemeToggle } from "./ThemeToggle";

import "./landing.css";

export function Landing() {
  return (
    <div className="alora-root alora-site">
      <PageMotion />
      <a className="al-skip" href="#alora-intro">
        Skip to content
      </a>
      <header className="al-nav">
        <a className="al-brand" href="/" aria-label="Alora home">
          <img src="/logo-mark.svg" width="36" height="36" alt="" />
          Alora
        </a>
        <nav aria-label="Main navigation">
          <a href="#workflow">The process</a>
          <a href="#evidence">The evidence</a>
          <a href="/control">Open workspace ↗</a>
        </nav>
        <ThemeToggle />
      </header>
      <main id="alora-intro" tabIndex={-1}>
        <section className="al-cover">
          <p className="al-tagline">
            Alora - Cross-border operations made easy
          </p>
          <div className="al-cover-heading">
            <h1>
              Complex shipments.
              <br />
              <span>Clear decisions.</span>
            </h1>
            <div className="al-cover-summary">
              <p>
                Bring documents, calculations and evidence together. Know what
                needs attention before you approve.
              </p>
              <a className="alora-button alora-button-primary" href="/control">
                Open mission control <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <div className="al-desk">
            <div className="al-desk-index">
              <span className="al-eyebrow">Inside every package</span>
              <ol>
                <li>Source documents</li>
                <li>Versioned calculations</li>
                <li>Independent checks</li>
                <li>Human authorization</li>
              </ol>
              <a href="#workflow">Follow the process ↓</a>
            </div>
            <div className="al-scroll-scene" data-scroll-scene><DocumentScene /></div>
            <div className="al-desk-caption">
              <span className="al-folio">01—04</span>
              <p>
                Every claim has a source.
                <br />
                Every decision has a record.
              </p>
              <span className="al-small">Illustrated workflow</span>
            </div>
          </div>
        </section>
        <section className="al-process" id="workflow">
          <div className="al-section-title">
            <span className="al-eyebrow">01 / The process</span>
            <h2>
              From the first document
              <br />
              to the final review.
            </h2>
          </div>
          <MotionRegion className="al-flow al-motion">
            <div className="al-flow-track" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            {[
              [
                "01",
                "Prepare",
                "Create a shipment. Classify items and calculate duty, VAT and landed cost using versioned tariff sources.",
              ],
              [
                "02",
                "Challenge",
                "Surface unsupported amounts and tariff gaps. Recompute the figures against the source inputs.",
              ],
              [
                "03",
                "Authorize",
                "Review the verified evidence. Human approval binds to the exact document version.",
              ],
              [
                "04",
                "Trace",
                "Follow the history, compare versions and export a manifest with the evidence behind every decision.",
              ],
            ].map(([n, title, body]) => (
              <article key={n}>
                <span className="al-step-dot" aria-hidden="true" />
                <span className="al-step-number">{n}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </MotionRegion>
        </section>
        <section className="al-evidence" id="evidence">
          <div className="al-evidence-copy">
            <span className="al-eyebrow">02 / The evidence</span>
            <h2>
              A complete record.
              <br />
              <span>Nothing lost between versions.</span>
            </h2>
            <p>
              A repair creates a new version. Previous documents and findings
              remain in the history, with approval tied to the work you actually
              reviewed.
            </p>
            <a href="/control/evidence">Inspect the evidence ↗</a>
          </div>
          <MotionRegion className="al-proof al-motion">
            <div className="al-proof-heading">
              <span>Package history</span>
              <span className="al-small">Illustration</span>
            </div>
            <div className="al-proof-paper" aria-hidden="true">
              <div className="al-proof-mark">A</div>
              <span />
              <span />
              <span />
              <span />
              <i className="al-proof-scan" />
            </div>
            <ol className="al-proof-records">
              <li>
                <i />
                Source inputs preserved
              </li>
              <li>
                <i />
                Document bytes checked
              </li>
              <li>
                <i />
                Amounts recomputed
              </li>
              <li>
                <i />
                Ready for human review
              </li>
            </ol>
            <p className="al-small">
              Changes require fresh verification and review.
            </p>
          </MotionRegion>
        </section>
        <section className="al-questions">
          <h2>Before you begin</h2>
          <div>
            <details>
              <summary>What does Alora handle?</summary>
              <p>
                Alora prepares and verifies shipment packages. It does not file
                customs declarations or replace a customs broker. Classification
                and tariff coverage still require appropriate review.
              </p>
            </details>
            <details>
              <summary>Which destinations are supported?</summary>
              <p>
                Current tariff snapshots cover selected rows for Germany, the US
                and the UAE. UAE base codes require explicit acknowledgement of
                the unconfirmed national suffix before approval.
              </p>
            </details>
            <details>
              <summary>Can I explore a complete workflow?</summary>
              <p>
                The workspace includes a seeded shipment you can inspect, repair
                and verify. The core workflow runs without a model provider.
                Chat requires a configured provider, and courier outreach
                currently records a mock send.
              </p>
            </details>
          </div>
        </section>
      </main>
      <footer className="al-footer">
        <a className="al-brand" href="/">
          Alora
        </a>
        <span>Agents execute. Humans authorize.</span>
        <a href="/control">Open workspace ↗</a>
      </footer>
    </div>
  );
}
