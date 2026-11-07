import { useEffect } from "react";

export function PageMotion() {
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const nodes = document.querySelectorAll<HTMLElement>(".al-process .al-section-title,.al-flow article,.al-evidence-copy,.al-proof,.al-questions h2,.al-questions details,.al-footer");
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.arrival = "visible";
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.12 });
    const sync = () => {
      observer.disconnect();
      nodes.forEach((node, i) => {
        node.style.setProperty("--arrival-delay", `${i % 4 * 80}ms`);
        if (preference.matches || node.getBoundingClientRect().top < innerHeight * .92) {
          node.dataset.arrival = "visible";
        } else {
          node.dataset.arrival = "waiting";
          observer.observe(node);
        }
      });
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Element) {
        const node = event.target.closest<HTMLElement>("[data-arrival]");
        if (node) node.dataset.arrival = "visible";
      }
    };
    sync();
    preference.addEventListener("change", sync);
    document.addEventListener("focusin", focus);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", sync);
      document.removeEventListener("focusin", focus);
      nodes.forEach(node => { delete node.dataset.arrival; });
    };
  }, []);
  return null;
}
