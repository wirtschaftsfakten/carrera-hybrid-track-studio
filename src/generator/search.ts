import {
  FULL_TURN_UNITS,
  GENERATOR_PIECES,
  PIECES,
  pieceChord,
  pieceLength,
  pieceTurn,
  TRACK_WIDTH,
  type Inventory,
  type PieceId,
} from '../geometry/catalog';
import { footprint, footprintsOverlap, type Footprint } from '../geometry/collision';
import { ORIGIN, place, trackLength } from '../geometry/layout';
import { bestOrientation } from '../geometry/orientation';
import { distance, exitPose, POSITION_TOLERANCE, type Pose } from '../geometry/pose';
import { shapeKey } from './canonical';

/**
 * auto:   the generator picks the track size itself (inventory is only the
 *         upper limit, unused pieces stay in the box),
 * custom: the user sets a minimum and maximum number of pieces,
 * max:    use as many pieces as possible without forcing invalid tracks.
 */
export type GeneratorMode = 'auto' | 'custom' | 'max';
export type TrackStyle = 'varied' | 'fast' | 'twisty' | 'compact';

export interface SearchOptions {
  inventory: Inventory;
  mode: GeneratorMode;
  /** Piece range for mode "custom" (ignored otherwise). */
  minPieces: number;
  maxPieces: number;
  /** Optional track length limits in mm. */
  minLength?: number;
  maxLength?: number;
  style: TrackStyle;
  maxResults: number;
  timeLimitMs: number;
  seed: number;
  /** Optional floor area in mm. */
  room?: { width: number; height: number };
}

export interface LayoutMetrics {
  pieces: number;
  straights: number;
  curves: number;
  /** Changes between left and right turns along the loop. */
  directionChanges: number;
  /** Longest run of consecutive straights. */
  longestStraight: number;
  distinctTypes: number;
  /** Share of the bounding rectangle covered by track (0..1). */
  density: number;
}

export interface GeneratedLayout {
  sequence: PieceId[];
  key: string;
  length: number;
  width: number;
  height: number;
  rotation: number;
  metrics: LayoutMetrics;
  /** Style score 0..1 for the requested style. */
  score: number;
}

export interface SearchResult {
  layouts: GeneratedLayout[];
  /** Total number of distinct shapes found (may exceed layouts.length). */
  distinctFound: number;
  /** true when the complete search space (within the limits) was explored. */
  exhaustive: boolean;
  nodes: number;
  duplicates: number;
  rejectedByRoom: number;
  rejectedByLength: number;
  elapsedMs: number;
  /** Piece range actually searched. */
  range: { min: number; max: number };
  /** Set when the inventory can be ruled out before searching. */
  impossibleReason?: string;
}

export const AUTO_MIN_PIECES = 8;
export const AUTO_MAX_PIECES = 32;
const NODES_PER_RESTART = 5000;
const MIN_RESTARTS = 24;
const MAX_STORED = 3000;

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

/** Usable pieces: verified types only, start/finish capped at one. */
export function usableCount(inv: Inventory): number {
  return GENERATOR_PIECES.reduce((s, id) => s + Math.min(inv[id], PIECES[id].maxPerTrack ?? Infinity), 0);
}

/** Piece range the search runs with. The inventory is never a target, only a limit. */
export function resolveRange(opts: Pick<SearchOptions, 'inventory' | 'mode' | 'minPieces' | 'maxPieces'>): { min: number; max: number } {
  const total = usableCount(opts.inventory);
  if (opts.mode === 'max') return { min: Math.min(3, total), max: total };
  if (opts.mode === 'auto') {
    const max = Math.min(total, AUTO_MAX_PIECES);
    return { min: Math.min(AUTO_MIN_PIECES, max), max };
  }
  const max = Math.max(1, Math.min(total, Math.round(opts.maxPieces)));
  const min = Math.max(3, Math.min(max, Math.round(opts.minPieces)));
  return { min, max };
}

function turnTotals(inv: Inventory): { right: number; left: number } {
  let right = 0;
  let left = 0;
  for (const id of GENERATOR_PIECES) {
    const t = pieceTurn(id);
    if (t > 0) right += t * inv[id];
    if (t < 0) left += -t * inv[id];
  }
  return { right, left };
}

