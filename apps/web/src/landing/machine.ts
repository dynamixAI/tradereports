import {
  BoxGeometry,
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { EXAMPLE_FEATURES, formatValue } from '../features';

export interface MachineHandle {
  setDark(dark: boolean): void;
  stop(): void;
}

const CYCLE = 5500; // ms between presses
const COPPER = 0xe2784a;

// draw on a canvas and use it as a texture
function drawTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// a messy sheet: grid lines and a couple of odd cells
function sheetTexture(): CanvasTexture {
  return drawTexture(256, 320, (g) => {
    g.fillStyle = '#fafafa';
    g.fillRect(0, 0, 256, 320);
    g.strokeStyle = '#c9c9c9';
    g.lineWidth = 2;
    for (let x = 0; x <= 256; x += 42) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 320);
      g.stroke();
    }
    for (let y = 0; y <= 320; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
    }
    g.fillStyle = '#f2c4b0';
    g.fillRect(84, 64, 42, 32);
    g.fillRect(168, 160, 42, 32);
    g.fillStyle = '#e2784a';
    g.font = '700 30px "Space Grotesk", sans-serif';
    g.fillText('CSV', 14, 300);
  });
}

// a result card, drawn large so the figure stays sharp
function cardTexture(label: string, value: string): CanvasTexture {
  return drawTexture(640, 300, (g) => {
    g.fillStyle = '#17171a';
    g.fillRect(0, 0, 640, 300);
    g.fillStyle = '#e2784a';
    g.fillRect(0, 0, 640, 14);
    g.fillStyle = '#c9c3ba';
    g.font = '500 48px "Space Grotesk", sans-serif';
    g.fillText(label, 36, 100);
    g.fillStyle = '#ffffff';
    g.font = '700 120px "Space Grotesk", sans-serif';
    g.fillText(value, 32, 240);
  });
}

