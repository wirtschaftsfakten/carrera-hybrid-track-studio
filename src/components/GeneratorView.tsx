import { useEffect, useRef, useState } from 'react';
import { useEntitlement } from '../billing/EntitlementProvider';
import { effectiveSettings, generationsLeft, limitsFor } from '../billing/entitlements';
import { PIECE_ORDER, PIECES, type Inventory, type PieceId } from '../geometry/catalog';
import { countPieces, validate } from '../geometry/layout';
import {
  resolveRange,
  suggestAlternatives,
  usableCount,
  type GeneratedLayout,
  type GeneratorMode,
  type SearchOptions,
  type SearchResult,
  type TrackStyle,
} from '../generator/search';
import { exportPdf, exportPng, safeFilename } from '../lib/export';
import { m, num, size } from '../lib/format';
import type { GeneratorSettings } from '../lib/storage';
import { PartsUsage, planLines } from './PartsUsage';
import { TrackSvg } from './TrackSvg';
import { Button, Card, LockIcon, ProBadge, RangeSlider, SectionTitle, Segmented, Stat, Stepper, Toggle } from './ui';

interface Props {
  inventory: Inventory;
  settings: GeneratorSettings;
  onSettings: (s: GeneratorSettings) => void;
  onOpenInEditor: (sequence: PieceId[], rotation: number, name: string) => void;
  /** Returns false when the track could not be saved (limit reached). */
  onSave: (sequence: PieceId[], rotation: number, name: string) => boolean;
  onEditInventory: () => void;
  onUpgrade: (reason: string) => void;
}

type Status = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; result: SearchResult; opts: SearchOptions };

const MODE_INFO: Record<GeneratorMode, string> = {
  auto: 'Der Generator wählt die Größe selbst. Dein Bestand ist nur die Obergrenze, nicht benötigte Teile bleiben in der Kiste.',
  custom: 'Du legst fest, wie viele Teile eine Strecke mindestens und höchstens haben soll.',
  max: 'So viele Teile wie möglich verbauen, aber nur, wenn die Strecke trotzdem geschlossen und überschneidungsfrei ist.',
};

const STYLE_LABEL: Record<TrackStyle, string> = {
  varied: 'Abwechslungsreich',
  fast: 'Schnell',
  twisty: 'Kurvenreich',
  compact: 'Kompakt',
};

