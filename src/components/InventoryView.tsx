import { DEFAULT_INVENTORY, PIECE_ORDER, PIECES, SOURCES, totalPieces, UNVERIFIED_PIECES, type Inventory } from '../geometry/catalog';
import { Button, Card, PieceGlyph, SectionTitle, Stepper } from './ui';

interface Props {
  inventory: Inventory;
  onChange: (inv: Inventory) => void;
}


export function InventoryView({ inventory, onChange }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <SectionTitle hint={<button className="text-carrera-amber" onClick={() => onChange({ ...DEFAULT_INVENTORY })}>Grundset</button>}>
          Mein Streckenbestand · {totalPieces(inventory)}
        </SectionTitle>
        <p className="mb-2 text-xs text-zinc-500">
          Trage ein, wie viele Teile du besitzt. Das ist nur der verfügbare Vorrat: Der Generator nutzt so viele davon, wie für eine gute Strecke
          sinnvoll ist.
        </p>
        <ul className="divide-y divide-white/5">
          {PIECE_ORDER.map((id) => (
            <li key={id} className="flex items-center gap-3 py-3">
              <PieceGlyph id={id} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  {PIECES[id].name} <span className="text-xs font-normal text-zinc-500">({PIECES[id].letter})</span>
                  {PIECES[id].verified && (
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300" title={`Quellen: ${PIECES[id].sources.map((n) => n + 1).join(', ')}`}>
                      geprüft
                    </span>
                  )}
                </div>
                <div className="text-xs leading-snug text-zinc-500">{PIECES[id].note}</div>
              </div>
              <Stepper
                label={PIECES[id].name}
                value={inventory[id]}
                max={id === 'startFinish' ? 1 : 99}
                onChange={(n) => onChange({ ...inventory, [id]: n })}
              />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          Grundset „Speedway to Hell“: 4 Geraden, 1 Start-/Zielgerade, 8 Rechts- und 2 Linkskurven (R1 60°). Pro Strecke ist genau eine
          Start-/Zielgerade erlaubt.
        </p>
      </Card>

      <div className="space-y-4">
        <Card className="p-4 text-sm leading-relaxed text-zinc-300">
          <SectionTitle>So rechnet die App</SectionTitle>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Fahrbahnbreite 250 mm. Die Teile liegen auf einem Sechseck-Raster mit 250 mm Kantenlänge: Eine Gerade (250·√3 = 433,0 mm) quert
              ein Sechseck, eine 60°-Kurve (Mitte 375 mm) führt exakt zur übernächsten Sechseckseite.
            </li>
            <li>
              Jedes Teil hat eine feste Fahrtrichtung (blauer Rand links, roter Rand rechts). Teile werden nur Ausgang → Eingang verbunden; eine
              Rechtskurve kann nie als Linkskurve dienen.
            </li>
            <li>
              Ein Rundkurs gilt nur als geschlossen, wenn das Ende auf ≤ 0,5 mm an den Start anschließt und die Richtung exakt ±360° gedreht hat.
            </li>
            <li>Überschneidungen werden mit der vollen Fahrbahnfläche geprüft (Toleranz 3 mm für bloßes Berühren).</li>
          </ul>
        </Card>

        <Card className="p-4 text-sm text-zinc-300">
          <SectionTitle>Nicht verifizierte Teile</SectionTitle>
          <ul className="space-y-2">
            {UNVERIFIED_PIECES.map((p) => (
              <li key={p.name}>
                <div className="font-semibold text-zinc-200">
                  {p.name} <span className="text-xs font-normal text-zinc-500">({p.letter})</span>
                </div>
                <div className="text-xs text-zinc-500">{p.reason}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4 text-xs text-zinc-400">
          <SectionTitle>Quellen</SectionTitle>
          <ol className="list-decimal space-y-1.5 pl-4">
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a className="text-zinc-300 underline decoration-white/20 underline-offset-2 hover:text-white" href={s.url} target="_blank" rel="noreferrer">
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
          <Button variant="subtle" className="mt-2 -ml-3" onClick={() => onChange({ ...DEFAULT_INVENTORY })}>
            Bestand auf Grundset zurücksetzen
          </Button>
        </Card>
      </div>
    </div>
  );
}
