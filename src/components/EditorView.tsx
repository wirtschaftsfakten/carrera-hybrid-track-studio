import { useMemo, useState } from 'react';
import { PIECE_ORDER, PIECES, type Inventory, type PieceId } from '../geometry/catalog';
import { countPieces, validate } from '../geometry/layout';
import { m, num, size } from '../lib/format';
import type { EditorState } from '../lib/storage';
import { TrackSvg } from './TrackSvg';
import { Button, Card, PieceGlyph, SectionTitle, Stat } from './ui';

interface Props {
  state: EditorState;
  inventory: Inventory;
  onChange: (s: EditorState) => void;
  onSave: (s: EditorState) => void;
}

export function EditorView({ state, inventory, onChange, onSave }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const { sequence } = state;
  const v = useMemo(() => validate(sequence, inventory), [sequence, inventory]);
  const used = countPieces(sequence);
  const faulty = useMemo(() => new Set(v.overlaps.flat()), [v.overlaps]);
  const sel = selected !== null && selected < sequence.length ? selected : null;

  const setSeq = (next: PieceId[], nextSel: number | null) => {
    onChange({ ...state, sequence: next });
    setSelected(nextSel);
  };

  const add = (id: PieceId) => {
    const at = sel === null ? sequence.length : sel + 1;
    const next = [...sequence];
    next.splice(at, 0, id);
    setSeq(next, sel === null ? null : at);
  };
  const replace = (id: PieceId) => {
    if (sel === null) return;
    const next = [...sequence];
    next[sel] = id;
    setSeq(next, sel);
  };
  const remove = () => {
    if (sel === null) {
      setSeq(sequence.slice(0, -1), null);
      return;
    }
    const next = sequence.filter((_, i) => i !== sel);
    setSeq(next, next.length ? Math.min(sel, next.length - 1) : null);
  };
  /** Rotate the cyclic order so the selected piece becomes piece 1 (same shape). */
  const makeFirst = () => {
    if (sel === null) return;
    setSeq([...sequence.slice(sel), ...sequence.slice(0, sel)], 0);
  };

  const status = !sequence.length
    ? { tone: 'neutral', text: 'Leere Strecke – füge das erste Teil hinzu.' }
    : v.valid
      ? { tone: 'ok', text: `Gültiger Rundkurs: geschlossen (Abweichung ${num(v.gap, 3)} mm, Drehung ${v.totalTurnDeg}°), keine Überschneidung.` }
      : { tone: 'bad', text: v.closed ? 'Geschlossen, aber nicht gültig:' : 'Noch kein gültiger Rundkurs:' };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-3">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
            <input
              value={state.name}
              placeholder="Name der Strecke"
              onChange={(e) => onChange({ ...state, name: e.target.value })}
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-base font-semibold text-white placeholder:text-zinc-600 focus:outline-none"
            />
            <Button variant="subtle" className="px-3" aria-label="Ansicht um 30° drehen" onClick={() => onChange({ ...state, rotation: (state.rotation + 1) % 12 })}>
              ⟳ 30°
            </Button>
          </div>
          <div className="grid min-h-[260px] place-items-center bg-ink-900 p-2">
            <TrackSvg
              autoHeight
              className="max-h-[65vh]"
              sequence={sequence}
              rotation={state.rotation}
              selected={sel}
              onSelect={(i) => setSelected(i === sel ? null : i)}
              faulty={faulty}
              showOpenEnd={!v.closed}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-white/5 px-4 py-3">
            <Stat label="Länge" value={m(v.length)} />
            <Stat label="Fläche" value={sequence.length ? size(v.bounds.width, v.bounds.height) : '–'} />
            <Stat label="Teile" value={sequence.length} />
          </div>
        </Card>

        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            status.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : status.tone === 'bad' ? 'bg-red-500/10 text-red-200' : 'bg-ink-850 text-zinc-400'
          }`}
          role="status"
        >
          <div>{status.text}</div>
          {status.tone === 'bad' && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-red-300/90">
              {v.issues.map((i, k) => (
                <li key={k}>{i.message}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <SectionTitle hint={sel === null ? 'wird am Ende angehängt' : `nach Teil ${sel + 1}`}>Teil hinzufügen</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {PIECE_ORDER.map((id) => {
              const left = inventory[id] - used[id];
              return (
                <button
                  key={id}
                  onClick={() => add(id)}
                  className="flex min-h-14 items-center gap-2 rounded-xl bg-ink-800 px-2.5 text-left ring-1 ring-white/5 transition hover:bg-ink-700 active:scale-[.98]"
                >
                  <PieceGlyph id={id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-zinc-100">{PIECES[id].name}</span>
                    <span className={`block text-[11px] tabular-nums ${left < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                      {left < 0 ? `${-left} zu viel` : `${left} übrig`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle hint={sel === null ? 'Teil im Plan antippen' : PIECES[sequence[sel]].name}>
            {sel === null ? 'Auswahl' : `Teil ${sel + 1}`}
          </SectionTitle>
          {sel !== null && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {PIECE_ORDER.filter((id) => id !== sequence[sel]).map((id) => (
                <button
                  key={id}
                  onClick={() => replace(id)}
                  title={`Ersetzen durch ${PIECES[id].name}`}
                  className="flex min-h-11 flex-col items-center justify-center rounded-lg bg-ink-800 py-1 text-[10px] text-zinc-400 ring-1 ring-white/5 hover:bg-ink-700"
                >
                  <PieceGlyph id={id} size={22} />
                  ⇄ {PIECES[id].short}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="danger" onClick={remove} disabled={!sequence.length}>
              {sel === null ? 'Letztes löschen' : 'Teil löschen'}
            </Button>
            <Button onClick={makeFirst} disabled={sel === null || sel === 0}>
              Als Teil 1
            </Button>
            <Button onClick={() => setSelected(null)} disabled={sel === null}>
              Auswahl aufheben
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (sequence.length && confirm('Strecke wirklich leeren?')) setSeq([], null);
              }}
              disabled={!sequence.length}
            >
              Alles leeren
            </Button>
          </div>
        </Card>

        <Button variant="primary" className="h-14 w-full text-base" disabled={!sequence.length} onClick={() => onSave(state)}>
          {state.savedId ? 'Änderungen speichern' : 'Strecke speichern'}
        </Button>
        {!v.valid && sequence.length > 0 && (
          <p className="text-center text-xs text-zinc-500">Ungültige Strecken werden als Entwurf gespeichert und so markiert.</p>
        )}
      </div>
    </div>
  );
}