// builds the scene and runs it; returns null if WebGL isn't available
export function startMachine(
  canvas: HTMLCanvasElement,
  opts: { dark: boolean; calm: boolean },
): MachineHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const { calm } = opts;
  let dark = opts.dark;

  const scene = new Scene();
  // isometric view from above and to the side
  const cam = new OrthographicCamera(-5, 5, 5, -4.2, 0.1, 100);
  cam.position.set(10, 9, 10);
  cam.lookAt(0, 0.6, 0);

  scene.add(new HemisphereLight(0xffffff, 0x222222, 2.2));
  const key = new DirectionalLight(0xffffff, 2.6);
  key.position.set(5, 10, 3);
  scene.add(key);
  const glow = new PointLight(COPPER, 6, 12, 1);
  glow.position.set(0, 1.2, 0);
  scene.add(glow);

  // the machine: dark body, copper layers, top plate and pad
  const body = new MeshStandardMaterial({ color: 0x111113, metalness: 0.4, roughness: 0.55 });
  const copper = new MeshStandardMaterial({
    color: COPPER,
    emissive: COPPER,
    emissiveIntensity: 0.6,
    metalness: 0.6,
    roughness: 0.3,
  });
  const machine = new Group();
  scene.add(machine);
  const base = new Mesh(new BoxGeometry(4, 0.9, 4), body);
  base.position.y = 0.45;
  machine.add(base);
  const layers: Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const l = new Mesh(new BoxGeometry(4.05, 0.06, 4.05), copper);
    l.position.y = 0.98 + i * 0.1;
    machine.add(l);
    layers.push(l);
  }
  const plate = new Mesh(new BoxGeometry(4, 0.2, 4), body);
  plate.position.y = 1.45;
  machine.add(plate);
  const pad = new Mesh(
    new BoxGeometry(2.2, 0.04, 1.6),
    new MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.8 }),
  );
  pad.position.set(0, 1.57, 0);
  machine.add(pad);

  // the rail the sheets ride in on
  const rail = new Mesh(
    new BoxGeometry(5, 0.12, 1.3),
    new MeshStandardMaterial({ color: 0x8c8c90, metalness: 0.9, roughness: 0.25 }),
  );
  rail.position.set(4.2, 0.9, 0);
  scene.add(rail);

  const sheetMap = sheetTexture();
  const sheets = [0, 1, 2].map((i) => {
    const m = new Mesh(
      new PlaneGeometry(1, 1.25),
      new MeshStandardMaterial({ map: sheetMap, side: DoubleSide }),
    );
    m.rotation.x = -Math.PI / 2;
    scene.add(m);
    return { mesh: m, t: i / 3 };
  });

  // three result cards that rise out of the top
  const cards = [0, 1, 2].map((i) => {
    const mat = new MeshBasicMaterial({ transparent: true, opacity: calm ? 1 : 0 });
    const m = new Mesh(new PlaneGeometry(2.6, 1.22), mat);
    m.position.set(-1.8 + i * 1.8, 1.7, 1.8 - i * 1.8);
    m.lookAt(cam.position);
    scene.add(m);
    return { mesh: m, mat, show: calm ? 1 : 0 };
  });

  let set = 0;
  let press = 0;
  let burst = 0;
  const timers: number[] = [];

  // show the next three results on the cards
  function fillCards() {
    cards.forEach((c, i) => {
      const f = EXAMPLE_FEATURES[(set * 3 + i) % EXAMPLE_FEATURES.length];
      if (!f) return;
      c.mat.map?.dispose();
      c.mat.map = cardTexture(f.label, formatValue(f.value, f.money));
      c.mat.needsUpdate = true;
    });
    set++;
  }

  // one press: machine squashes, cards rise, then sink again
  function cycle() {
    press = 1;
    burst = 1;
    fillCards();
    cards.forEach((c, i) => timers.push(window.setTimeout(() => (c.show = 1), 250 + i * 200)));
    timers.push(window.setTimeout(() => cards.forEach((c) => (c.show = 0)), 3800));
  }

  function setDark(next: boolean) {
    dark = next;
    body.color.set(dark ? 0x111113 : 0xd9d9dc);
    body.metalness = dark ? 0.4 : 0.55;
    body.roughness = dark ? 0.55 : 0.3;
  }
  setDark(dark);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const a = w / h;
    renderer.setSize(w, h, false);
    // keep the whole scene in view on narrow screens
    const halfW = Math.max(4.6 * a, 5.2);
    const scale = halfW / (4.6 * a);
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = 5 * scale;
    cam.bottom = -4.2 * scale;
    cam.updateProjectionMatrix();
  }
  const sizer = new ResizeObserver(resize);
  sizer.observe(canvas);
  resize();

  // only draw while the canvas is on screen and the tab is open
  let onScreen = true;
  const watcher = new IntersectionObserver(([e]) => (onScreen = e?.isIntersecting ?? true));
  watcher.observe(canvas);

  let last = performance.now();
  let frame = 0;
  function loop(now: number) {
    frame = requestAnimationFrame(loop);
    if (!onScreen || document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // sheets slide along the rail into the slot
    for (const s of sheets) {
      if (!calm) s.t = (s.t + dt * 0.25) % 1;
      const x = 6.5 - s.t * 5;
      s.mesh.position.set(x, 1.0, 0);
      s.mesh.visible = x > 2.1;
    }

    // squash on press, float and sway the rest of the time
    press = Math.max(0, press - dt * 4);
    const squash = Math.sin(press * Math.PI);
    machine.scale.y = 1 - squash * 0.08;
    if (!calm) {
      machine.position.y = Math.sin(now / 1100) * 0.15;
      machine.rotation.y = Math.sin(now / 2600) * 0.06;
    }
    layers.forEach((l, i) => (l.position.y = 0.98 + i * 0.1 + squash * i * 0.03));

    // copper glows brighter on each press
    burst = Math.max(0, burst - dt * 1.5);
    copper.emissiveIntensity =
      (dark ? 0.6 : 0.25) + burst * 1.4 + (calm ? 0 : Math.sin(now / 600) * 0.1);
    glow.intensity = 6 + burst * 14;

    // cards fade in and float above the machine
    cards.forEach((c, i) => {
      c.mat.opacity += (c.show - c.mat.opacity) * Math.min(1, dt * 5);
      const lift = i === 1 ? 0.5 : 0;
      const bob = calm ? 0 : Math.sin(now / 900 + i) * 0.06;
      c.mesh.position.y = machine.position.y + 2.2 + lift + c.mat.opacity * 1.2 + bob;
    });

    renderer.render(scene, cam);
  }
  frame = requestAnimationFrame(loop);

  // redraw the current cards once the font has loaded
  void document.fonts.ready.then(() => {
    set = Math.max(0, set - 1);
    fillCards();
  });
  let every = 0;
  if (!calm) {
    timers.push(window.setTimeout(cycle, 300));
    every = window.setInterval(cycle, CYCLE);
  }

  return {
    setDark,
    stop() {
      cancelAnimationFrame(frame);
      clearInterval(every);
      timers.forEach((t) => clearTimeout(t));
      sizer.disconnect();
      watcher.disconnect();
      // free GPU memory
      scene.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          const m = o.material as MeshStandardMaterial | MeshBasicMaterial;
          m.map?.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