/** Checks that can rule out an inventory without searching. */
export function precheck(opts: SearchOptions): string | undefined {
  const inv = opts.inventory;
  if (inv.startFinish < 1) return 'Ohne Start-/Zielgerade ist keine HYBRID-Strecke möglich (die App braucht sie zur Positionsbestimmung).';
  const { right, left } = turnTotals(inv);
  if (right < FULL_TURN_UNITS && left < FULL_TURN_UNITS) {
    return `Für einen Rundkurs werden Kurven mit zusammen 360° in eine Richtung benötigt. Vorhanden: ${right * 30}° rechts, ${left * 30}° links.`;
  }
  const { max } = resolveRange(opts);
  // fewest pieces that can turn 360°: the sharpest curves, plus start/finish
  const sharpest = Math.max(...GENERATOR_PIECES.filter((id) => inv[id] > 0).map((id) => Math.abs(pieceTurn(id))));
  const minNeeded = Math.ceil(FULL_TURN_UNITS / sharpest) + 1;
  if (max < minNeeded) {
    return `Mit höchstens ${max} Teilen ist kein Rundkurs möglich: Allein für 360° Drehung braucht es mindestens ${minNeeded - 1} Kurven plus Start/Ziel.`;
  }
  if (opts.maxLength !== undefined && opts.minLength !== undefined && opts.minLength > opts.maxLength) {
    return 'Die Mindestlänge ist größer als die Maximallänge.';
  }
  return undefined;
}

