import { PIECE_ORDER, PIECES, type Inventory, type PieceId } from '../geometry/catalog';
import { countPieces } from '../geometry/layout';
import { m, size } from '../lib/format';

/** Table: pieces used in the track and pieces left in the inventory. */
export function PartsUsage({ used, inventory }: { used: Inventory; inventory: Inventory }) {
  const rows = PIECE_ORDER.filter((id) => used[id] > 0 || inventory[id] > 0);
  return (
    <div className="px-4 pb-3">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-1 text-left font-medium">Teil</th>
            <th className="py-1 text-right font-medium">verbaut</th>
            <th className="py-1 text-right font-medium">übrig</th>
          </tr>
        </thead>
        <tbody className="text-zinc-300">
          {rows.map((id) => {
            const rest = inventory[id] - used[id];
            return (
              <tr key={id} className="border-t border-white/5">
                <td className="py-1">{PIECES[id].name}</td>
                <td className="py-1 text-right font-semibold text-white">{used[id]}</td>
                <td className={`py-1 text-right ${rest < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{rest}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Text lines for the PDF export. */
export function planLines(sequence: PieceId[], length: number, width: number, height: number, inventory: Inventory): string[] {
  const used = countPieces(sequence);
  const lines = [`Länge: ${m(length)}`, `Platzbedarf: ${size(width, height)}`, `Teile: ${sequence.length}`, '', 'Verwendete Teile:'];
  for (const id of PIECE_ORDER) if (used[id]) lines.push(`  ${used[id]}x ${PIECES[id].name} (übrig: ${Math.max(0, inventory[id] - used[id])})`);
  lines.push('', 'Bauanleitung in Fahrtrichtung:');
  const steps = sequence.map((id, i) => `${i + 1}. ${PIECES[id].short}`);
  for (let i = 0; i < steps.length; i += 6) lines.push(`  ${steps.slice(i, i + 6).join('  ')}`);
  return lines;
}
