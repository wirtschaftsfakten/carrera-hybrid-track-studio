import { HEADING_UNIT_DEG } from './catalog';
import type { Placement } from './layout';
import { pieceOutline, type Vec } from './pose';

function outlinePoints(placements: Placement[]): Vec[] {
  return placements.flatMap((p) => pieceOutline(p.id, p.start, 24));
}

export function rotatedSize(points: Vec[], units: number): { width: number; height: number } {
  const a = (units * HEADING_UNIT_DEG * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const x = p.x * c - p.y * s;
    const y = p.x * s + p.y * c;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { width: maxX - minX, height: maxY - minY };
}

export interface Orientation {
  /** View rotation in 30° units. */
  rotation: number;
  width: number;
  height: number;
}

/**
 * Best orientation for laying the track out on the floor: the 30° rotation
 * with the smallest rectangular footprint, presented in landscape. If a room
 * size is given, only orientations that fit are accepted (null = none fits).
 */
export function bestOrientation(placements: Placement[], room?: { width: number; height: number }): Orientation | null {
  const pts = outlinePoints(placements);
  let best: Orientation | null = null;
  for (let r = 0; r < 12; r++) {
    const { width, height } = rotatedSize(pts, r);
    if (room && !(width <= room.width + 1 && height <= room.height + 1)) continue;
    if (!room && height > width + 1) continue; // prefer landscape
    if (!best || width * height < best.width * best.height - 1) best = { rotation: r, width, height };
  }
  return best;
}
