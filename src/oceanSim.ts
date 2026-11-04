// Pure maths for the home-page "ocean of characters" background. No DOM and no runtime imports, so Node can test it.
//
// Two layers are added together for every cell:
//  1. an ambient swell: a few travelling sine waves, so the sea always rolls gently;
//  2. a real water-wave simulation (damped 2D wave equation) that the mouse pushes ripples into.

export interface OceanGrid {
  cols: number;
  rows: number;
  /** Surface height per cell. */
  h: Float32Array;
  /** Vertical velocity per cell. */
  v: Float32Array;
}

/**
 * Every printable ASCII character (0-9, a-z, A-Z and all punctuation such as !@#$%^&*()_+), ordered from the
 * least to the most ink it puts down in the site font (Plus Jakarta Sans 600), measured by rendering each one.
 * Crests of a wave therefore read as dark characters (@ W M Q) and troughs as faint ones (. ` ' ,).
 */
export const OCEAN_RAMP = ".`',:;-\"_~^!*irlI=+><J()1\\/tj?fv|}{LTs][x7czYunyoFaekh23V4965ZXCPSUpqEbdA0KwH8mRDGgO&$NB#%QMW@";

export const OCEAN_GLYPHS: readonly string[] = Array.from(OCEAN_RAMP);

const MAX_HEIGHT = 3;

export function createGrid(cols: number, rows: number): OceanGrid {
  const size = Math.max(1, Math.floor(cols)) * Math.max(1, Math.floor(rows));
  return { cols: Math.max(1, Math.floor(cols)), rows: Math.max(1, Math.floor(rows)), h: new Float32Array(size), v: new Float32Array(size) };
}

/**
 * Pushes the surface at (cx, cy), in cell units, with a smooth falloff over `radius` cells.
 * Positive strength raises a crest; the wave equation then sends rings outwards on its own.
 */
export function addImpulse(grid: OceanGrid, cx: number, cy: number, radius: number, strength: number): void {
  const r = Math.max(0.5, radius);
  const x0 = Math.max(1, Math.floor(cx - r));
  const x1 = Math.min(grid.cols - 2, Math.ceil(cx + r));
  const y0 = Math.max(1, Math.floor(cy - r));
  const y1 = Math.min(grid.rows - 2, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const falloff = (1 - d) * (1 - d);
      grid.v[y * grid.cols + x] += strength * falloff;
    }
  }
}

/**
 * One step of the damped 2D wave equation. `speed` must stay at or below 0.5 for the explicit scheme to
 * be stable; `damping` below 1 makes ripples fade out. The outer ring of cells stays flat.
 */
export function stepWave(grid: OceanGrid, speed = 0.2, damping = 0.985): void {
  const { cols, rows, h, v } = grid;
  const c = Math.min(0.45, Math.max(0, speed));
  for (let y = 1; y < rows - 1; y += 1) {
    const row = y * cols;
    for (let x = 1; x < cols - 1; x += 1) {
      const i = row + x;
      const laplacian = h[i - 1] + h[i + 1] + h[i - cols] + h[i + cols] - 4 * h[i];
      v[i] = (v[i] + c * laplacian) * damping;
    }
  }
  for (let y = 1; y < rows - 1; y += 1) {
    const row = y * cols;
    for (let x = 1; x < cols - 1; x += 1) {
      const i = row + x;
      const next = h[i] + v[i];
      h[i] = next > MAX_HEIGHT ? MAX_HEIGHT : next < -MAX_HEIGHT ? -MAX_HEIGHT : next;
    }
  }
}

/** Ambient ocean height at a pixel position and time (seconds), always within -1..1. */
export function swell(x: number, y: number, t: number): number {
  return (
    0.55 * Math.sin(x * 0.018 + y * 0.007 - t * 0.9) +
    0.3 * Math.sin(x * 0.011 - y * 0.013 - t * 0.6 + 1.7) +
    0.15 * Math.sin(y * 0.03 + t * 1.3)
  );
}

/**
 * The same ambient swell as swell(), split so no trigonometry runs per cell per frame: the position-dependent
 * sines/cosines are computed once for the whole grid, and each frame only needs a handful of time-dependent ones
 * (sin(A - wt) = sinA*cos(wt) - cosA*sin(wt)). Cells are centred at (col*cell + cell/2, row*cell + cell/2).
 */
export interface SwellField {
  s1: Float32Array;
  c1: Float32Array;
  s2: Float32Array;
  c2: Float32Array;
  /** Third wave only depends on the row. */
  s3: Float32Array;
  c3: Float32Array;
}

export function createSwellField(cols: number, rows: number, cell: number): SwellField {
  const size = cols * rows;
  const field: SwellField = {
    s1: new Float32Array(size), c1: new Float32Array(size), s2: new Float32Array(size), c2: new Float32Array(size),
    s3: new Float32Array(rows), c3: new Float32Array(rows),
  };
  for (let row = 0; row < rows; row += 1) {
    const y = row * cell + cell / 2;
    field.s3[row] = Math.sin(y * 0.03);
    field.c3[row] = Math.cos(y * 0.03);
    for (let col = 0; col < cols; col += 1) {
      const x = col * cell + cell / 2;
      const i = row * cols + col;
      const a1 = x * 0.018 + y * 0.007;
      const a2 = x * 0.011 - y * 0.013 + 1.7;
      field.s1[i] = Math.sin(a1);
      field.c1[i] = Math.cos(a1);
      field.s2[i] = Math.sin(a2);
      field.c2[i] = Math.cos(a2);
    }
  }
  return field;
}

export interface SwellClock {
  cos1: number; sin1: number; cos2: number; sin2: number; cos3: number; sin3: number;
}

/** The few time-dependent sines and cosines for one frame (seconds). */
export function swellClock(t: number): SwellClock {
  return {
    cos1: Math.cos(t * 0.9), sin1: Math.sin(t * 0.9),
    cos2: Math.cos(t * 0.6), sin2: Math.sin(t * 0.6),
    cos3: Math.cos(t * 1.3), sin3: Math.sin(t * 1.3),
  };
}

/** Ambient swell at a cell: equals swell(x, y, t) for that cell's centre. */
export function swellAtCell(field: SwellField, clock: SwellClock, row: number, index: number): number {
  return (
    0.55 * (field.s1[index] * clock.cos1 - field.c1[index] * clock.sin1) +
    0.3 * (field.s2[index] * clock.cos2 - field.c2[index] * clock.sin2) +
    0.15 * (field.s3[row] * clock.cos3 + field.c3[row] * clock.sin3)
  );
}

/** Maps a 0..1 level to an index into OCEAN_GLYPHS. */
export function glyphIndex(level: number, count = OCEAN_GLYPHS.length): number {
  const clamped = level < 0 ? 0 : level > 1 ? 1 : Number.isFinite(level) ? level : 0;
  return Math.min(count - 1, Math.floor(clamped * count));
}

/** Total energy in the grid, used by tests and to decide when ripples have settled. */
export function gridEnergy(grid: OceanGrid): number {
  let sum = 0;
  for (let i = 0; i < grid.h.length; i += 1) {
    sum += grid.h[i] * grid.h[i] + grid.v[i] * grid.v[i];
  }
  return sum;
}
