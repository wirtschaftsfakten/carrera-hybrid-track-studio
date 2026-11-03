import { forwardRef, useEffect, useId, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
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
  /** Pinch / wheel zoom and drag to pan, with zoom buttons. */
  interactive?: boolean;
  className?: string;
}

const EDGE = 21; // mm, coloured edge strip per side
const MAX_ZOOM = 8;

type View = { k: number; tx: number; ty: number };
const IDENTITY: View = { k: 1, tx: 0, ty: 0 };

export const TrackSvg = forwardRef<SVGSVGElement, Props>(function TrackSvg(
  {
    sequence,
    rotation = 0,
    compact = false,
    selected = null,
    onSelect,
    faulty,
    showNumbers = !compact,
    showOpenEnd = false,
    autoHeight = false,
    interactive = false,
    className = '',
  },
  ref,
) {
  const uid = useId().replace(/:/g, '');
  const [view, setView] = useState<View>(IDENTITY);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, Vec>());
  const gesture = useRef<{ dist: number; mid: Vec; view: View; moved: boolean } | null>(null);

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
        joint: [rot(pointOnPiece(p.id, p.start, 0, -HALF_WIDTH)), rot(pointOnPiece(p.id, p.start, 0, HALF_WIDTH))],
        mid: rot(pointOnPiece(p.id, p.start, 0.5)),
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

  // --- zoom & pan (view transform in SVG units) ------------------------
  const toSvg = (clientX: number, clientY: number): Vec => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const clampView = (v: View): View => {
    const k = Math.min(MAX_ZOOM, Math.max(1, v.k));
    if (k === 1) return IDENTITY;
    // keep the track at least half on screen
    const cx = data.minX + data.w / 2;
    const cy = data.minY + data.h / 2;
    const lim = (t: number, c: number, size: number) => Math.min(c * (1 - k) + (size * k) / 2, Math.max(c * (1 - k) - (size * k) / 2, t));
    return { k, tx: lim(v.tx, cx, data.w), ty: lim(v.ty, cy, data.h) };
  };
  const zoomAt = (p: Vec, factor: number, base: View): View => {
    const k = Math.min(MAX_ZOOM, Math.max(1, base.k * factor));
    const f = k / base.k;
    return clampView({ k, tx: p.x - (p.x - base.tx) * f, ty: p.y - (p.y - base.ty) * f });
  };
  const center = (): Vec => ({ x: data.minX + data.w / 2, y: data.minY + data.h / 2 });

  // reset the zoom when a different track is shown
  useEffect(() => setView(IDENTITY), [sequence, rotation]);

  // wheel zoom needs a non-passive listener to stop the page from scrolling
  const zoomRef = useRef({ zoomAt, toSvg });
  zoomRef.current = { zoomAt, toSvg };
  useEffect(() => {
    const el = svgRef.current;
    if (!interactive || !el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { zoomAt: z, toSvg: t } = zoomRef.current;
      setView((v) => z(t(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.0015), v));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [interactive]);

  const midOf = (ps: Vec[]): Vec => (ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0]);
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...pointers.current.values()];
    gesture.current = {
      dist: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0,
      mid: midOf(ps),
      view,
      moved: ps.length > 1 || (gesture.current?.moved ?? false),
    };
    if (ps.length === 1) gesture.current.moved = false;
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!interactive || !g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...pointers.current.values()];
    const mid = midOf(ps);
    if (Math.hypot(mid.x - g.mid.x, mid.y - g.mid.y) > 6) g.moved = true;
    if (ps.length < 2 && (!g.moved || g.view.k === 1)) return; // tap, or nothing to pan
    const a = toSvg(g.mid.x, g.mid.y);
    const b = toSvg(mid.x, mid.y);
    let next: View = { ...g.view, tx: g.view.tx + (b.x - a.x), ty: g.view.ty + (b.y - a.y) };
    if (ps.length > 1 && g.dist > 0) {
      g.moved = true;
      next = zoomAt(b, Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) / g.dist, next);
    }
    setView(clampView(next));
  };
  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const ps = [...pointers.current.values()];
    if (ps.length && gesture.current) gesture.current = { dist: 0, mid: ps[0], view, moved: true };
  };
  const select = (i: number) => {
    if (gesture.current?.moved) return; // that was a drag, not a tap
    onSelect?.(i);
  };

  const svg = (
    <svg
      ref={(el) => {
        svgRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      viewBox={`${data.minX} ${data.minY} ${data.w} ${data.h}`}
      className={`block w-full select-none ${autoHeight ? 'h-auto' : 'h-full'} ${interactive ? 'touch-none' : ''} ${className}`}
      role="img"
      aria-label={`Streckenplan mit ${sequence.length} Teilen`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={interactive ? () => setView(view.k > 1 ? IDENTITY : zoomAt(center(), 2.5, view)) : undefined}
    >
      <defs>
        <pattern id={`grid-${uid}`} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
          <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="3" />
        </pattern>
        <pattern id={`checker-${uid}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#fff" />
          <rect width="10" height="10" fill="#111" />
          <rect x="10" y="10" width="10" height="10" fill="#111" />
        </pattern>
        <linearGradient id={`asphalt-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b2f38" />
          <stop offset="1" stopColor="#22252d" />
        </linearGradient>
      </defs>
      {!compact && <rect x={data.minX} y={data.minY} width={data.w} height={data.h} fill={`url(#grid-${uid})`} />}

      <g data-zoom="" transform={view.k === 1 ? undefined : `translate(${view.tx} ${view.ty}) scale(${view.k})`}>
        {data.pieces.map((p) => {
          const isSel = selected === p.index;
          const isBad = faulty?.has(p.index);
          return (
            <g key={p.index} onClick={onSelect ? () => select(p.index) : undefined} className={onSelect ? 'cursor-pointer' : undefined}>
              <polygon
                points={pts(p.outline)}
                fill={isBad ? '#4a1018' : isSel ? '#2b3550' : `url(#asphalt-${uid})`}
                stroke={isSel ? '#ffb020' : isBad ? '#ff3b4d' : '#0b0c10'}
                strokeWidth={isSel || isBad ? 10 : 4}
                strokeLinejoin="round"
              />
              <polyline points={pts(p.left)} fill="none" stroke="#1e6bff" strokeWidth={EDGE} />
              <polyline points={pts(p.left)} fill="none" stroke="#fff" strokeWidth={EDGE} strokeDasharray="24 24" strokeOpacity="0.85" />
              <polyline points={pts(p.right)} fill="none" stroke="#e3061b" strokeWidth={EDGE} />
              <polyline points={pts(p.right)} fill="none" stroke="#fff" strokeWidth={EDGE} strokeDasharray="24 24" strokeOpacity="0.85" />
              {!compact && <polyline points={pts(p.joint)} stroke="#0b0c10" strokeWidth="4" strokeOpacity="0.8" />}
              {p.id === 'startFinish' && <StartLine piece={p} rot={data.rot} fill={`url(#checker-${uid})`} />}
              {!compact && <Arrow at={p.mid} heading={p.heading} />}
              {showNumbers && (
                <g transform={`translate(${p.mid.x} ${p.mid.y})`}>
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
      </g>
    </svg>
  );

  if (!interactive) return svg;
  return (
    <div className="relative w-full">
      {svg}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1.5">
        <ZoomButton label="Vergrößern" onClick={() => setView((v) => zoomAt(center(), 1.5, v))}>
          +
        </ZoomButton>
        <ZoomButton label="Verkleinern" onClick={() => setView((v) => zoomAt(center(), 1 / 1.5, v))}>
          −
        </ZoomButton>
        {view.k > 1 && (
          <ZoomButton label="Ganze Strecke zeigen" onClick={() => setView(IDENTITY)}>
            ⤢
          </ZoomButton>
        )}
      </div>
    </div>
  );
});

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-full bg-ink-950/80 text-lg font-bold text-white ring-1 ring-white/10 backdrop-blur transition active:scale-95"
    >
      {children}
    </button>
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

function StartLine({ piece, rot, fill }: { piece: { id: PieceId; start: Pose }; rot: (v: Vec) => Vec; fill: string }) {
  // checkered band across the track at 40 % of the piece
  const a = rot(pointOnPiece(piece.id, piece.start, 0.4, -HALF_WIDTH + EDGE));
  const b = rot(pointOnPiece(piece.id, piece.start, 0.4, HALF_WIDTH - EDGE));
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return (
    <g transform={`translate(${a.x} ${a.y}) rotate(${angle})`}>
      <rect x="0" y="-20" width={len} height="40" fill={fill} />
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
