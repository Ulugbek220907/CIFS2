import {
  OCEAN_GLYPHS,
  addImpulse,
  createGrid,
  createSwellField,
  glyphIndex,
  stepWave,
  swellAtCell,
  swellClock,
  type OceanGrid,
  type SwellField,
} from './oceanSim';

// Home-page background: a sea of small characters that rolls gently and ripples away from the mouse.
// Touch screens and "reduce motion" visitors get one still frame and no animation loop at all.

const TOP_RGB: readonly [number, number, number] = [99, 102, 241]; // indigo
const BOTTOM_RGB: readonly [number, number, number] = [56, 189, 248]; // sky blue
const QUIET_AFTER_MS = 4500;
/** The slow ambient swell is drawn at ~15fps; full speed is only needed while the mouse makes ripples. */
const IDLE_FRAME_MS = 62;
/** Small characters, set close together. Cell size is the spacing; the glyph itself is a bit smaller. */
const MIN_CELL = 14;
/** Hard ceiling on spacing, only reached after the speed governor has stepped down several times. */
const MAX_CELL = 44;
/** Kept under ~3,700 drawn characters including the edge margin: past ~4,096 sprites per frame the browser's 2D engine gets about 3x slower. */
const TARGET_CELLS = 3400;
const FONT_RATIO = 0.74;
/** The cell size ripples were tuned at; smaller cells run more simulation steps so ripples keep their speed. */
const REFERENCE_CELL = 36;
/** Colour bands from top to bottom of the screen; each gets its own pre-rendered row of glyphs. */
const DEPTH_BANDS = 8;
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

  let cell = 16;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let grid: OceanGrid = createGrid(2, 2);
  /** A fixed tiny offset per cell, so neighbouring cells at the same height don't all show the identical character. */
  let jitter = new Float32Array(4);
  let swellField: SwellField = createSwellField(1, 1, 16);
  let targetCells = TARGET_CELLS;
  let stepSeconds = 1 / 60;
  /** Pre-rendered glyphs: one column per character, one row per colour band. Copying a sprite is far cheaper than drawing text. */
  let atlas: HTMLCanvasElement | null = null;
  let sprite = 12; // sprite size in CSS px
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
  let slowWindows = 0;
  let warmupFrames = 0;
  let stopped = false;
  let wasActive = false;

  const buildAtlas = (): void => {
    const fontPx = Math.max(7, Math.round(cell * FONT_RATIO));
    sprite = Math.ceil(fontPx * 1.3);
    const px = Math.ceil(sprite * dpr);
    const sheet = atlas ?? document.createElement('canvas');
    sheet.width = px * OCEAN_GLYPHS.length;
    sheet.height = px * DEPTH_BANDS;
    const sctx = sheet.getContext('2d');
    if (!sctx) return;
    sctx.clearRect(0, 0, sheet.width, sheet.height);
    sctx.font = `600 ${fontPx * dpr}px ${FONT_FAMILY}`;
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    for (let band = 0; band < DEPTH_BANDS; band += 1) {
      const depth = band / (DEPTH_BANDS - 1);
      sctx.fillStyle = `rgb(${mix(TOP_RGB[0], BOTTOM_RGB[0], depth)},${mix(TOP_RGB[1], BOTTOM_RGB[1], depth)},${mix(TOP_RGB[2], BOTTOM_RGB[2], depth)})`;
      for (let g = 0; g < OCEAN_GLYPHS.length; g += 1) {
        // Transparency is a function of the glyph's level, so it is baked in: no per-character state change at draw time.
        const level = (g + 0.5) / OCEAN_GLYPHS.length;
        sctx.globalAlpha = 0.06 + 0.3 * level ** 1.4;
        sctx.fillText(OCEAN_GLYPHS[g], g * px + px / 2, band * px + px / 2);
      }
    }
    atlas = sheet;
  };

  const layout = (): void => {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = Math.min(MAX_CELL, Math.max(MIN_CELL, Math.sqrt((width * height) / targetCells)));
    grid = createGrid(Math.ceil(width / cell) + 2, Math.ceil(height / cell) + 2);
    stepSeconds = 1 / (60 * Math.min(2.5, REFERENCE_CELL / cell));
    swellField = createSwellField(grid.cols, grid.rows, cell);
    jitter = new Float32Array(grid.cols * grid.rows);
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) {
        const hash = (Math.imul(col + 1, 73856093) ^ Math.imul(row + 1, 19349663)) >>> 0;
        jitter[row * grid.cols + col] = ((hash % 1000) / 1000 - 0.5) * 0.1;
      }
    }
    buildAtlas();
    canvas.dataset.oceanCell = cell.toFixed(1);
  };

  const draw = (t: number): void => {
    ctx.clearRect(0, 0, width, height);
    if (!atlas) return;
    const px = Math.ceil(sprite * dpr);
    const move = cell / REFERENCE_CELL; // keep the swaying proportional to the (smaller) spacing
    const half = sprite / 2;
    const clock = swellClock(t);

    for (let row = 0; row < grid.rows; row += 1) {
      const y = row * cell + cell / 2; // centred in its cell, so nothing is cut in half at the screen edge
      const depth = Math.min(1, Math.max(0, y / Math.max(1, height)));
      const sy = Math.round(depth * (DEPTH_BANDS - 1)) * px;
      for (let col = 0; col < grid.cols; col += 1) {
        const x = col * cell + cell / 2;
        const index = row * grid.cols + col;
        const surface = grid.h[index];
        const ambient = swellAtCell(swellField, clock, row, index);
        // The calm swell stays in the middle of the character range; ripples from the mouse reach the extremes.
        const level = Math.min(1, Math.max(0, 0.5 + 0.42 * (ambient * 0.85 + surface * 0.9) + jitter[index]));
        ctx.drawImage(
          atlas,
          glyphIndex(level) * px,
          sy,
          px,
          px,
          Math.round(x + ambient * 1.8 * move - half), // whole pixels: avoids the slower sub-pixel blending path
          Math.round(y + (ambient * 3.2 + surface * 9) * move - half),
          sprite,
          sprite,
        );
      }
    }
  };

  const degradeIfSlow = (): void => {
    // Skip warm-up (JIT, first layout), then judge in windows of 40 drawn frames. Two slow windows in a row mean the
    // device really struggles, so use fewer, larger characters (at most three times).
    if (warmupFrames < 20) {
      warmupFrames += 1;
      costSum = 0;
      costFrames = 0;
      return;
    }
    if (costFrames < 40) return;
    const average = costSum / costFrames;
    canvas.dataset.oceanCostMs = average.toFixed(2); // average work per drawn frame, for tests and tuning
    costSum = 0;
    costFrames = 0;
    slowWindows = average > 9 ? slowWindows + 1 : 0;
    if (slowWindows >= 2 && drops < 3) {
      drops += 1;
      slowWindows = 0;
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
      while (accumulator >= stepSeconds && steps < 5) {
        stepWave(grid);
        accumulator -= stepSeconds;
        steps += 1;
      }
      if (steps === 5) accumulator = 0;
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
    // Sizes are in pixels, converted to cells, so ripples look the same however fine the grid is.
    addImpulse(grid, event.clientX / cell - 0.5, event.clientY / cell - 0.5, Math.max(2, 85 / cell), Math.min(0.55, 0.03 + speed * 0.006));
    quietUntil = performance.now() + QUIET_AFTER_MS;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    addImpulse(grid, event.clientX / cell - 0.5, event.clientY / cell - 0.5, Math.max(3, 150 / cell), 2);
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

  // The site font may still be downloading: the sprites were drawn with a fallback font, so redraw them once it is ready.
  if (typeof document.fonts?.load === 'function') {
    void document.fonts
      .load('600 16px "Plus Jakarta Sans Variable"')
      .then(() => {
        if (stopped) return;
        buildAtlas();
        if (!live) draw(1.3);
      })
      .catch(() => undefined);
  }

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
    atlas = null;
  };
}
