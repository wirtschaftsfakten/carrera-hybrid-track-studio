import { useState } from 'react';
import { useEntitlement } from '../billing/EntitlementProvider';
import { limitsFor } from '../billing/entitlements';
import { type Inventory } from '../geometry/catalog';
import { validate } from '../geometry/layout';
import { m, size } from '../lib/format';
import type { SavedTrack } from '../lib/storage';
import { TrackSvg } from './TrackSvg';
import { Button, Card, Segmented } from './ui';

interface Props {
  tracks: SavedTrack[];
  inventory: Inventory;
  onOpen: (t: SavedTrack) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function SavedView({ tracks, inventory, onOpen, onDelete, onToggleFavorite }: Props) {
  const { tier } = useEntitlement();
  const [filter, setFilter] = useState<'all' | 'fav'>('all');
  const limit = limitsFor(tier).maxSavedTracks;

  if (!tracks.length) {
    return (
      <Card className="grid min-h-[260px] place-items-center p-8 text-center">
        <div className="max-w-xs space-y-2">
          <div className="text-lg font-semibold">Noch keine Strecken gespeichert</div>
          <p className="text-sm text-zinc-400">Generierte oder im Editor gebaute Strecken landen hier. Sie werden nur auf diesem Gerät gespeichert.</p>
        </div>
      </Card>
    );
  }
  const list = [...tracks]
    .filter((t) => filter === 'all' || t.favorite)
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || b.createdAt - a.createdAt);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-60">
          <Segmented
            label="Filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `Alle (${tracks.length})` },
              { value: 'fav', label: `★ Favoriten (${tracks.filter((t) => t.favorite).length})` },
            ]}
          />
        </div>
        {Number.isFinite(limit) && (
          <span className="text-xs text-zinc-500">
            {tracks.length} von {limit} Speicherplätzen (Free)
          </span>
        )}
      </div>
      {!list.length && <p className="py-6 text-center text-sm text-zinc-500">Noch keine Favoriten. Tippe auf ☆, um eine Strecke zu markieren.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((t) => {
          const v = validate(t.sequence, inventory);
          const geometricallyValid = !v.issues.some((i) => i.code !== 'inventoryExceeded');
          return (
            <Card key={t.id} className="animate-rise overflow-hidden">
              <div className="relative">
                <button className="block aspect-[4/3] w-full bg-ink-900 p-2" onClick={() => onOpen(t)} aria-label={`${t.name} öffnen`}>
                  <TrackSvg sequence={t.sequence} rotation={t.rotation} compact />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(t.id)}
                  aria-pressed={!!t.favorite}
                  aria-label={t.favorite ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
                  className={`absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-ink-950/70 text-xl backdrop-blur ${
                    t.favorite ? 'text-carrera-amber' : 'text-zinc-400'
                  }`}
                >
                  {t.favorite ? '★' : '☆'}
                </button>
              </div>
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
                      v.valid ? 'bg-emerald-500/15 text-emerald-300' : geometricallyValid ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'
                    }`}
                  >
                    {v.valid ? 'gültig' : geometricallyValid ? 'Bestand fehlt' : 'Entwurf'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => onOpen(t)}>Laden</Button>
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
    </div>
  );
}
