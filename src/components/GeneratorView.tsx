import { useEffect, useRef, useState } from 'react';
import { PIECE_ORDER, PIECES, type Inventory, type PieceId } from '../geometry/catalog';
import { countPieces, validate } from '../geometry/layout';
import type { GeneratedLayout, SearchOptions, SearchResult } from '../generator/search';
import { m, num, size } from '../lib/format';
import type { GeneratorSettings } from '../lib/storage';
import { TrackSvg } from './TrackSvg';
import { Button, Card, SectionTitle, Stat, Stepper, Toggle } from './ui';

interface Props {
  inventory: Inventory;
  settings: GeneratorSettings;
  onSettings: (s: GeneratorSettings) => void;
  onOpenInEditor: (sequence: PieceId[], rotation: number, name: string) => void;
  onSave: (sequence: PieceId[], rotation: number, name: string) => void;
  onEditInventory: () => void;
}

type Status = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; result: SearchResult };

export function GeneratorView({ inventory, settings, onSettings, onOpenInEditor, onSave, onEditInventory }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [active, setActive] = useState(0);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = () => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL('../generator/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const opts: SearchOptions = {
      inventory,
      useAll: settings.useAll,
      minPieces: settings.minPieces,
      maxResults: settings.maxResults,
      timeLimitMs: 6000,
      seed: Math.floor(Math.random() * 2 ** 31),
      room: settings.roomEnabled ? { width: settings.roomWidthCm * 10, height: settings.roomHeightCm * 10 } : undefined,
    };
    setStatus({ kind: 'running' });
    worker.onmessage = (e: MessageEvent<SearchResult>) => {
      setStatus({ kind: 'done', result: e.data });
      setActive(0);
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

  const totalPieces = PIECE_ORDER.reduce((s, id) => s + inventory[id], 0);
  const result = status.kind === 'done' ? status.result : null;
  const layout: GeneratedLayout | undefined = result?.layouts[active];
  const set = (patch: Partial<GeneratorSettings>) => onSettings({ ...settings, ...patch });

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card className="p-4">
          <SectionTitle hint={<button className="text-carrera-amber" onClick={onEditInventory}>Bestand ändern</button>}>
            Bestand · {totalPieces} Teile
          </SectionTitle>
          <div className="flex flex-wrap gap-2">
            {PIECE_ORDER.filter((id) => inventory[id] > 0).map((id) => (
              <span key={id} className="rounded-lg bg-ink-800 px-2.5 py-1.5 text-xs text-zinc-300 ring-1 ring-white/5">
                <b className="text-white tabular-nums">{inventory[id]}×</b> {PIECES[id].name}
              </span>
            ))}
          </div>
        </Card>

        <Card className="space-y-1 p-4">
          <SectionTitle>Optionen</SectionTitle>
          <Toggle label="Alle Teile verbauen" checked={settings.useAll} onChange={(useAll) => set({ useAll })} />
          {!settings.useAll && (
            <div className="flex min-h-11 items-center justify-between text-sm text-zinc-200">
              <span>Mindestens Teile</span>
              <Stepper label="Mindestanzahl Teile" value={settings.minPieces} min={3} max={60} onChange={(minPieces) => set({ minPieces })} />
            </div>
          )}
          <div className="flex min-h-11 items-center justify-between text-sm text-zinc-200">
            <span>Varianten anzeigen</span>
            <Stepper label="Anzahl Varianten" value={settings.maxResults} min={1} max={40} onChange={(maxResults) => set({ maxResults })} />
          </div>
          <Toggle label="Platz begrenzen" checked={settings.roomEnabled} onChange={(roomEnabled) => set({ roomEnabled })} />
          {settings.roomEnabled && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {(['roomWidthCm', 'roomHeightCm'] as const).map((k) => (
                <label key={k} className="text-xs text-zinc-400">
                  {k === 'roomWidthCm' ? 'Breite (cm)' : 'Tiefe (cm)'}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={50}
                    max={2000}
                    value={settings[k]}
                    onChange={(e) => set({ [k]: Math.max(50, Math.min(2000, Number(e.target.value) || 0)) })}
                    className="mt-1 w-full rounded-lg bg-ink-800 px-3 py-2.5 text-base text-white ring-1 ring-white/10 focus:outline-none focus:ring-carrera-red"
                  />
                </label>
              ))}
            </div>
          )}
        </Card>

        {status.kind === 'running' ? (
          <Button variant="ghost" className="w-full" onClick={cancel}>
            <Spinner /> Suche läuft … abbrechen
          </Button>
        ) : (
          <Button variant="primary" className="h-14 w-full text-base" onClick={run} disabled={totalPieces === 0}>
            {result ? 'Neue Strecken generieren' : 'Strecken generieren'}
          </Button>
        )}

        {result && <SearchSummary result={result} />}
      </div>

      <div className="min-w-0 space-y-4">
        {!result && status.kind !== 'running' && (
          <Card className="grid min-h-[300px] place-items-center p-8 text-center">
            <div className="max-w-sm space-y-2">
              <div className="text-lg font-semibold">Bereit</div>
              <p className="text-sm text-zinc-400">
                Der Generator sucht mit Backtracking alle geschlossenen Rundkurse, die mit deinem Bestand baubar sind –
                jedes Ergebnis ist geometrisch geprüft: Anschlüsse, Winkel, Fahrtrichtung und Überschneidungen.
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

        {result && !layout && <NoResult result={result} />}

        {result && layout && (
          <>
            <LayoutDetail
              layout={layout}
              inventory={inventory}
              index={active}
              total={result.layouts.length}
              saved={savedKeys.has(layout.key)}
              onPrev={() => setActive((a) => (a - 1 + result.layouts.length) % result.layouts.length)}
              onNext={() => setActive((a) => (a + 1) % result.layouts.length)}
              onEdit={() => onOpenInEditor(layout.sequence, layout.rotation, `Generiert #${active + 1}`)}
              onSave={() => {
                onSave(layout.sequence, layout.rotation, `Rundkurs ${m(layout.length)} · ${layout.sequence.length} Teile`);
                setSavedKeys(new Set(savedKeys).add(layout.key));
              }}
            />
            {result.layouts.length > 1 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {result.layouts.map((l, i) => (
                  <button
                    key={l.key}
                    onClick={() => setActive(i)}
                    className={`aspect-[4/3] rounded-xl bg-ink-850 p-1.5 ring-1 transition ${i === active ? 'ring-2 ring-carrera-red' : 'ring-white/[.06] hover:ring-white/20'}`}
                    aria-label={`Variante ${i + 1}`}
                  >
                    <TrackSvg sequence={l.sequence} rotation={l.rotation} compact />
                  </button>
                ))}
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
}) {
  const { layout, inventory } = props;
  // Independent re-check of the generated track with the full validator.
  const check = validate(layout.sequence, inventory);
  const used = countPieces(layout.sequence);
  return (
    <Card className="overflow-hidden">
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
        <TrackSvg sequence={layout.sequence} rotation={layout.rotation} autoHeight className="max-h-[65vh]" />
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-white/5 px-4 py-3">
        <Stat label="Länge" value={m(layout.length)} />
        <Stat label="Fläche" value={size(layout.width, layout.height)} />
        <Stat label="Teile" value={layout.sequence.length} />
      </div>
      <div className={`mx-4 mb-3 rounded-lg px-3 py-2 text-xs ${check.valid ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
        {check.valid
          ? `Geprüft: geschlossen (Abweichung ${num(check.gap, 3)} mm, Drehung ${check.totalTurnDeg}°), keine Überschneidung, Bestand eingehalten.`
          : `Prüfung fehlgeschlagen: ${check.issues.map((i) => i.message).join(' ')}`}
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3 text-xs text-zinc-400">
        {PIECE_ORDER.filter((id) => used[id] > 0).map((id) => (
          <span key={id} className="rounded-md bg-ink-800 px-2 py-1">
            {used[id]}× {PIECES[id].name}
            {used[id] < inventory[id] && <span className="text-zinc-500"> (von {inventory[id]})</span>}
          </span>
        ))}
      </div>
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
          {props.saved ? 'Gespeichert ✓' : 'Speichern'}
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
            <span>Zu groß für den Platz</span>
            <span className="text-right text-zinc-200">{result.rejectedByRoom}</span>
          </>
        )}
        <span>Dauer</span>
        <span className="text-right text-zinc-200">{num(result.elapsedMs / 1000, 2)} s</span>
        <span>Suchraum</span>
        <span className="text-right text-zinc-200">{result.exhaustive ? 'vollständig' : 'Zeitlimit erreicht'}</span>
      </div>
    </Card>
  );
}

function NoResult({ result }: { result: SearchResult }) {
  return (
    <Card className="space-y-2 border-l-4 border-carrera-amber p-5">
      <div className="text-base font-semibold text-white">
        {result.exhaustive ? 'Kein gültiger Rundkurs möglich' : 'Kein Rundkurs gefunden (Zeitlimit)'}
      </div>
      <p className="text-sm text-zinc-300">
        {result.impossibleReason ??
          (result.exhaustive
            ? result.rejectedByRoom > 0
              ? `Es gibt zwar ${result.rejectedByRoom} geschlossene Formen, aber keine passt auf die angegebene Fläche.`
              : 'Der komplette Suchraum wurde durchsucht: Mit diesen Teilen lässt sich kein geschlossener, überschneidungsfreier Rundkurs bauen.'
            : 'Die Suche wurde nach 6 Sekunden abgebrochen, ohne einen Rundkurs zu finden. Das beweist nicht, dass keiner existiert. Versuche es erneut, schalte „Alle Teile verbauen“ aus oder reduziere den Bestand.')}
      </p>
      <p className="text-xs text-zinc-500">Es wird keine ungültige Strecke angezeigt.</p>
    </Card>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-hidden="true" />;
}
