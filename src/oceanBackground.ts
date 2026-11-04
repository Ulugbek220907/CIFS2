import { OCEAN_GLYPHS, addImpulse, createGrid, glyphIndex, stepWave, swell, type OceanGrid } from './oceanSim';

// Home-page background: a sea of characters that rolls gently and ripples away from the mouse.
// Touch screens and "reduce motion" visitors get one still frame and no animation loop at all.

const TOP_RGB: readonly [number, number, number] = [99, 102, 241]; // indigo
const BOTTOM_RGB: readonly [number, number, number] = [56, 189, 248]; // sky blue
const STEP_SECONDS = 1 / 60;
const QUIET_AFTER_MS = 4500;
/** The slow ambient swell is drawn at ~30fps; full speed is only needed while the mouse makes ripples. */
const IDLE_FRAME_MS = 30;
const MIN_CELL = 28;
const MAX_CELL = 52;
const FONT_FAMILY = '"Plus Jakarta Sans Variable", ui-sans-serif, "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif';

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function wantsLiveMotion(): boolean {
  if (typeof matchMedia !== 'function') return false;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return finePointer && !reduced;
}

/** Starts the background on a canvas and returns a function that stops it and releases everything. */
export function mountOcean(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;

  const live = wantsLiveMotion();
  canvas.dataset.oceanMode = live ? 'live' : 'still';
  canvas.dataset.oceanActive = '0';

  let cell = 36;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let grid: OceanGrid = createGrid(2, 2);
  let targetCells = 1800;
  let raf = 0;
  let resizeTimer = 0;
  let quietUntil = 0;
  let accumulator = 0;
  let lastFrame = 0;
  let lastDraw = 0;
  let lastPointer: { x: number; y: number } | null = null;
  let costSum = 0;
  let costFrames = 0;
  let drops = 0;
  let stopped = false;
  let wasActive = false;

  const layout = (): void => {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = Math.min(MAX_CELL, Math.max(MIN_CELL, Math.sqrt((width * height) / targetCells)));
    grid = createGrid(Math.ceil(width / cell) + 2, Math.ceil(height / cell) + 2);
  };

  const draw = (t: number): void => {
    ctx.clearRect(0, 0, width, height);
    ctx.font = `600 ${Math.round(cell * 0.6)}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let row = 0; row < grid.rows; row += 1) {
      const y = row * cell + cell / 2; // centred in its cell, so nothing is cut in half at the screen edge
      const depth = Math.min(1, Math.max(0, y / Math.max(1, height)));
      ctx.fillStyle = `rgb(${mix(TOP_RGB[0], BOTTOM_RGB[0], depth)},${mix(TOP_RGB[1], BOTTOM_RGB[1], depth)},${mix(TOP_RGB[2], BOTTOM_RGB[2], depth)})`;
      for (let col = 0; col < grid.cols; col += 1) {
        const x = col * cell + cell / 2;
        const surface = grid.h[row * grid.cols + col];
        const ambient = swell(x, y, t);
        const level = Math.min(1, Math.max(0, 0.5 + 0.5 * (ambient * 0.85 + surface * 0.9)));
        ctx.globalAlpha = 0.06 + 0.3 * level ** 1.4;
        ctx.fillText(OCEAN_GLYPHS[glyphIndex(level)], x + ambient * 1.8, y + ambient * 3.2 + surface * 9);
      }
    }
    ctx.globalAlpha = 1;
  };

  const degradeIfSlow = (): void => {
    // If drawing alone eats a big slice of a 60fps frame, use fewer, larger characters (at most twice).
    if (costFrames < 90) return;
    const average = costSum / costFrames;
    costSum = 0;
    costFrames = 0;
    if (average > 9 && drops < 2) {
      drops += 1;
      targetCells *= 0.6;
      layout();
    }
  };

  const tick = (now: number): void => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    const active = now < quietUntil;
    if (!active && wasActive === false && now - lastDraw < IDLE_FRAME_MS) {
      return; // idle sea: skip every other frame
    }
    const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    lastDraw = now;
    const started = performance.now();

    if (active !== wasActive) {
      wasActive = active;
      canvas.dataset.oceanActive = active ? '1' : '0'; // lets tests (and curious devs) see when ripples are being simulated
    }
    if (active) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP_SECONDS && steps < 3) {
        stepWave(grid);
        accumulator -= STEP_SECONDS;
        steps += 1;
      }
      if (steps === 3) accumulator = 0;
    }
    draw(now / 1000);

    costSum += performance.now() - started;
    costFrames += 1;
    degradeIfSlow();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    const previous = lastPointer;
    lastPointer = { x: event.clientX, y: event.clientY };
    if (!previous) return;
    const speed = Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
    if (speed < 1) return;
    addImpulse(grid, event.clientX / cell - 0.5, event.clientY / cell - 0.5, 2.6, Math.min(1.1, 0.05 + speed * 0.012));
    quietUntil = performance.now() + QUIET_AFTER_MS;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    addImpulse(grid, event.clientX / cell - 0.5, event.clientY / cell - 0.5, 4, 3);
    quietUntil = performance.now() + QUIET_AFTER_MS;
  };

  const onResize = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      layout();
      if (!live) draw(1.3);
    }, 150);
  };

  layout();
  window.addEventListener('resize', onResize);

  if (live) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    raf = requestAnimationFrame(tick);
  } else {
    draw(1.3);
  }

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerDown);
    ctx.clearRect(0, 0, width, height);
  };
}
