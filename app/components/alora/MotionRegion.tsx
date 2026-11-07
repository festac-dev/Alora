import { useEffect, useRef, type ReactNode } from "react";

/** Decorative sequences run only while their section is visible. */
export function MotionRegion({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useRef(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    visible.current = false;
    const sync = () => {
      node.dataset.motion =
        visible.current && !document.hidden && !preference.matches
          ? "running"
          : "paused";
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry?.isIntersecting ?? false;
      sync();
    });
    observer.observe(node);
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return (
    <div ref={ref} className={className} data-motion="paused">
      {children}
    </div>
  );
}
