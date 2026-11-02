import { useMemo } from 'react';
import { HALF_WIDTH, HEADING_UNIT_DEG, PIECES, type PieceId } from '../geometry/catalog';
import { place } from '../geometry/layout';
import { pieceOutline, pointOnPiece, type Pose, type Vec } from '../geometry/pose';

interface Props {
  sequence: PieceId[];
  /** View rotation in 30° steps. */
  rotation?: number;
  compact?: boolean;
  selected?: number | null;
  onSelect?: (index: number) => void;
  /** Indices of pieces to highlight as faulty. */
  faulty?: Set<number>;
  showNumbers?: boolean;
  /** Show where the next piece would attach (editor). */
  showOpenEnd?: boolean;
  /** Height follows the track's aspect ratio instead of filling the parent. */
  autoHeight?: boolean;
  className?: string;
}

const EDGE = 21; // mm, coloured edge strip per side

export function TrackSvg({
  sequence,
  rotation = 0,
  compact = false,
  selected = null,
  onSelect,
  faulty,
  showNumbers = !compact,
  showOpenEnd = false,
  autoHeight = false,
  className = '',
}: Props) {
  const data = useMemo(() => {
    const a = (rotation * HEADING_UNIT_DEG * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const rot = (v: Vec): Vec => ({ x: v.x * c - v.y * s, y: v.x * s + v.y * c });
    const placements = place(sequence);
    const pieces = placements.map((p) => {
      const steps = PIECES[p.id].geometry.kind === 'straight' ? 1 : 18;
      const line = (offset: number) =>
        Array.from({ length: steps + 1 }, (_, i) => rot(pointOnPiece(p.id, p.start, i / steps, offset)));
      return {
        ...p,
        outline: pieceOutline(p.id, p.start, steps).map(rot),
        left: line(-HALF_WIDTH + EDGE / 2),
        right: line(HALF_WIDTH - EDGE / 2),
        mid: rot(pointOnPiece(p.id, p.start, 0.5)),
        numberAt: rot(pointOnPiece(p.id, p.start, 0.5, 0)),
        heading: headingAt(p.id, p.start, 0.5) + rotation,
      };
    });
    const end: Pose = placements.length ? placements[placements.length - 1].end : { x: 0, y: 0, h: 0 };
    const endPt = rot(end);
    const all = pieces.flatMap((p) => p.outline);
    if (showOpenEnd) {
      const ghost = pieceOutline('straight', end).map(rot);
      all.push(...ghost, endPt);
    }
    if (!all.length) all.push({ x: -300, y: -300 }, { x: 300, y: 300 });
    const pad = compact ? 40 : 90;
    const minX = Math.min(...all.map((p) => p.x)) - pad;
    const minY = Math.min(...all.map((p) => p.y)) - pad;
    const maxX = Math.max(...all.map((p) => p.x)) + pad;
    const maxY = Math.max(...all.map((p) => p.y)) + pad;
    return { pieces, minX, minY, w: maxX - minX, h: maxY - minY, endPt, endHeading: end.h + rotation, rot };
  }, [sequence, rotation, compact, showOpenEnd]);

  const pts = (v: Vec[]) => v.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const gridStep = 433.0127 / 2;

  return (
    <svg
      viewBox={`${data.minX} ${data.minY} ${data.w} ${data.h}`}
      className={`block w-full select-none ${autoHeight ? 'h-auto' : 'h-full'} ${className}`}
      role="img"
      aria-label={`Streckenplan mit ${sequence.length} Teilen`}
    >
      {!compact && (
        <>
          <defs>
            <pattern id="grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
              <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="3" />
            </pattern>
            <pattern id="checker" width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="#fff" />
              <rect width="10" height="10" fill="#111" />
              <rect x="10" y="10" width="10" height="10" fill="#111" />
            </pattern>
          </defs>
          <rect x={data.minX} y={data.minY} width={data.w} height={data.h} fill="url(#grid)" />
        </>
      )}

      {data.pieces.map((p) => {
        const isSel = selected === p.index;
        const isBad = faulty?.has(p.index);
        return (
          <g
            key={p.index}
            onClick={onSelect ? () => onSelect(p.index) : undefined}
            className={onSelect ? 'cursor-pointer' : undefined}
          >
            <polygon
              points={pts(p.outline)}
              fill={isBad ? '#4a1018' : isSel ? '#2b3550' : '#262a33'}
              stroke={isSel ? '#ffb020' : isBad ? '#ff3b4d' : '#0b0c10'}
              strokeWidth={isSel || isBad ? 10 : 4}
              strokeLinejoin="round"
            />
            <polyline points={pts(p.left)} fill="none" stroke="#1e6bff" strokeWidth={EDGE} />
            <polyline points={pts(p.left)} fill="none" stroke="#fff" strokeWidth={EDGE} strokeDasharray="24 24" strokeOpacity="0.85" />
            <polyline points={pts(p.right)} fill="none" stroke="#e3061b" strokeWidth={EDGE} />
            <polyline points={pts(p.right)} fill="none" stroke="#fff" strokeWidth={EDGE} strokeDasharray="24 24" strokeOpacity="0.85" />
            {p.id === 'startFinish' && <StartLine piece={p} rot={data.rot} />}
            {!compact && <Arrow at={p.mid} heading={p.heading} />}
            {showNumbers && (
              <g transform={`translate(${p.numberAt.x} ${p.numberAt.y})`}>
                <circle r="38" cy="70" fill="#0d0f14" stroke="#ffffff33" strokeWidth="3" />
                <text y="70" textAnchor="middle" dominantBaseline="central" fontSize="40" fontWeight="700" fill="#fff">
                  {p.index + 1}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {showOpenEnd && <OpenEnd at={data.endPt} heading={data.endHeading} empty={!sequence.length} />}
    </svg>
  );
}

function headingAt(id: PieceId, start: Pose, t: number): number {
  const g = PIECES[id].geometry;
  return start.h + (g.kind === 'arc' ? g.dir * g.units * t : 0);
}

function Arrow({ at, heading }: { at: Vec; heading: number }) {
  const deg = heading * HEADING_UNIT_DEG;
  return (
    <g transform={`translate(${at.x} ${at.y}) rotate(${deg})`} opacity="0.9">
      <path d="M -40 -45 L 25 0 L -40 45 L -22 0 Z" fill="#ffffff" fillOpacity="0.85" />
    </g>
  );
}

function StartLine({ piece, rot }: { piece: { id: PieceId; start: Pose }; rot: (v: Vec) => Vec }) {
  // checkered band across the track at 40 % of the piece
  const a = rot(pointOnPiece(piece.id, piece.start, 0.4, -HALF_WIDTH + EDGE));
  const b = rot(pointOnPiece(piece.id, piece.start, 0.4, HALF_WIDTH - EDGE));
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return (
    <g transform={`translate(${a.x} ${a.y}) rotate(${angle})`}>
      <rect x="0" y="-20" width={len} height="40" fill="url(#checker)" />
    </g>
  );
}

function OpenEnd({ at, heading, empty }: { at: Vec; heading: number; empty: boolean }) {
  const deg = heading * HEADING_UNIT_DEG;
  return (
    <g transform={`translate(${at.x} ${at.y}) rotate(${deg})`}>
      <rect x="0" y={-HALF_WIDTH} width={433} height={HALF_WIDTH * 2} fill="none" stroke="#ffb020" strokeWidth="6" strokeDasharray="20 16" opacity="0.7" />
      <path d="M 120 -50 L 200 0 L 120 50" fill="none" stroke="#ffb020" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      {empty && (
        <text x="216" y="-150" textAnchor="middle" fontSize="56" fill="#ffb020">
          Erstes Teil
        </text>
      )}
    </g>
  );
}