export function layoutMetrics(sequence: PieceId[], width: number, height: number): LayoutMetrics {
  const n = sequence.length;
  let straights = 0;
  let longest = 0;
  const turns: number[] = [];
  for (const id of sequence) {
    const t = pieceTurn(id);
    if (t === 0) straights++;
    else turns.push(Math.sign(t));
  }
  // cyclic runs of straights
  let run = 0;
  for (let i = 0; i < 2 * n; i++) {
    if (pieceTurn(sequence[i % n]) === 0) {
      run++;
      longest = Math.max(longest, Math.min(run, straights));
    } else run = 0;
  }
  let changes = 0;
  for (let i = 0; i < turns.length; i++) if (turns[i] !== turns[(i + 1) % turns.length]) changes++;
  const area = Math.max(1, width * height);
  return {
    pieces: n,
    straights,
    curves: n - straights,
    directionChanges: changes,
    longestStraight: longest,
    distinctTypes: new Set(sequence).size,
    density: Math.min(1, (trackLength(sequence) * TRACK_WIDTH) / area),
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Style score 0..1. Higher = fits the requested style better. */
export function styleScore(style: TrackStyle, m: LayoutMetrics, length: number, availableTypes: number): number {
  const straightRatio = m.straights / Math.max(1, m.pieces);
  const curveRatio = 1 - straightRatio;
  switch (style) {
    case 'fast':
      return 0.55 * straightRatio + 0.3 * clamp01(m.longestStraight / 6) + 0.15 * clamp01(length / 12000);
    case 'twisty':
      return 0.5 * curveRatio + 0.5 * clamp01((m.directionChanges / Math.max(1, m.curves)) * 2);
    case 'compact':
      return m.density;
    case 'varied':
    default:
      return (
        0.35 * clamp01(m.distinctTypes / Math.max(1, availableTypes)) +
        0.35 * clamp01(m.directionChanges / 4) +
        0.3 * clamp01(1 - Math.abs(straightRatio - 0.4) / 0.6)
      );
  }
}

interface Collected {
  sequence: PieceId[];
  key: string;
  length: number;
  width: number;
  height: number;
}

/**
 * Depth-first search with backtracking. The start/finish straight is placed
 * first at the origin; every further piece is appended at the exit pose of
 * its predecessor (direction of travel). Branches are cut when
 *  1. the remaining pieces (inventory AND free slots up to the piece limit)
 *     cannot turn the track back to ±360°,
 *  2. the remaining pieces cannot reach the start again (each piece moves
 *     the end by at most its chord),
 *  3. the new piece overlaps any earlier, non-adjacent piece,
 *  4. the partial track already exceeds the room diagonal or the maximum
 *     length.
 * A loop is accepted only if the last exit pose coincides with the start
 * pose in position (≤ 0.5 mm) and heading (exactly ±360°).
 *
 * The search runs in two phases: randomized restarts with a node budget and
 * a random piece limit inside the requested range (variety, also for 60–100+
 * pieces), then a complete search until finished or out of time. Only a
 * finished complete search allows the statement "no valid loop exists".
 */
export function search(opts: SearchOptions): SearchResult {
  const t0 = Date.now();
  const deadline = t0 + opts.timeLimitMs;
  const range = resolveRange(opts);
  const result: SearchResult = {
    layouts: [],
    distinctFound: 0,
    exhaustive: false,
    nodes: 0,
    duplicates: 0,
    rejectedByRoom: 0,
    rejectedByLength: 0,
    elapsedMs: 0,
    range,
  };
  const reason = precheck(opts);
  if (reason) {
    result.exhaustive = true;
    result.impossibleReason = reason;
    result.elapsedMs = Date.now() - t0;
    return result;
  }

  const inv = { ...opts.inventory, startFinish: 1 };
  const types = GENERATOR_PIECES.filter((id) => id !== 'startFinish' && inv[id] > 0);
  const roomDiag = opts.room ? Math.hypot(opts.room.width, opts.room.height) : Infinity;
  const maxLength = opts.maxLength ?? Infinity;
  const minLength = opts.minLength ?? 0;
  const maxRightStep = Math.max(0, ...types.map((id) => pieceTurn(id)));
  const maxLeftStep = Math.max(0, ...types.map((id) => -pieceTurn(id)));
  const maxChord = Math.max(...types.map(pieceChord));
  const target = Math.max(opts.maxResults * 4, 12);

  const found = new Map<string, Collected>();
  const rejected = new Set<string>();
  let best = 0; // most pieces in a found loop (mode "max")
  let timedOut = false;
  let stopAt = deadline;

  const runDfs = (rand: () => number, nodeLimit: number, cap: number): boolean => {
    const remaining = { ...inv };
    remaining.startFinish = 0;
    let remRight = 0;
    let remLeft = 0;
    let remLength = 0;
    for (const id of types) {
      const t = pieceTurn(id);
      if (t > 0) remRight += t * remaining[id];
      if (t < 0) remLeft += -t * remaining[id];
      remLength += pieceLength(id) * remaining[id];
    }
    const seq: PieceId[] = ['startFinish'];
    const fps: Footprint[] = [footprint('startFinish', ORIGIN)];
    let curLength = pieceLength('startFinish');
    let bMinX = fps[0].minX;
    let bMaxX = fps[0].maxX;
    let bMinY = fps[0].minY;
    let bMaxY = fps[0].maxY;
    let nodes = 0;

    const record = () => {
      const n = seq.length;
      if (n < range.min) return;
      if (curLength < minLength - 0.5) {
        result.rejectedByLength++;
        return;
      }
      if (opts.mode === 'max' && n < best - 4) return;
      const key = shapeKey(seq);
      if (found.has(key) || rejected.has(key)) {
        result.duplicates++;
        return;
      }
      if (opts.room && !bestOrientation(place(seq), opts.room)) {
        rejected.add(key);
        result.rejectedByRoom++;
        return;
      }
      if (found.size >= MAX_STORED) return;
      best = Math.max(best, n);
      found.set(key, { sequence: [...seq], key, length: curLength, width: bMaxX - bMinX, height: bMaxY - bMinY });
    };

    const dfs = (pose: Pose): boolean => {
      if (++nodes > nodeLimit) return false;
      result.nodes++;
      if ((result.nodes & 1023) === 0 && Date.now() > stopAt) {
        timedOut = true;
        return false;
      }
      const slots = cap - seq.length - 1; // pieces still allowed after this one
      if (slots < 0) return true;
      const order = shuffle([...types], rand);
      for (const id of order) {
        if (remaining[id] === 0) continue;
        const turn = pieceTurn(id);
        const len = pieceLength(id);
        if (curLength + len > maxLength + 0.5) continue;
        const end = exitPose(id, pose);
        const nRight = Math.min(remRight - Math.max(turn, 0), maxRightStep * slots);
        const nLeft = Math.min(remLeft - Math.max(-turn, 0), maxLeftStep * slots);
        const nLength = remLength - len;
        // 1. heading reachability
        const canCw = end.h - nLeft <= FULL_TURN_UNITS && FULL_TURN_UNITS <= end.h + nRight;
        const canCcw = end.h - nLeft <= -FULL_TURN_UNITS && -FULL_TURN_UNITS <= end.h + nRight;
        if (!canCw && !canCcw) continue;
        // 2. distance back to start
        const dist = distance(end, ORIGIN);
        if (dist > Math.min(nLength, maxChord * Math.max(slots, 0)) + POSITION_TOLERANCE) continue;
        const closes = dist <= POSITION_TOLERANCE && Math.abs(end.h) === FULL_TURN_UNITS;
        if (!closes && slots <= 0) continue;
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

        const saved = [bMinX, bMaxX, bMinY, bMaxY, remRight, remLeft, remLength, curLength];
        seq.push(id);
        curLength += len;
        bMinX = nMinX;
        bMaxX = nMaxX;
        bMinY = nMinY;
        bMaxY = nMaxY;
        if (closes) {
          record();
          [bMinX, bMaxX, bMinY, bMaxY, remRight, remLeft, remLength, curLength] = saved;
          seq.pop();
          continue;
        }
        remaining[id]--;
        remRight -= Math.max(turn, 0);
        remLeft -= Math.max(-turn, 0);
        remLength = nLength;
        fps.push(fp);
        const complete = dfs(end);
        fps.pop();
        [bMinX, bMaxX, bMinY, bMaxY, remRight, remLeft, remLength, curLength] = saved;
        remaining[id]++;
        seq.pop();
        if (!complete) return false;
      }
      return true;
    };
    return dfs(exitPose('startFinish', ORIGIN));
  };

  // Phase 1: randomized restarts, each with its own piece limit. A tight
  // limit makes the slot pruning steer the track back to the start, which
  // is what makes long loops findable at all. In mode "max" the limit climbs
  // a few pieces above the longest loop found so far.
  const capRand = rng(opts.seed * 31 + 7);
  const climb = opts.mode === 'max';
  const smallSpace = range.max <= 20;
  const phase1End = climb && !smallSpace ? t0 + opts.timeLimitMs * 0.4 : deadline;
  for (let r = 0; !timedOut && Date.now() < phase1End; r++) {
    if (!climb && r >= MIN_RESTARTS && found.size >= target) break;
    if (!climb && r >= MIN_RESTARTS * 8) break;
    if (climb && (best >= range.max || (smallSpace && r >= MIN_RESTARTS * 8))) break;
    const cap = climb
      ? Math.min(range.max, Math.max(best, Math.min(range.max, AUTO_MAX_PIECES) - 8) + 1 + Math.floor(capRand() * 8))
      : range.min + Math.floor(capRand() * (range.max - range.min + 1));
    runDfs(rng(opts.seed * 7919 + r), NODES_PER_RESTART, cap);
  }
  // Phase 2: complete search. Once enough shapes are known it only gets a
  // short extra budget, so large inventories return quickly.
  if (!timedOut && Date.now() < deadline && (!climb || smallSpace)) {
    if (found.size >= target) stopAt = Math.min(deadline, Date.now() + 800);
    const complete = runDfs(rng(opts.seed), Infinity, range.max);
    result.exhaustive = complete && !timedOut && found.size < MAX_STORED;
  }
  // Phase 3 (mode "max"): grow the longest loops by closure-preserving
  // insertions until the inventory or the time is used up.
  if (climb && !result.exhaustive) {
    const grown = growLoops([...found.values()].map((c) => c.sequence), opts, deadline, rng(opts.seed + 101));
    for (const seq of grown) {
      const key = shapeKey(seq);
      if (found.has(key)) continue;
      const pl = place(seq);
      const bb = pl.reduce(
        (b, p) => ({
          minX: Math.min(b.minX, p.footprint.minX),
          maxX: Math.max(b.maxX, p.footprint.maxX),
          minY: Math.min(b.minY, p.footprint.minY),
          maxY: Math.max(b.maxY, p.footprint.maxY),
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
      );
      best = Math.max(best, seq.length);
      found.set(key, { sequence: seq, key, length: trackLength(seq), width: bb.maxX - bb.minX, height: bb.maxY - bb.minY });
    }
  }

  result.distinctFound = found.size;
  const available = types.length + 1;
  let pool = [...found.values()]
    .filter((c) => opts.mode !== 'max' || c.sequence.length >= best - 4)
    .map((c) => ({ c, score: styleScore(opts.style, layoutMetrics(c.sequence, c.width, c.height), c.length, available) }));
  if (opts.mode === 'max') {
    pool.sort((a, b) => b.c.sequence.length - a.c.sequence.length || b.score - a.score);
    pool = pool.slice(0, opts.maxResults);
  } else {
    // best matches for the style, with some randomness between runs
    pool.sort((a, b) => b.score - a.score);
    pool = shuffle(pool.slice(0, opts.maxResults * 3), rng(opts.seed ^ 0x9e3779b9)).slice(0, opts.maxResults);
  }
  result.layouts = pool.map(({ c }) => {
    const o = bestOrientation(place(c.sequence), opts.room) ?? { rotation: 0, width: 0, height: 0 };
    const metrics = layoutMetrics(c.sequence, o.width, o.height);
    return {
      sequence: c.sequence,
      key: c.key,
      length: c.length,
      width: o.width,
      height: o.height,
      rotation: o.rotation,
      metrics,
      score: styleScore(opts.style, metrics, c.length, available),
    };
  });
  if (opts.mode === 'max') result.layouts.sort((a, b) => b.sequence.length - a.sequence.length || b.score - a.score);
  else result.layouts.sort((a, b) => b.score - a.score);
  result.elapsedMs = Date.now() - t0;
  return result;
}

/**
 * Heading-neutral modules that can be inserted into a closed loop. A module
 * moves everything after it by a fixed vector; inserting a second module
 * whose vector is exactly opposite closes the loop again. On the 30° grid
 * the vectors are exact, so closure is preserved without any rounding:
 *  - one straight: 433 mm along the current heading,
 *  - R1 right + R1 left: 750 mm at +30°, R1 left + R1 right: 750 mm at −30°,
 *  - R2 right + R2 left: 1165 mm at +15°, R2 left + R2 right: at −15°.
 * Two modules cancel when they have the same type of vector and opposite
 * directions (e.g. S/S at +180°, RL then LR at +240°). Directions are kept in
 * half units (15°) so the R2 modules stay exact integers.
 */
const MODULES: { pieces: PieceId[]; dir: number; kind: string }[] = [
  { pieces: ['straight'], dir: 0, kind: 'S' },
  { pieces: ['curveR1Right', 'curveR1Left'], dir: 2, kind: 'R1' },
  { pieces: ['curveR1Left', 'curveR1Right'], dir: -2, kind: 'R1' },
  { pieces: ['curveR2Right', 'curveR2Left'], dir: 1, kind: 'R2' },
  { pieces: ['curveR2Left', 'curveR2Right'], dir: -1, kind: 'R2' },
];

function fitsInventory(seq: PieceId[], inv: Inventory): boolean {
  const c: Partial<Record<PieceId, number>> = {};
  for (const id of seq) {
    c[id] = (c[id] ?? 0) + 1;
    if ((c[id] as number) > inv[id]) return false;
  }
  return true;
}

function loopIsValid(seq: PieceId[], opts: SearchOptions): boolean {
  if (opts.maxLength !== undefined && trackLength(seq) > opts.maxLength + 0.5) return false;
  const pl = place(seq);
  const end = pl[pl.length - 1].end;
  if (distance(end, ORIGIN) > POSITION_TOLERANCE || Math.abs(end.h) !== FULL_TURN_UNITS) return false;
  const n = pl.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (footprintsOverlap(pl[i].footprint, pl[j].footprint)) return false;
    }
  }
  return !opts.room || !!bestOrientation(pl, opts.room);
}

export function growLoops(seeds: PieceId[][], opts: SearchOptions, deadline: number, rand: () => number): PieceId[][] {
  const half = 2 * FULL_TURN_UNITS;
  const modHalf = (n: number) => ((n % half) + half) % half;
  const out: PieceId[][] = [];
  const limit = usableCount(opts.inventory);
  // Best-first: always extend the longest loop not tried yet. Every grown
  // loop goes back into the queue, so dead ends fall back to other shapes.
  const queue = [...seeds].sort((a, b) => b.length - a.length).slice(0, 200);
  const tried = new Set<string>();
  while (queue.length && Date.now() < deadline) {
    queue.sort((a, b) => b.length - a.length);
    const cur = queue.shift() as PieceId[];
    const key = shapeKey(cur);
    if (tried.has(key) || cur.length >= limit) continue;
    tried.add(key);
    // start heading of every insertion point (index cur.length = end)
    const heads: number[] = [];
    let h = 0;
    for (const id of cur) {
      heads.push(h);
      h += pieceTurn(id);
    }
    heads.push(h);
    const cands: [number, number, number, number][] = [];
    for (let a = 0; a < MODULES.length; a++) {
      for (let b = 0; b < MODULES.length; b++) {
        if (MODULES[a].kind !== MODULES[b].kind) continue;
        for (let i = 1; i <= cur.length; i++) {
          for (let j = i; j <= cur.length; j++) {
            if (modHalf(2 * heads[i] + MODULES[a].dir - (2 * heads[j] + MODULES[b].dir)) !== FULL_TURN_UNITS) continue;
            cands.push([a, i, b, j]);
          }
        }
      }
    }
    shuffle(cands, rand);
    let grown = 0;
    for (const [a, i, b, j] of cands) {
      if (Date.now() > deadline || grown >= 3) break;
      const trial = [...cur.slice(0, i), ...MODULES[a].pieces, ...cur.slice(i, j), ...MODULES[b].pieces, ...cur.slice(j)];
      if (trial.length > limit || !fitsInventory(trial, opts.inventory) || tried.has(shapeKey(trial))) continue;
      if (loopIsValid(trial, opts)) {
        out.push(trial);
        queue.push(trial);
        grown++;
      }
    }
  }
  return out;
}

/** Concrete, honest suggestions when no track was found. */
export function suggestAlternatives(opts: SearchOptions, result: SearchResult): string[] {
  const out: string[] = [];
  const inv = opts.inventory;
  if (inv.startFinish < 1) out.push('Eine Start-/Zielgerade im Bestand eintragen.');
  const { right, left } = turnTotals(inv);
  if (right < FULL_TURN_UNITS && left < FULL_TURN_UNITS) {
    const missing = (FULL_TURN_UNITS - Math.max(right, left)) * 30;
    out.push(`Kurven ergänzen: Es fehlen mindestens ${missing}° in eine Richtung (z. B. ${Math.ceil(missing / 60)} R1-Kurven).`);
  }
  if (opts.room) {
    out.push(
      result.rejectedByRoom > 0
        ? `Fläche vergrößern: ${result.rejectedByRoom} geschlossene Formen waren zu groß.`
        : 'Flächenbegrenzung ausschalten oder vergrößern.',
    );
  }
  if (opts.maxLength !== undefined) out.push('Maximale Streckenlänge erhöhen.');
  if (opts.minLength !== undefined && opts.minLength > 0) out.push('Mindestlänge senken.');
  if (opts.mode === 'custom') {
    if (result.range.min > 6) out.push(`Mindestanzahl Teile senken (aktuell ${result.range.min}).`);
    if (result.range.max < usableCount(inv)) out.push(`Höchstanzahl Teile erhöhen (aktuell ${result.range.max}).`);
    out.push('Modus „Automatisch“ verwenden.');
  }
  if (!result.exhaustive) out.push('Erneut generieren – jede Suche startet an einer anderen Stelle.');
  return out;
}

export function describeSequence(sequence: PieceId[]): string {
  return sequence.map((id) => PIECES[id].short).join(' → ');
}
