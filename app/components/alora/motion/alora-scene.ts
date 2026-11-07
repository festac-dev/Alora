import { mountScene, THREE, ease, type Studio } from "./scene-engine";

function build({ world, box, mesh }: Studio) {
  const folder = new THREE.Group();
  world.add(folder);
  box(2.25, 3.05, 0.1, "accent", folder).position.z = -0.36;
  const spine = box(0.11, 3.05, 0.6, "accent", folder);
  spine.position.x = -1.13;
  const cover = new THREE.Group();
  folder.add(cover);
  cover.position.set(-1.13, 0, 0.34);
  const front = box(2.25, 3.05, 0.065, "accent", cover);
  front.position.x = 1.13;
  const plaque = box(1.6, 0.74, 0.025, "surface", cover);
  plaque.position.set(1.13, 0.52, 0.06);
  const mark = new THREE.Group();
  cover.add(mark);
  mark.position.set(0.62, 0.52, 0.09);
  for (const side of [-1, 1]) {
    const stroke = box(0.04, 0.33, 0.025, "accent", mark);
    stroke.rotation.z = -side * 0.34;
    stroke.position.x = side * 0.055;
  }
  const cross = box(0.16, 0.035, 0.025, "accent", mark);
  cross.position.y = -0.035;
  for (let i = 0; i < 3; i++) {
    const line = box(0.72 - i * 0.1, 0.035, 0.02, "text", cover);
    line.position.set(1.38 - i * 0.05, 0.65 - i * 0.13, 0.09);
  }
  const fold = box(1.7, 0.025, 0.02, "surface", cover);
  fold.position.set(1.13, -0.95, 0.06);
  const sheets = Array.from({ length: 3 }, (_, i) => {
    const page = new THREE.Group();
    world.add(page);
    box(1.55, 2.42, 0.035, "surface", page);
    const top = box(1.55, 0.07, 0.045, i === 2 ? "secondary" : "accent", page);
    top.position.y = 1.17;
    const title = box(0.81, 0.09, 0.025, "text", page);
    title.position.set(-0.16, 0.82, 0.12);
    for (let j = 0; j < 7; j++) {
      const line = box(
        j % 3 === 0 ? 0.6 : 1.13,
        0.025,
        0.02,
        j === 5 ? "accent" : "line",
        page,
      );
      line.position.set(j % 3 === 0 ? -0.26 : 0, 0.46 - j * 0.18, 0.12);
    }
    const blocks = Array.from({ length: 5 }, (_, j) => {
      const cell = box(0.13, 0.11, 0.023, "secondary", page);
      cell.position.set(-0.48 + j * 0.24, -0.98, 0.12);
      return cell;
    });
    return { page, blocks };
  });
  const scanner = new THREE.Group();
  world.add(scanner);
  box(5.15, 0.023, 0.025, "accent", scanner);
  const beam = mesh(
    new THREE.PlaneGeometry(5.15, 0.15),
    "accent",
    scanner,
    0,
    0.1,
  );
  beam.position.y = 0.08;
  return (time: number) => {
    const t = time % 24;
    const close = ease((t - 17) / 3.2);
    const open = ease(t / 3.2) * (1 - close);
    const spread = ease((t - 2.3) / 3.5) * (1 - ease((t - 13.3) / 3.5));
    const inspect = ease((t - 6) / 5.5);
    world.rotation.set(-0.12 + spread * 0.08, -0.26 + spread * 0.16, -0.04);
    folder.position.set(spread * 0.1, -spread * 0.06, -spread * 0.6);
    cover.rotation.y = -open * 2.75;
    sheets.forEach(({ page, blocks }, i) => {
      page.position.set(
        (i - 1) * (0.045 + spread * 1.69),
        Math.sin(spread * Math.PI) * (i % 2 ? 0.12 : -0.08),
        -0.22 + i * 0.13 + spread * 1.1,
      );
      page.rotation.set(0, (i - 1) * spread * -0.12, (i - 1) * spread * 0.035);
      blocks.forEach((cell, j) => {
        const checked = ease((t - 8 - i * 0.55 - j * 0.13) / 0.35);
        cell.scale.y = 0.18 + checked * 0.82;
      });
    });
    scanner.visible = t >= 6 && t < 12;
    scanner.position.set(0, 1.26 - inspect * 2.5, 1.25);
    scanner.scale.x = 0.94 + Math.sin(inspect * Math.PI) * 0.06;
  };
}
export function start(host: HTMLElement, phase: (value: number) => void) {
  return mountScene(
    host,
    {
      surface: "--alora-surface",
      raised: "--alora-raised",
      line: "--alora-line-strong",
      text: "--alora-text",
      accent: "--alora-accent",
      secondary: "--alora-ok",
    },
    24,
    build,
    phase,
    { width: 6.8, height: 4.3 },
  );
}
