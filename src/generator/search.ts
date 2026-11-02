import {
  FULL_TURN_UNITS,
  PIECE_ORDER,
  PIECES,
  pieceLength,
  pieceTurn,
  type Inventory,
  type PieceId,
} from '../geometry/catalog';
import { footprint, footprintsOverlap, type Footprint } from '../geometry/collision';
import { ORIGIN, place, trackLength } from '../geometry/layout';
import { bestOrientation } from '../geometry/orientation';
import { distance, exitPose, POSITION_TOLERANCE, type Pose } from '../geometry/pose';
import { shapeKey } from './canonical';

export interface SearchOptions {
  inventory: Inventory;
  /** true: every piece of the inventory must be built in. */
  useAll: boolean;
  /** Minimum number of pieces when useAll is false. */
  minPieces: number;
  maxResults: number;
  timeLimitMs: number;
  seed: number;
  /** Optional floor area in mm. */
  room?: { width: number; height: number };
}

export interface GeneratedLayout {
  sequence: PieceId[];
  key: string;
  length: number;
  width: number;
  height: number;
  rotation: number;
}

export interface SearchResult {
  layouts: GeneratedLayout[];
  /** Total number of distinct shapes found (may exceed layouts.length). */
  distinctFound: number;
  /** true when the complete search space was explored. */
  exhaustive: boolean;
  nodes: number;
  duplicates: number;
  rejectedByRoom: number;
  elapsedMs: number;
  /** Set when the inventory can be ruled out before searching. */
  impossibleReason?: string;
}

/** Small deterministic PRNG (mulberry32) so results are reproducible per seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Checks that can rule out an inventory without searching. */
export function precheck(opts: SearchOptions): string | undefined {
  const inv = opts.inventory;
  if (inv.startFinish < 1) return 'Ohne Start-/Zielgerade ist keine HYBRID-Strecke möglich (die App braucht sie zur Positionsbestimmung).';
  let right = 0;
  let left = 0;
  for (const id of PIECE_ORDER) {
    const t = pieceTurn(id);
    if (t > 0) right += t * inv[id];
    if (t < 0) left += -t * inv[id];
  }
  if (opts.useAll) {
    const net = right - left;
    if (Math.abs(net) !== FULL_TURN_UNITS) {
      return `Alle Teile verbaut ergibt eine Gesamtdrehung von ${net * 30}°. Ein geschlossener Rundkurs ohne Kreuzung braucht genau ±360°. Mit diesem Bestand ist kein Rundkurs möglich, der alle Teile nutzt.`;
    }
  } else if (right < FULL_TURN_UNITS && left < FULL_TURN_UNITS) {
    return `Für einen Rundkurs werden Kurven mit zusammen 360° in eine Richtung benötigt. Vorhanden: ${right * 30}° rechts, ${left * 30}° links.`;
  }
  return undefined;
}

interface Collected {
  sequence: PieceId[];
  key: string;
}

/**
 * Depth-first search with backtracking. The start/finish straight is placed
 * first at the origin; every further piece is appended at the exit pose of
 * its predecessor (direction of travel). Branches are cut when
 *  1. the remaining inventory cannot turn the track back to ±360°,
 *  2. the remaining track length is shorter than the distance back to the
 *     start (a chord is never longer than the path),
 *  3. the new piece overlaps any earlier, non-adjacent piece,
 *  4. the partial track already exceeds the room diagonal.
 * A loop is accepted only if the last exit pose coincides with the start
 * pose in position (≤ 0.5 mm) and heading (exactly ±360°).
 */
