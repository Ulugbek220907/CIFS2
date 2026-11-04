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

/** Glyphs from light to heavy, so crests read as denser ink than troughs. */
export const OCEAN_GLYPHS: readonly string[] = [
  '·', '˙', '-', '+', '=', '×', '÷', '≈', '±', '%', '√', 'π', '$', '∫', '∑',
];

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
