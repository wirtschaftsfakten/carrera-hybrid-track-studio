import { type Inventory } from '../geometry/catalog';
import { validate } from '../geometry/layout';
import { m, size } from '../lib/format';
import type { SavedTrack } from '../lib/storage';
import { TrackSvg } from './TrackSvg';
import { Button, Card } from './ui';

interface Props {
  tracks: SavedTrack[];
  inventory: Inventory;
  onOpen: (t: SavedTrack) => void;
  onDelete: (id: string) => void;
}

export function SavedView({ tracks, inventory, onOpen, onDelete }: Props) {
  if (!tracks.length) {
    return (
      <Card className="grid min-h-[260px] place-items-center p-8 text-center">
        <div className="max-w-xs space-y-2">
          <div className="text-lg font-semibold">Noch keine Strecken gespeichert</div>
          <p className="text-sm text-zinc-400">Generierte oder im Editor gebaute Strecken landen hier – gespeichert nur auf diesem Gerät.</p>
        </div>
      </Card>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tracks.map((t) => {
        const v = validate(t.sequence, inventory);
        const geometricallyValid = !v.issues.some((i) => i.code !== 'inventoryExceeded');
        return (
          <Card key={t.id} className="overflow-hidden">
            <button className="block aspect-[4/3] w-full bg-ink-900 p-2" onClick={() => onOpen(t)} aria-label={`${t.name} öffnen`}>
              <TrackSvg sequence={t.sequence} rotation={t.rotation} compact />
            </button>
            <div className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{t.name || 'Ohne Namen'}</div>
                  <div className="text-xs tabular-nums text-zinc-500">
                    {t.sequence.length} Teile · {m(v.length)} · {size(v.bounds.width, v.bounds.height)}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    v.valid
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : geometricallyValid
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-red-500/15 text-red-300'
                  }`}
                >
                  {v.valid ? 'gültig' : geometricallyValid ? 'Bestand fehlt' : 'Entwurf'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => onOpen(t)}>Bearbeiten</Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm(`„${t.name || 'Strecke'}“ löschen?`)) onDelete(t.id);
                  }}
                >
                  Löschen
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