export function search(opts: SearchOptions): SearchResult {
  const t0 = Date.now();
  const deadline = t0 + opts.timeLimitMs;
  const result: SearchResult = {
    layouts: [],
    distinctFound: 0,
    exhaustive: false,
    nodes: 0,
    duplicates: 0,
    rejectedByRoom: 0,
    elapsedMs: 0,
  };
  const reason = precheck(opts);
  if (reason) {
    result.exhaustive = true;
    result.impossibleReason = reason;
    result.elapsedMs = Date.now() - t0;
    return result;
  }

  const inv = { ...opts.inventory, startFinish: 1 };
  const types = PIECE_ORDER.filter((id) => id !== 'startFinish' && inv[id] > 0);
  const roomDiag = opts.room ? Math.hypot(opts.room.width, opts.room.height) : Infinity;
  const MAX_STORED = 3000;

  const found = new Map<string, Collected>();
  const roomRejected = new Set<string>();
  let timedOut = false;

  const runDfs = (rand: () => number, nodeLimit: number): boolean => {
    const remaining = { ...inv };
    remaining.startFinish = 0;
    let remRight = 0;
    let remLeft = 0;
    let remLength = 0;
    let remCount = 0;
    for (const id of types) {
      const t = pieceTurn(id);
      if (t > 0) remRight += t * remaining[id];
      if (t < 0) remLeft += -t * remaining[id];
      remLength += pieceLength(id) * remaining[id];
      remCount += remaining[id];
    }
    const seq: PieceId[] = ['startFinish'];
    const fps: Footprint[] = [footprint('startFinish', ORIGIN)];
    let bMinX = fps[0].minX;
    let bMaxX = fps[0].maxX;
    let bMinY = fps[0].minY;
    let bMaxY = fps[0].maxY;
    let nodes = 0;

    const dfs = (pose: Pose): boolean => {
      if (++nodes > nodeLimit) return false;
      result.nodes++;
      if ((result.nodes & 1023) === 0 && Date.now() > deadline) {
        timedOut = true;
        return false;
      }
      const order = shuffle([...types], rand);
      for (const id of order) {
        if (remaining[id] === 0) continue;
        const turn = pieceTurn(id);
        const end = exitPose(id, pose);
        const nRight = remRight - Math.max(turn, 0);
        const nLeft = remLeft - Math.max(-turn, 0);
        const len = pieceLength(id);
        const nLength = remLength - len;
        const nCount = remCount - 1;
        // 1. heading reachability
        const canCw = end.h - nLeft <= FULL_TURN_UNITS && FULL_TURN_UNITS <= end.h + nRight;
        const canCcw = end.h - nLeft <= -FULL_TURN_UNITS && -FULL_TURN_UNITS <= end.h + nRight;
        if (!canCw && !canCcw) continue;
        // 2. distance back to start
        const dist = distance(end, ORIGIN);
        if (dist > nLength + POSITION_TOLERANCE) continue;
        const closes = dist <= POSITION_TOLERANCE && Math.abs(end.h) === FULL_TURN_UNITS;
        if (closes && opts.useAll && nCount > 0) continue;
        // 3. overlaps
        const fp = footprint(id, pose);
        let hit = false;
        for (let k = closes ? 1 : 0; k < fps.length - 1; k++) {
          if (footprintsOverlap(fp, fps[k])) {
            hit = true;
            break;
          }
        }
        if (hit) continue;
        // 4. room diagonal
        const nMinX = Math.min(bMinX, fp.minX);
        const nMaxX = Math.max(bMaxX, fp.maxX);
        const nMinY = Math.min(bMinY, fp.minY);
        const nMaxY = Math.max(bMaxY, fp.maxY);
        if (Math.max(nMaxX - nMinX, nMaxY - nMinY) > roomDiag) continue;

        seq.push(id);
        if (closes) {
          if (seq.length >= Math.max(opts.minPieces, 3)) {
            const key = shapeKey(seq);
            if (found.has(key) || roomRejected.has(key)) result.duplicates++;
            else if (opts.room && !bestOrientation(place(seq), opts.room)) {
              roomRejected.add(key);
              result.rejectedByRoom++;
            } else if (found.size < MAX_STORED) found.set(key, { sequence: [...seq], key });
          }
          seq.pop();
          continue;
        }
        remaining[id]--;
        const saved = [bMinX, bMaxX, bMinY, bMaxY, remRight, remLeft, remLength, remCount];
        remRight = nRight;
        remLeft = nLeft;
        remLength = nLength;
        remCount = nCount;
        bMinX = nMinX;
        bMaxX = nMaxX;
        bMinY = nMinY;
        bMaxY = nMaxY;
        fps.push(fp);
        const complete = dfs(end);
        fps.pop();
        [bMinX, bMaxX, bMinY, bMaxY, remRight, remLeft, remLength, remCount] = saved;
        remaining[id]++;
        seq.pop();
        if (!complete) return false;
      }
      return true;
    };
    return dfs(exitPose('startFinish', ORIGIN));
  };

  // Phase 1: randomized restarts with a node budget spread the results over
  // different regions of the search space (variety for large inventories).
  const restarts = 24;
  for (let r = 0; r < restarts && !timedOut && Date.now() < deadline; r++) {
    runDfs(rng(opts.seed * 7919 + r), 4000);
  }
  // Phase 2: complete search until finished or out of time. Only a finished
  // phase 2 allows the statement "no valid loop exists".
  if (!timedOut && Date.now() < deadline) {
    result.exhaustive = runDfs(rng(opts.seed), Infinity) && !timedOut && found.size < MAX_STORED;
  }

  result.distinctFound = found.size;
  const picked = shuffle([...found.values()], rng(opts.seed ^ 0x9e3779b9)).slice(0, opts.maxResults);
  result.layouts = picked.map(({ sequence, key }) => {
    const placements = place(sequence);
    const o = bestOrientation(placements, opts.room) ?? { rotation: 0, width: 0, height: 0 };
    return { sequence, key, length: trackLength(sequence), width: o.width, height: o.height, rotation: o.rotation };
  });
  result.layouts.sort((a, b) => b.sequence.length - a.sequence.length || a.width * a.height - b.width * b.height);
  result.elapsedMs = Date.now() - t0;
  return result;
}

export function describeSequence(sequence: PieceId[]): string {
  return sequence.map((id) => PIECES[id].short).join(' → ');
}