export function GeneratorView({ inventory, settings, onSettings, onOpenInEditor, onSave, onEditInventory, onUpgrade }: Props) {
  const { tier, usage, countGeneration } = useEntitlement();
  const limits = limitsFor(tier);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [active, setActive] = useState(0);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const total = usableCount(inventory);
  const effective = effectiveSettings(settings, tier);
  const left = generationsLeft(tier, usage);
  const set = (patch: Partial<GeneratorSettings>) => onSettings({ ...settings, ...patch });

  const run = () => {
    if (left <= 0) {
      onUpgrade(`Du hast heute alle ${limits.generationsPerDay} kostenlosen Generierungen genutzt. Mit Pro generierst du unbegrenzt.`);
      return;
    }
    workerRef.current?.terminate();
    const worker = new Worker(new URL('../generator/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const s = effective;
    const opts: SearchOptions = {
      inventory,
      mode: s.mode,
      minPieces: s.minPieces,
      maxPieces: s.maxPieces,
      minLength: s.lengthEnabled ? s.minLengthCm * 10 : undefined,
      maxLength: s.lengthEnabled ? s.maxLengthCm * 10 : undefined,
      style: s.style,
      maxResults: s.maxResults,
      timeLimitMs: s.mode === 'max' ? 8000 : 6000,
      seed: Math.floor(Math.random() * 2 ** 31),
      room: s.roomEnabled ? { width: s.roomWidthCm * 10, height: s.roomHeightCm * 10 } : undefined,
    };
    setStatus({ kind: 'running' });
    worker.onmessage = (e: MessageEvent<SearchResult>) => {
      setStatus({ kind: 'done', result: e.data, opts });
      setActive(0);
      // only runs that produced tracks count against the daily limit
      if (e.data.layouts.length) countGeneration();
      worker.terminate();
      workerRef.current = null;
    };
    worker.onerror = (err) => {
      setStatus({ kind: 'idle' });
      console.error(err);
      worker.terminate();
    };
    worker.postMessage(opts);
  };

  const cancel = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setStatus({ kind: 'idle' });
  };

  const result = status.kind === 'done' ? status.result : null;
  const layout: GeneratedLayout | undefined = result?.layouts[active];
  const range = resolveRange({ ...effective, inventory });

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <Card className="p-4">
          <SectionTitle hint={<button className="text-carrera-amber" onClick={onEditInventory}>Bestand ändern</button>}>
            Bestand · {total} Teile
          </SectionTitle>
          <div className="flex flex-wrap gap-2">
            {PIECE_ORDER.filter((id) => inventory[id] > 0).map((id) => (
              <span key={id} className="rounded-lg bg-ink-800 px-2.5 py-1.5 text-xs text-zinc-300 ring-1 ring-white/5">
                <b className="tabular-nums text-white">{inventory[id]}×</b> {PIECES[id].name}
              </span>
            ))}
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <SectionTitle>Teileanzahl</SectionTitle>
          <Segmented<GeneratorMode>
            label="Generator-Modus"
            value={effective.mode}
            onChange={(mode) => {
              if (!limits.modes.includes(mode)) return onUpgrade('„Maximale Ausnutzung“ ist eine Pro-Funktion.');
              set({ mode });
            }}
            options={[
              { value: 'auto', label: 'Automatisch' },
              { value: 'custom', label: 'Eigene' },
              { value: 'max', label: 'Maximal', locked: !limits.modes.includes('max') },
            ]}
          />
          <p className="text-xs leading-relaxed text-zinc-400">{MODE_INFO[effective.mode]}</p>
          {effective.mode === 'custom' && (
            <RangeSlider
              label="Teile pro Strecke"
              min={3}
              max={Math.max(3, total)}
              low={Math.min(settings.minPieces, Math.max(3, total))}
              high={Math.min(settings.maxPieces, Math.max(3, total))}
              onChange={(minPieces, maxPieces) => set({ minPieces, maxPieces })}
            />
          )}
          {effective.mode !== 'custom' && total > 0 && (
            <p className="text-xs text-zinc-500">
              Gesucht wird zwischen {range.min} und {range.max} Teilen.
            </p>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <SectionTitle hint={tier === 'free' ? <ProBadge /> : undefined}>Streckenstil</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STYLE_LABEL) as TrackStyle[]).map((st) => {
              const locked = !limits.styles.includes(st);
              const on = effective.style === st;
              return (
                <button
                  key={st}
                  type="button"
                  aria-pressed={on}
                  onClick={() => (locked ? onUpgrade('Streckenstile sind eine Pro-Funktion.') : set({ style: st }))}
                  className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold ring-1 transition ${
                    on ? 'bg-carrera-red/15 text-white ring-carrera-red' : 'bg-ink-800 text-zinc-300 ring-white/5 hover:bg-ink-700'
                  }`}
                >
                  {STYLE_LABEL[st]}
                  {locked && <LockIcon />}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="space-y-1 p-4">
          <SectionTitle>Filter</SectionTitle>
          <div className="flex min-h-11 items-center justify-between text-sm text-zinc-200">
            <span>Varianten pro Durchlauf</span>
            <Stepper label="Anzahl Varianten" value={effective.maxResults} min={1} max={limits.maxVariants} onChange={(maxResults) => set({ maxResults })} />
          </div>
          {tier === 'free' && <p className="pb-1 text-xs text-zinc-500">Mit Pro bis zu {limitsFor('pro').maxVariants} Varianten.</p>}
          <Toggle
            label={limits.lengthFilter ? 'Streckenlänge begrenzen' : 'Streckenlänge begrenzen (Pro)'}
            checked={effective.lengthEnabled}
            onChange={(lengthEnabled) => (limits.lengthFilter ? set({ lengthEnabled }) : onUpgrade('Der Längenfilter ist eine Pro-Funktion.'))}
          />
          {effective.lengthEnabled && (
            <RangeSlider
              label="Länge"
              unit=" cm"
              min={100}
              max={5000}
              step={10}
              low={settings.minLengthCm}
              high={settings.maxLengthCm}
              onChange={(minLengthCm, maxLengthCm) => set({ minLengthCm, maxLengthCm })}
            />
          )}
          <Toggle label="Bodenfläche begrenzen" checked={effective.roomEnabled} onChange={(roomEnabled) => set({ roomEnabled })} />
          {effective.roomEnabled && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {(['roomWidthCm', 'roomHeightCm'] as const).map((k) => (
                <label key={k} className="text-xs text-zinc-400">
                  {k === 'roomWidthCm' ? 'Breite (cm)' : 'Tiefe (cm)'}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={50}
                    max={3000}
                    value={settings[k]}
                    onChange={(e) => set({ [k]: Math.max(50, Math.min(3000, Number(e.target.value) || 0)) })}
                    className="mt-1 w-full rounded-lg bg-ink-800 px-3 py-2.5 text-base text-white ring-1 ring-white/10 focus:outline-none focus:ring-carrera-red"
                  />
                </label>
              ))}
            </div>
          )}
        </Card>

        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+76px)] z-10 space-y-1.5 rounded-2xl bg-ink-950/80 p-1 backdrop-blur md:static md:bg-transparent md:p-0">
          {status.kind === 'running' ? (
            <Button variant="ghost" className="h-14 w-full" onClick={cancel}>
              <Spinner /> Suche läuft … abbrechen
            </Button>
          ) : (
            <Button variant="primary" className="h-14 w-full text-base" onClick={run} disabled={total === 0}>
              {result ? 'Neue Strecken generieren' : 'Strecken generieren'}
            </Button>
          )}
          {tier === 'free' && (
            <p className="text-center text-xs text-zinc-500">
              Heute noch {left} von {limits.generationsPerDay} kostenlosen Generierungen
            </p>
          )}
        </div>

        {result && <SearchSummary result={result} />}
      </div>

      <div className="min-w-0 space-y-4">
        {!result && status.kind !== 'running' && (
          <Card className="grid min-h-[300px] place-items-center p-8 text-center">
            <div className="max-w-sm space-y-2">
              <div className="text-lg font-semibold">Bereit</div>
              <p className="text-sm text-zinc-400">
                Der Generator sucht mit Backtracking geschlossene Rundkurse, die mit deinem Bestand baubar sind. Jedes Ergebnis ist geometrisch geprüft:
                Anschlüsse, Winkel, Fahrtrichtung und Überschneidungen.
              </p>
            </div>
          </Card>
        )}
        {status.kind === 'running' && (
          <Card className="grid min-h-[300px] place-items-center p-8 text-sm text-zinc-400">
            <div className="flex items-center gap-3">
              <Spinner /> Suche nach gültigen Rundkursen …
            </div>
          </Card>
        )}

        {status.kind === 'done' && !layout && <NoResult result={status.result} opts={status.opts} />}

        {result && layout && (
          <>
            <LayoutDetail
              key={layout.key}
              layout={layout}
              inventory={inventory}
              index={active}
              total={result.layouts.length}
              saved={savedKeys.has(layout.key)}
              onPrev={() => setActive((a) => (a - 1 + result.layouts.length) % result.layouts.length)}
              onNext={() => setActive((a) => (a + 1) % result.layouts.length)}
              onEdit={() => onOpenInEditor(layout.sequence, layout.rotation, `Generiert #${active + 1}`)}
              onSave={() => {
                if (onSave(layout.sequence, layout.rotation, `Rundkurs ${m(layout.length)} · ${layout.sequence.length} Teile`)) {
                  setSavedKeys(new Set(savedKeys).add(layout.key));
                }
              }}
              onUpgrade={onUpgrade}
            />
            {result.layouts.length > 1 && (
              <div>
                <SectionTitle hint={`${result.layouts.length} Varianten`}>Vergleich</SectionTitle>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {result.layouts.map((l, i) => (
                    <button
                      key={l.key}
                      onClick={() => setActive(i)}
                      className={`animate-rise overflow-hidden rounded-xl bg-ink-850 text-left ring-1 transition ${
                        i === active ? 'ring-2 ring-carrera-red' : 'ring-white/[.06] hover:ring-white/20'
                      }`}
                      aria-label={`Variante ${i + 1}`}
                    >
                      <div className="aspect-[4/3] p-1.5">
                        <TrackSvg sequence={l.sequence} rotation={l.rotation} compact />
                      </div>
                      <div className="grid grid-cols-3 gap-1 border-t border-white/5 px-2 py-1.5 text-[11px] tabular-nums text-zinc-400">
                        <span>
                          <b className="text-zinc-100">{l.sequence.length}</b> T.
                        </span>
                        <span className="text-center">{m(l.length)}</span>
                        <span className="text-right">
                          {num(l.width / 10)}×{num(l.height / 10)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LayoutDetail(props: {
  layout: GeneratedLayout;
  inventory: Inventory;
  index: number;
  total: number;
  saved: boolean;
  onPrev: () => void;
  onNext: () => void;
  onEdit: () => void;
  onSave: () => void;
  onUpgrade: (reason: string) => void;
}) {
  const { layout, inventory } = props;
  const { tier } = useEntitlement();
  const svgRef = useRef<SVGSVGElement>(null);
  const [exporting, setExporting] = useState(false);
  // Independent re-check of the generated track with the full validator.
  const check = validate(layout.sequence, inventory);
  const used = countPieces(layout.sequence);
  const name = `Rundkurs ${layout.sequence.length} Teile`;

  const doExport = async (kind: 'png' | 'pdf') => {
    if (!limitsFor(tier)[kind === 'png' ? 'exportPng' : 'exportPdf']) {
      props.onUpgrade('Der Export als PNG und PDF ist eine Pro-Funktion.');
      return;
    }
    if (!svgRef.current) return;
    setExporting(true);
    try {
      const file = safeFilename(`${name} ${m(layout.length)}`);
      if (kind === 'png') await exportPng(svgRef.current, file);
      else await exportPdf(svgRef.current, file, name, planLines(layout.sequence, layout.length, layout.width, layout.height, inventory));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="animate-rise overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
        <div className="text-sm font-semibold">
          Variante {props.index + 1} <span className="text-zinc-500">/ {props.total}</span>
        </div>
        <div className="flex gap-1">
          <Button variant="subtle" className="px-3" onClick={props.onPrev} aria-label="Vorherige Variante" disabled={props.total < 2}>
            ‹
          </Button>
          <Button variant="subtle" className="px-3" onClick={props.onNext} aria-label="Nächste Variante" disabled={props.total < 2}>
            ›
          </Button>
        </div>
      </div>
      <div className="grid min-h-[220px] place-items-center bg-ink-900 p-2">
        <TrackSvg ref={svgRef} sequence={layout.sequence} rotation={layout.rotation} autoHeight interactive className="max-h-[62vh]" />
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-white/5 px-4 py-3">
        <Stat label="Länge" value={m(layout.length)} />
        <Stat label="Platzbedarf" value={size(layout.width, layout.height)} />
        <Stat label="Teile" value={layout.sequence.length} />
      </div>
      <div className={`mx-4 mb-3 rounded-lg px-3 py-2 text-xs ${check.valid ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
        {check.valid
          ? `Geprüft: geschlossen (Abweichung ${num(check.gap, 3)} mm, Drehung ${check.totalTurnDeg}°), keine Überschneidung, Bestand eingehalten.`
          : `Prüfung fehlgeschlagen: ${check.issues.map((i) => i.message).join(' ')}`}
      </div>
      <PartsUsage used={used} inventory={inventory} />
      <details className="border-t border-white/5 px-4 py-3 text-sm">
        <summary className="cursor-pointer text-zinc-300">Bauanleitung (in Fahrtrichtung)</summary>
        <ol className="mt-2 grid gap-1 text-zinc-300 sm:grid-cols-2">
          {layout.sequence.map((id, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-6 text-right tabular-nums text-zinc-500">{i + 1}.</span>
              {PIECES[id].name}
            </li>
          ))}
        </ol>
      </details>
      <div className="grid grid-cols-2 gap-2 border-t border-white/5 p-3">
        <Button onClick={props.onEdit}>Im Editor öffnen</Button>
        <Button variant="primary" onClick={props.onSave} disabled={props.saved}>
          {props.saved ? 'Gespeichert ✓' : '★ Speichern'}
        </Button>
        <Button onClick={() => doExport('png')} disabled={exporting}>
          PNG {tier === 'free' && <LockIcon />}
        </Button>
        <Button onClick={() => doExport('pdf')} disabled={exporting}>
          PDF {tier === 'free' && <LockIcon />}
        </Button>
      </div>
    </Card>
  );
}

function SearchSummary({ result }: { result: SearchResult }) {
  return (
    <Card className="p-4 text-xs leading-relaxed text-zinc-400">
      <SectionTitle>Suche</SectionTitle>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
        <span>Teile pro Strecke</span>
        <span className="text-right text-zinc-200">
          {result.range.min}–{result.range.max}
        </span>
        <span>Verschiedene Formen</span>
        <span className="text-right text-zinc-200">
          {result.distinctFound}
          {!result.exhaustive && result.distinctFound > 0 ? '+' : ''}
        </span>
        <span>Geprüfte Knoten</span>
        <span className="text-right text-zinc-200">{result.nodes.toLocaleString('de-DE')}</span>
        <span>Dubletten (gedreht/gespiegelt)</span>
        <span className="text-right text-zinc-200">{result.duplicates.toLocaleString('de-DE')}</span>
        {result.rejectedByRoom > 0 && (
          <>
            <span>Zu groß für die Fläche</span>
            <span className="text-right text-zinc-200">{result.rejectedByRoom}</span>
          </>
        )}
        <span>Dauer</span>
        <span className="text-right text-zinc-200">{num(result.elapsedMs / 1000, 2)} s</span>
        <span>Suchraum</span>
        <span className="text-right text-zinc-200">{result.exhaustive ? 'vollständig' : 'Stichprobe / Zeitlimit'}</span>
      </div>
    </Card>
  );
}

function NoResult({ result, opts }: { result: SearchResult; opts: SearchOptions }) {
  const tips = suggestAlternatives(opts, result);
  return (
    <Card className="space-y-2 border-l-4 border-carrera-amber p-5">
      <div className="text-base font-semibold text-white">{result.exhaustive ? 'Kein gültiger Rundkurs möglich' : 'Kein Rundkurs gefunden'}</div>
      <p className="text-sm text-zinc-300">
        {result.impossibleReason ??
          (result.exhaustive
            ? result.rejectedByRoom > 0
              ? `Es gibt zwar ${result.rejectedByRoom} geschlossene Formen, aber keine passt auf die angegebene Fläche.`
              : 'Der komplette Suchraum wurde durchsucht: Mit diesen Teilen und Einstellungen lässt sich kein geschlossener, überschneidungsfreier Rundkurs bauen.'
            : 'Die Suche hat im Zeitlimit keinen Rundkurs gefunden. Das beweist nicht, dass keiner existiert.')}
      </p>
      {tips.length > 0 && (
        <div>
          <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Vorschläge</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-300">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-zinc-500">Es wird keine ungültige oder künstlich geschlossene Strecke angezeigt.</p>
    </Card>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-hidden="true" />;
}
