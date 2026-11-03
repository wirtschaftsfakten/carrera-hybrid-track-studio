import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { PIECES, type PieceId } from '../geometry/catalog';

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-carrera-red text-white shadow-[0_8px_24px_-8px_rgba(227,6,27,.7)] hover:bg-[#f2142a] active:bg-[#c10517]',
  ghost: 'bg-ink-800 text-zinc-100 ring-1 ring-white/10 hover:bg-ink-700',
  subtle: 'bg-transparent text-zinc-300 hover:bg-white/5',
  danger: 'bg-ink-800 text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/10',
};

export function Button({
  variant = 'ghost',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-ink-850 ring-1 ring-white/[.06] ${className}`}>{children}</section>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-bold uppercase tracking-[.14em] text-zinc-400">{children}</h2>
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </div>
  );
}

export function Stepper({
  value,
  min = 0,
  max = 99,
  onChange,
  label,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`${label} verringern`}
        className="grid h-10 w-10 place-items-center rounded-lg bg-ink-700 text-lg font-bold text-zinc-200 disabled:opacity-30"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="w-9 text-center text-lg font-bold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`${label} erhöhen`}
        className="grid h-10 w-10 place-items-center rounded-lg bg-ink-700 text-lg font-bold text-zinc-200 disabled:opacity-30"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-4 text-left text-sm text-zinc-200"
    >
      <span>{label}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-carrera-red' : 'bg-ink-600'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

/** Small pictogram of a track piece, drawn in travel direction (upwards). */
export function PieceGlyph({ id, size = 28 }: { id: PieceId; size?: number }) {
  const g = PIECES[id].geometry;
  let d = 'M 16 28 L 16 4';
  if (g.kind === 'arc') {
    const sweep = g.dir === 1 ? 1 : 0;
    const r = g.units === 2 ? 14 : 30;
    const ang = (g.units * 30 * Math.PI) / 180;
    const ex = 16 + g.dir * (r - r * Math.cos(ang));
    const ey = 28 - r * Math.sin(ang);
    d = `M 16 28 A ${r} ${r} 0 0 ${sweep} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d={d} fill="none" stroke="#3a4152" strokeWidth="9" strokeLinecap="butt" />
      <path d={d} fill="none" stroke={id === 'startFinish' ? '#fff' : '#cfd5e2'} strokeWidth="2" strokeDasharray={id === 'startFinish' ? '2 2' : undefined} />
    </svg>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="truncate text-sm font-semibold tabular-nums text-zinc-100">{value}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; locked?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-ink-900 p-1 ring-1 ring-white/5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex min-h-10 items-center justify-center gap-1 rounded-lg px-2 text-[13px] font-semibold transition ${
            value === o.value ? 'bg-ink-700 text-white shadow ring-1 ring-white/10' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {o.label}
          {o.locked && <LockIcon />}
        </button>
      ))}
    </div>
  );
}

export function LockIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-label="Pro" className={`shrink-0 text-carrera-amber ${className}`} fill="currentColor">
      <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V7a3 3 0 0 0-6 0v3z" />
    </svg>
  );
}

export function ProBadge() {
  return <span className="rounded bg-carrera-red/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-carrera-red">Pro</span>;
}

/** Two-thumb range slider (min/max), touch friendly. */
export function RangeSlider({
  min,
  max,
  low,
  high,
  onChange,
  label,
  unit = '',
  step = 1,
}: {
  min: number;
  max: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  label: string;
  unit?: string;
  step?: number;
}) {
  const span = Math.max(1, max - min);
  const pct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / span) * 100;
  return (
    <div className="py-1">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-zinc-200">{label}</span>
        <span className="font-semibold tabular-nums text-white">
          {low}–{high}
          {unit}
        </span>
      </div>
      <div className="range-dual relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-700" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-carrera-red"
          style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
        />
        <input
          type="range"
          aria-label={`${label} Minimum`}
          min={min}
          max={max}
          step={step}
          value={low}
          onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)}
        />
        <input
          type="range"
          aria-label={`${label} Maximum`}
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))}
        />
      </div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Schließen" className="animate-fade absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-sheet relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-ink-850 p-5 pb-[max(env(safe-area-inset-bottom),20px)] ring-1 ring-white/10 sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-zinc-300">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
