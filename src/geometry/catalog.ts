/**
 * Carrera HYBRID track piece catalogue.
 *
 * All lengths in millimetres. Headings are counted in steps of 30° ("units"),
 * so every orientation that can occur with these pieces is an exact integer
 * and loop closure on the heading can be checked without rounding.
 *
 * Sources (see README.md, section "Recherche"):
 *  - Carrera FAQ / product pages: standard straight 25 x 43.3 cm,
 *    standard curve radius 37.5 cm measured at the track centre,
 *    "Speedway to Hell" total track length 609 cm.
 *  - carrera-fun.com "CARRERA HYBRID: The track": width 250 mm, straight
 *    433 mm, R1 curve 60° (inner 250 / outer 500 mm), R2 curve 30°
 *    (inner 1000 / outer 1250 mm), pieces are direction-bound (blue edge
 *    left, red edge right), a right curve cannot be used as a left curve.
 *  - Carrera HYBRID manual (V03-03): pieces must always be joined in the
 *    direction of travel (arrows on the red / blue edge strips).
 *
 * The straight length is modelled as 250·√3 = 433.0127 mm. That is the
 * flat-to-flat width of a hexagon with 250 mm sides, which is the grid the
 * system is built on: a 60° curve of centre radius 375 mm (= 1.5 · 250)
 * leads exactly from one hexagon side to the next-but-one side. Using the
 * rounded 433 mm would leave a 0.1 mm error per straight that does not exist
 * on the real track.
 */

export const TRACK_WIDTH = 250;
export const HALF_WIDTH = TRACK_WIDTH / 2;
export const HEX_SIDE = 250;
export const STRAIGHT_LENGTH = HEX_SIDE * Math.sqrt(3);
export const HEADING_UNIT_DEG = 30;
export const FULL_TURN_UNITS = 360 / HEADING_UNIT_DEG;

export type PieceId =
  | 'startFinish'
  | 'straight'
  | 'curveR1Right'
  | 'curveR1Left'
  | 'curveR2Right'
  | 'curveR2Left';

export interface StraightGeometry {
  kind: 'straight';
  length: number;
}

export interface ArcGeometry {
  kind: 'arc';
  /** Centre-line radius in mm. */
  radius: number;
  /** Turn in heading units (30° each). */
  units: number;
  /** +1 = right turn in direction of travel, -1 = left turn. */
  dir: 1 | -1;
}

export interface PieceDef {
  id: PieceId;
  name: string;
  short: string;
  /** Single letter printed under the piece (carrera-fun.com list). */
  letter: string;
  geometry: StraightGeometry | ArcGeometry;
  /** Factual note shown in the parts catalogue. */
  note: string;
}

export const PIECES: Record<PieceId, PieceDef> = {
  startFinish: {
    id: 'startFinish',
    name: 'Start-/Zielgerade',
    short: 'S/Z',
    letter: 'A',
    geometry: { kind: 'straight', length: STRAIGHT_LENGTH },
    note: '433 × 250 mm, Fahrtrichtung durch Pfeil vor der Start-/Ziellinie vorgegeben. Genau eine pro Strecke.',
  },
  straight: {
    id: 'straight',
    name: 'Gerade',
    short: 'G',
    letter: 'B',
    geometry: { kind: 'straight', length: STRAIGHT_LENGTH },
    note: '433 × 250 mm (Carrera: 25 × 43,3 cm).',
  },
  curveR1Right: {
    id: 'curveR1Right',
    name: 'Kurve R1 60° rechts',
    short: 'R',
    letter: 'D',
    geometry: { kind: 'arc', radius: 375, units: 2, dir: 1 },
    note: '60°, Innenradius 250 mm, Außenradius 500 mm, Mitte 375 mm. Nur als Rechtskurve verwendbar.',
  },
  curveR1Left: {
    id: 'curveR1Left',
    name: 'Kurve R1 60° links',
    short: 'L',
    letter: 'C',
    geometry: { kind: 'arc', radius: 375, units: 2, dir: -1 },
    note: '60°, Innenradius 250 mm, Außenradius 500 mm, Mitte 375 mm. Nur als Linkskurve verwendbar.',
  },
  curveR2Right: {
    id: 'curveR2Right',
    name: 'Kurve R2 30° rechts',
    short: 'R2',
    letter: 'H',
    geometry: { kind: 'arc', radius: 1125, units: 1, dir: 1 },
    note: '30°, Innenradius 1000 mm, Außenradius 1250 mm, Mitte 1125 mm (Set 50052004).',
  },
  curveR2Left: {
    id: 'curveR2Left',
    name: 'Kurve R2 30° links',
    short: 'L2',
    letter: 'G',
    geometry: { kind: 'arc', radius: 1125, units: 1, dir: -1 },
    note: '30°, Innenradius 1000 mm, Außenradius 1250 mm, Mitte 1125 mm (Set 50052004).',
  },
};

export const PIECE_ORDER: PieceId[] = [
  'startFinish',
  'straight',
  'curveR1Right',
  'curveR1Left',
  'curveR2Right',
  'curveR2Left',
];

/** Pieces that exist but whose geometry could not be verified. They are not used. */
export const UNVERIFIED_PIECES = [
  {
    name: 'Haarnadelkurve 180° L/R (50052005)',
    letter: 'E / F',
    reason:
      'Keine offiziellen Maße gefunden. Ein Community-Beitrag beschreibt sie als 60°- plus 120°-Element – nicht bestätigt, deshalb nicht im Generator.',
  },
  {
    name: 'Schikane',
    letter: 'I',
    reason: 'Laut carrera-fun.com erhältlich, aber ohne Maßangaben. Nicht im Generator.',
  },
];

export type Inventory = Record<PieceId, number>;

export const DEFAULT_INVENTORY: Inventory = {
  startFinish: 1,
  straight: 4,
  curveR1Right: 8,
  curveR1Left: 2,
  curveR2Right: 0,
  curveR2Left: 0,
};

export function pieceLength(id: PieceId): number {
  const g = PIECES[id].geometry;
  return g.kind === 'straight' ? g.length : (g.radius * g.units * HEADING_UNIT_DEG * Math.PI) / 180;
}

/** Signed heading change in units (positive = right / clockwise on screen). */
export function pieceTurn(id: PieceId): number {
  const g = PIECES[id].geometry;
  return g.kind === 'straight' ? 0 : g.units * g.dir;
}
