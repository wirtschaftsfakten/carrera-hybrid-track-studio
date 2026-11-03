import {
  canConnect,
  FULL_TURN_UNITS,
  PIECE_ORDER,
  PIECES,
  pieceLength,
  type Inventory,
  type PieceId,
} from './catalog';
import { footprint, footprintsOverlap, type Footprint } from './collision';
import { distance, exitPose, mod, pieceOutline, POSITION_TOLERANCE, type Pose, type Vec } from './pose';

export const ORIGIN: Pose = { x: 0, y: 0, h: 0 };

export interface Placement {
  index: number;
  id: PieceId;
  start: Pose;
  end: Pose;
  footprint: Footprint;
}

export function place(sequence: PieceId[], origin: Pose = ORIGIN): Placement[] {
  const out: Placement[] = [];
  let pose = origin;
  sequence.forEach((id, index) => {
    const end = exitPose(id, pose);
    out.push({ index, id, start: pose, end, footprint: footprint(id, pose) });
    pose = end;
  });
  return out;
}

export function countPieces(sequence: PieceId[]): Inventory {
  const c = Object.fromEntries(PIECE_ORDER.map((id) => [id, 0])) as Inventory;
  for (const id of sequence) c[id]++;
  return c;
}

export function trackLength(sequence: PieceId[]): number {
  return sequence.reduce((s, id) => s + pieceLength(id), 0);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/** Bounding box of the real track outline (full track width). */
export function bounds(placements: Placement[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placements) {
    for (const v of pieceOutline(p.id, p.start, 24)) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }
  }
  if (!placements.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export type IssueCode =
  | 'empty'
  | 'notClosed'
  | 'headingMismatch'
  | 'overlap'
  | 'startFinishMissing'
  | 'startFinishMultiple'
  | 'inventoryExceeded'
  | 'badConnection'
  | 'unverifiedPiece';

export interface Issue {
  code: IssueCode;
  message: string;
  pieces?: number[];
}

export interface Validation {
  valid: boolean;
  closed: boolean;
  /** Gap between last exit and first entry in mm. */
  gap: number;
  /** Total turn in degrees (±360 for a closed loop). */
  totalTurnDeg: number;
  overlaps: [number, number][];
  issues: Issue[];
  placements: Placement[];
  length: number;
  bounds: Bounds;
}

/** All pairs of non-adjacent pieces that physically overlap. */
export function findOverlaps(placements: Placement[], closed: boolean): [number, number][] {
  const n = placements.length;
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (closed && i === 0 && j === n - 1) continue; // joined by the loop closure
      if (footprintsOverlap(placements[i].footprint, placements[j].footprint)) pairs.push([i, j]);
    }
  }
  return pairs;
}

export function isClosed(placements: Placement[], origin: Pose = ORIGIN): { closed: boolean; gap: number; turn: number } {
  if (!placements.length) return { closed: false, gap: 0, turn: 0 };
  const end = placements[placements.length - 1].end;
  const gap = distance(end, origin);
  const turn = end.h - origin.h;
  const closed = gap <= POSITION_TOLERANCE && mod(turn, FULL_TURN_UNITS) === 0 && Math.abs(turn) === FULL_TURN_UNITS;
  return { closed, gap, turn };
}

/**
 * Full validation of a track: connection chain, loop closure (position AND
 * heading), overlaps, start/finish rule and the available inventory.
 * Pieces are always chained exit → entry, so every piece is used in its
 * prescribed direction of travel; a right curve is never used as left curve.
 */
export function validate(sequence: PieceId[], inventory?: Inventory): Validation {
  const placements = place(sequence);
  const issues: Issue[] = [];
  const { closed, gap, turn } = isClosed(placements);
  if (!sequence.length) issues.push({ code: 'empty', message: 'Die Strecke enthält keine Teile.' });
  else if (!closed) {
    if (gap > POSITION_TOLERANCE) {
      issues.push({
        code: 'notClosed',
        message: `Rundkurs nicht geschlossen: Ende liegt ${(gap / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 })} cm vom Start entfernt.`,
      });
    }
    if (Math.abs(turn) !== FULL_TURN_UNITS) {
      issues.push({
        code: 'headingMismatch',
        message: `Gesamtdrehung ${turn * 30}° statt ±360° – die Anschlussrichtung am Start passt nicht.`,
      });
    }
  }
  const overlaps = findOverlaps(placements, closed);
  for (const [a, b] of overlaps) {
    issues.push({ code: 'overlap', message: `Teil ${a + 1} überschneidet Teil ${b + 1}.`, pieces: [a, b] });
  }
  const counts = countPieces(sequence);
  if (sequence.length && counts.startFinish === 0) {
    issues.push({ code: 'startFinishMissing', message: 'Es fehlt die Start-/Zielgerade.' });
  }
  if (counts.startFinish > 1) {
    issues.push({ code: 'startFinishMultiple', message: 'Nur eine Start-/Zielgerade pro Strecke möglich.' });
  }
  for (const id of PIECE_ORDER) {
    if (counts[id] && !PIECES[id].verified) {
      issues.push({ code: 'unverifiedPiece', message: `${PIECES[id].name}: Geometrie nicht verifiziert.` });
    }
  }
  sequence.forEach((id, i) => {
    const next = i + 1 < sequence.length ? sequence[i + 1] : closed ? sequence[0] : null;
    if (next && !canConnect(id, next)) {
      issues.push({ code: 'badConnection', message: `Teil ${i + 1} passt nicht an das folgende Teil.`, pieces: [i] });
    }
  });
  if (inventory) {
    for (const id of PIECE_ORDER) {
      if (counts[id] > inventory[id]) {
        issues.push({
          code: 'inventoryExceeded',
          message: `${PIECES[id].name}: ${counts[id]} verbaut, aber nur ${inventory[id]} vorhanden.`,
        });
      }
    }
  }
  return {
    valid: issues.length === 0,
    closed,
    gap,
    totalTurnDeg: turn * 30,
    overlaps,
    issues,
    placements,
    length: trackLength(sequence),
    bounds: bounds(placements),
  };
}

export type { Vec };
