import type { PieceId } from '../geometry/catalog';

/**
 * Shape signature of a closed loop, independent of
 *  - where the start/finish straight sits (it is geometrically a straight),
 *  - where the cyclic sequence starts (rotation of the whole track),
 *  - mirroring (left/right swapped),
 *  - and the direction it is driven (reverse + swap).
 * Two layouts with the same key look identical on the floor apart from
 * being rotated or mirrored, so the generator only keeps one of them.
 */
const CODE: Record<PieceId, string> = {
  startFinish: 'S',
  straight: 'S',
  curveR1Right: 'R',
  curveR1Left: 'L',
  curveR2Right: 'r',
  curveR2Left: 'l',
};

const SWAP: Record<string, string> = { S: 'S', R: 'L', L: 'R', r: 'l', l: 'r' };

function minRotation(s: string): string {
  let best = s;
  for (let i = 1; i < s.length; i++) {
    const rot = s.slice(i) + s.slice(0, i);
    if (rot < best) best = rot;
  }
  return best;
}

export function shapeKey(sequence: PieceId[]): string {
  const s = sequence.map((id) => CODE[id]).join('');
  const swapped = [...s].map((c) => SWAP[c]).join('');
  const reversed = [...s].reverse().join('');
  const reversedSwapped = [...swapped].reverse().join('');
  return [s, swapped, reversed, reversedSwapped].map(minRotation).sort()[0];
}
