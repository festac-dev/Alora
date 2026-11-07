import * as THREE from "three";
import { SVGRenderer } from "three/examples/jsm/renderers/SVGRenderer.js";

export type Role =
  | "surface"
  | "raised"
  | "line"
  | "text"
  | "accent"
  | "secondary";
export type Studio = ReturnType<typeof createStudio>;
const ease = (x: number) => {
  const p = THREE.MathUtils.clamp(x, 0, 1);
  return p * p * (3 - 2 * p);
};
export { ease, THREE };

/** One owner for scene resources. No network assets or product-state mutations. */
function createStudio(host: HTMLElement, tokens: Record<Role, string>) {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const materials = new Map<
    THREE.MeshStandardMaterial | THREE.LineBasicMaterial,
    Role
  >();
  const material = (role: Role, metalness = 0.35, opacity = 1) => {
    const m = new THREE.MeshStandardMaterial({
      roughness: 0.32,
      metalness,
      transparent: opacity < 1,
      opacity,
      side: THREE.FrontSide,
    });
    materials.set(m, role);
    return m;
  };
  const mesh = (
    geometry: THREE.BufferGeometry,
    role: Role,
    parent: THREE.Object3D = world,
    metalness = 0.35,
    opacity = 1,
  ) => {
    const object = new THREE.Mesh(geometry, material(role, metalness, opacity));
    parent.add(object);
    return object;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    role: Role,
    parent: THREE.Object3D = world,
  ) => mesh(new THREE.BoxGeometry(w, h, d), role, parent);
  const ring = (
    r: number,
    tube: number,
    role: Role,
    parent: THREE.Object3D = world,
    arc = Math.PI * 2,
  ) => mesh(new THREE.TorusGeometry(r, tube, 8, 96, arc), role, parent, 0.65);
  const curve = (
    points: THREE.Vector3[],
    role: Role,
    parent: THREE.Object3D = world,
    thickness = 0.009,
  ) => {
    const path = new THREE.CatmullRomCurve3(points);
    const object = mesh(
      new THREE.TubeGeometry(path, 64, thickness, 5, false),
      role,
      parent,
    );
    return { object, path };
  };
  const line = (points: THREE.Vector3[], role: Role, opacity = 0.4) => {
    const m = new THREE.LineBasicMaterial({ transparent: true, opacity });
    materials.set(m, role);
    const object = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      m,
    );
    world.add(object);
    return object;
  };
  const color = () => {
    const css = getComputedStyle(host);
    materials.forEach((role, m) =>
      m.color.set(css.getPropertyValue(tokens[role]).trim() || "#7e9bab"),
    );
  };
  scene.add(new THREE.HemisphereLight(0xeef5ff, 0x273341, 2.7));
  const key = new THREE.DirectionalLight(0xffffff, 4);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd9ff, 3);
  rim.position.set(-4, 0, -2);
  scene.add(rim);
  return { scene, world, mesh, box, ring, curve, line, color };
}

