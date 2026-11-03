import { useEntitlement } from '../billing/EntitlementProvider';
import { isNativeIOS } from '../billing/native';
import { FEATURE_ROWS, formatPrice, PRICES, type BillingPeriod } from '../billing/plans';
import { Button, Card, SectionTitle } from './ui';

const TERMS_URL = import.meta.env.VITE_TERMS_URL;
const PRIVACY_URL = import.meta.env.VITE_PRIVACY_URL;

export function ProView() {
  const e = useEntitlement();
  const ios = isNativeIOS();
  const canBuy = e.channel !== 'none' && !e.busy;
  const priceLabel = (p: BillingPeriod) =>
    e.appleProducts.find((x) => x.id === PRICES[p].appleProductId)?.displayPrice ?? formatPrice(PRICES[p]);
  const yearlySaving = Math.round((1 - PRICES.yearly.amountCents / (PRICES.monthly.amountCents * 12)) * 100);
  const until = e.claims?.periodEnd ? new Date(e.claims.periodEnd * 1000).toLocaleDateString('de-DE') : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-800 via-ink-850 to-ink-950 p-6 ring-1 ring-white/[.06]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-carrera-red/20 blur-3xl" />
        <div className="text-xs font-bold uppercase tracking-[.2em] text-carrera-red">Track Studio Pro</div>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Unbegrenzt Strecken bauen</h2>
        <p className="mt-2 max-w-lg text-sm text-zinc-400">
          Unbegrenzte Generierungen und Speicherplätze, alle Streckenstile, Maximal-Modus, Längenfilter sowie Export als PNG und PDF.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm ring-1 ring-white/10">
          Dein Status:
          <b className={e.tier === 'pro' ? 'text-carrera-red' : 'text-white'}>{e.tier === 'pro' ? 'Pro' : 'Free'}</b>
          {e.tier === 'pro' && until && <span className="text-zinc-400">· bezahlt bis {until}</span>}
        </div>
      </div>

      {e.tier === 'free' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(['monthly', 'yearly'] as const).map((p) => (
            <Card key={p} className={`relative p-5 ${p === 'yearly' ? 'ring-2 ring-carrera-red' : ''}`}>
              {p === 'yearly' && yearlySaving > 0 && (
                <span className="absolute right-4 top-4 rounded-full bg-carrera-red px-2 py-0.5 text-[11px] font-bold text-white">−{yearlySaving} %</span>
              )}
              <div className="text-sm font-semibold text-zinc-300">{p === 'monthly' ? 'Monatlich' : 'Jährlich'}</div>
              <div className="mt-1 text-3xl font-extrabold tabular-nums">{priceLabel(p)}</div>
              <div className="text-xs text-zinc-500">{p === 'monthly' ? 'pro Monat' : 'pro Jahr'}, verlängert sich automatisch, jederzeit kündbar</div>
              <Button variant={p === 'yearly' ? 'primary' : 'ghost'} className="mt-4 h-12 w-full" disabled={!canBuy} onClick={() => void e.buy(p)}>
                {e.busy ? 'Bitte warten …' : 'Pro abonnieren'}
              </Button>
            </Card>
          ))}
        </div>
      )}

      {e.unavailableReason && (
        <Card className="border-l-4 border-carrera-amber p-4 text-sm text-zinc-300">
          <b className="text-white">Kauf derzeit nicht möglich.</b> {e.unavailableReason}
        </Card>
      )}
      {e.error && (
        <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {e.error}
        </div>
      )}

      <Card className="p-4">
        <SectionTitle>Abo verwalten</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => void e.restore()} disabled={e.busy || e.channel === 'none'}>
            {ios ? 'Käufe wiederherstellen' : 'Status aktualisieren'}
          </Button>
          <Button onClick={() => void e.manage()} disabled={e.busy || e.tier !== 'pro' || !e.claims || e.claims.src === 'none'}>
            {ios ? 'Abo verwalten' : 'Abo verwalten / kündigen'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {ios
            ? 'Käufe laufen über deine Apple-ID. Kündigen kannst du jederzeit in den iPhone-Einstellungen unter Abonnements.'
            : 'Zahlungen laufen über Stripe. Kündigen kannst du jederzeit im Kundenportal; Pro bleibt bis zum Ende des bezahlten Zeitraums aktiv.'}
        </p>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 text-left font-semibold">Funktion</th>
              <th className="px-2 py-3 font-semibold">Free</th>
              <th className="px-4 py-3 font-semibold text-carrera-red">Pro</th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_ROWS.map((r) => (
              <tr key={r.label} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-2.5 text-zinc-300">{r.label}</td>
                <td className="px-2 py-2.5 text-center text-zinc-400">{cell(r.free)}</td>
                <td className="px-4 py-2.5 text-center font-semibold text-white">{cell(r.pro)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        Preise inkl. MwSt. Das Abo verlängert sich automatisch um den gewählten Zeitraum, wenn es nicht mindestens 24 Stunden vor Ablauf gekündigt
        wird. {ios ? 'Die Zahlung wird bei Kaufbestätigung deiner Apple-ID belastet. ' : ''}Der Streckengenerator funktioniert auch ohne Konto und
        offline.{' '}
        {TERMS_URL ? (
          <a className="underline" href={TERMS_URL} target="_blank" rel="noreferrer">
            Nutzungsbedingungen
          </a>
        ) : (
          <span>Nutzungsbedingungen: noch nicht hinterlegt.</span>
        )}{' '}
        ·{' '}
        {PRIVACY_URL ? (
          <a className="underline" href={PRIVACY_URL} target="_blank" rel="noreferrer">
            Datenschutz
          </a>
        ) : (
          <span>Datenschutzerklärung: noch nicht hinterlegt.</span>
        )}
      </p>

      {e.devSetPro && (
        <Card className="border border-dashed border-carrera-amber/40 p-4 text-xs text-zinc-400">
          <b className="text-carrera-amber">Nur in der Entwicklungsversion:</b> Pro lokal simulieren, um die Funktionen zu testen. In Produktions-Builds
          gibt es diesen Schalter nicht.
          <div className="mt-2 flex gap-2">
            <Button onClick={() => e.devSetPro?.(true)}>Pro simulieren</Button>
            <Button onClick={() => e.devSetPro?.(false)}>Zurück zu Free</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function cell(v: string | boolean) {
  if (v === true) return '✓';
  if (v === false) return '–';
  return v;
}