export function mountScene(
  host: HTMLElement,
  tokens: Record<Role, string>,
  duration: number,
  build: (studio: Studio) => (time: number, phase: number) => void,
  onPhase: (phase: number) => void,
  composition = { width: 6.2, height: 4.2 },
) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  let renderer: THREE.WebGLRenderer | undefined;
  let vector: SVGRenderer | undefined;
  let surface: HTMLCanvasElement | SVGElement = canvas;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
  } catch {
    renderer = undefined;
  }
  const studio = createStudio(host, tokens);
  const animate = build(studio);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  let distance = 9;
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const story = host.closest<HTMLElement>("[data-scroll-scene]");
  let lastScrollInput = -Infinity;
  let visible = true,
    disposed = false,
    frame = 0,
    previous = 0,
    elapsed = 0,
    lastPhase = -1,
    lastDraw = 0;
  let pointerX = 0,
    pointerY = 0,
    scrollProgress = 0;
  const scroll = (event?: Event) => {
    const r = host.getBoundingClientRect();
    scrollProgress = THREE.MathUtils.clamp((innerHeight * 0.45 - r.top) / Math.max(innerHeight, r.height), -0.6, 0.8);
    if (!story || !event || preference.matches) return;
    const section = story.getBoundingClientRect();
    const figureHeight = host.closest("figure")?.getBoundingClientRect().height ?? innerHeight * 0.88;
    const travel = section.height - figureHeight;
    if (travel <= 0 || section.bottom <= 0 || section.top >= innerHeight) return;
    const progress = THREE.MathUtils.clamp((innerHeight * 0.06 - section.top) / travel, 0, 1);
    elapsed = progress * duration * 0.999;
    lastScrollInput = performance.now();
    previous = 0;
    host.dataset.clock = "scroll";
  };
  const render = () => {
    if (disposed) return;
    const t = preference.matches ? duration * 0.77 : elapsed;
    const phase = Math.floor((t % duration) / (duration / 4));
    animate(t, phase);
    const drift = preference.matches ? 0 : scrollProgress;
    camera.position.set(
      (preference.matches ? 0 : pointerX) + drift * 0.65,
      (preference.matches ? 0 : pointerY) + drift * 0.3,
      distance - drift * 0.2,
    );
    camera.lookAt(0, 0, 0);
    if (renderer) renderer.render(studio.scene, camera);
    else if (vector) {
      vector.render(studio.scene, camera);
      vector.domElement.style.backgroundColor = "transparent";
    }
    if (phase !== lastPhase) {
      lastPhase = phase;
      host.dataset.phase = String(phase);
      onPhase(phase);
      host.closest(".al-desk")?.querySelectorAll<HTMLElement>(".al-desk-index li").forEach((node, i) => { node.dataset.active = String(i === phase); });
    }
    host.dataset.render = preference.matches ? "static" : "live";
    if (preference.matches) host.dataset.clock = "reduced";
  };
  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    if (preference.matches) {
      render();
      return;
    }
    if (now - lastScrollInput > 1200) {
      elapsed += previous ? Math.min((now - previous) / 1000, 0.05) : 0;
      host.dataset.clock = "auto";
    }
    previous = now;
    if (renderer || now - lastDraw >= 1000 / 24) {
      render();
      lastDraw = now;
    }
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    if (!disposed && !document.hidden) {
      render();
      if (visible && !preference.matches) frame = requestAnimationFrame(tick);
    }
  };
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    if (renderer) renderer.setSize(width, height, false);
    else vector?.setSize(width, height);
    camera.aspect = width / height;
    const span = Math.max(
      composition.height,
      composition.width / camera.aspect,
    );
    distance =
      span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) + 1.2;
    camera.updateProjectionMatrix();
    if (scrollY > 0) scroll(new Event("resize"));
    render();
  };
  const recolor = () => {
    studio.color();
    render();
  };
  const move = (event: PointerEvent) => {
    if (preference.matches || event.pointerType !== "mouse") return;
    const r = host.getBoundingClientRect();
    pointerX = ((event.clientX - r.left) / r.width - 0.5) * 0.2;
    pointerY = -((event.clientY - r.top) / r.height - 0.5) * 0.14;
  };
  const leave = () => {
    pointerX = pointerY = 0;
  };
  // GPU loss must not remove the requested experience. The same scene can
  // render as vector geometry, with a lower tessellation and frame budget.
  const enableVectorRenderer = () => {
    if (vector || disposed) return;
    renderer?.dispose();
    renderer = undefined;
    canvas.remove();
    vector = new SVGRenderer();
    // Sort whole solids so a rear triangle cannot cover a raised front detail.
    vector.sortElements = false;
    vector.setQuality("high");
    vector.setPrecision(2);
    surface = vector.domElement;
    surface.setAttribute("aria-hidden", "true");
    surface.setAttribute("data-scene-surface", "");
    host.dataset.renderer = "svg";
    host.append(surface);
    // SVGRenderer reads ambient color directly and ignores its intensity.
    studio.scene.add(new THREE.AmbientLight(new THREE.Color(0.55, 0.55, 0.55)));
    studio.scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight) object.intensity *= 0.08;
    });
    studio.world.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const g = object.geometry;
      if (g instanceof THREE.TorusGeometry) {
        const p = g.parameters;
        object.geometry = new THREE.TorusGeometry(
          p.radius,
          p.tube,
          4,
          40,
          p.arc,
        );
        g.dispose();
      } else if (g instanceof THREE.TubeGeometry) {
        const p = g.parameters;
        object.geometry = new THREE.TubeGeometry(
          p.path,
          32,
          p.radius,
          3,
          p.closed,
        );
        g.dispose();
      } else if (g instanceof THREE.CylinderGeometry) {
        const p = g.parameters;
        object.geometry = new THREE.CylinderGeometry(
          p.radiusTop,
          p.radiusBottom,
          p.height,
          24,
        );
        g.dispose();
      }
    });
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    enableVectorRenderer();
    resize();
    sync();
  };
  const intersection = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? false;
    sync();
  });
  const resizer = new ResizeObserver(resize);
  const theme = new MutationObserver(recolor);
  canvas.setAttribute("data-scene-surface", "");
  if (renderer) {
    host.append(canvas);
    host.dataset.renderer = "webgl";
  } else enableVectorRenderer();
  studio.color();
  resizer.observe(host);
  intersection.observe(host);
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });
  preference.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  host.addEventListener("pointermove", move);
  host.addEventListener("pointerleave", leave);
  canvas.addEventListener("webglcontextlost", contextLost);
  window.addEventListener("scroll", scroll, { passive: true });
  scroll();
  resize();
  sync();
  return () => {
    disposed = true;
    window.removeEventListener("scroll", scroll);
    cancelAnimationFrame(frame);
    intersection.disconnect();
    resizer.disconnect();
    theme.disconnect();
    preference.removeEventListener("change", sync);
    document.removeEventListener("visibilitychange", sync);
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerleave", leave);
    canvas.removeEventListener("webglcontextlost", contextLost);
    const geometry = new Set<THREE.BufferGeometry>(),
      material = new Set<THREE.Material>();
    studio.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometry.add(object.geometry);
        for (const m of [object.material].flat()) material.add(m);
      }
    });
    geometry.forEach((g) => g.dispose());
    material.forEach((m) => m.dispose());
    renderer?.dispose();
    renderer?.forceContextLoss();
    surface.remove();
    delete host.dataset.render;
    delete host.dataset.renderer;
  };
}
