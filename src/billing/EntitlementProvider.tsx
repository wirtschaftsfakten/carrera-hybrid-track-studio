import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { KEYS, read, write } from '../lib/storage';
import {
  billingConfigured,
  createAccount,
  fetchEntitlement,
  getServerConfig,
  openStripePortal,
  startStripeCheckout,
  verifyAppleTransaction,
  type Account,
  type ServerConfig,
} from './api';
import { recordGeneration, tierFromClaims, today, type DailyUsage, type EntitlementClaims } from './entitlements';
import { isNativeIOS, Store, type StoreProduct } from './native';
import { PRICES, type BillingPeriod, type Tier } from './plans';
import { configuredPublicJwk, importPublicKey, verifyEntitlementToken } from './token';

interface EntitlementState {
  tier: Tier;
  claims: EntitlementClaims | null;
  usage: DailyUsage;
  /** What can actually be bought on this platform right now. */
  channel: 'stripe' | 'apple' | 'none';
  /** Why buying is not possible (shown instead of a fake button). */
  unavailableReason: string | null;
  appleProducts: StoreProduct[];
  busy: boolean;
  error: string | null;
  countGeneration: () => void;
  buy: (period: BillingPeriod) => Promise<void>;
  restore: () => Promise<void>;
  manage: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Development builds only: simulate Pro locally. Not present in production. */
  devSetPro?: (on: boolean) => void;
}

const Ctx = createContext<EntitlementState | null>(null);

export function useEntitlement(): EntitlementState {
  const v = useContext(Ctx);
  if (!v) throw new Error('EntitlementProvider fehlt');
  return v;
}

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(() => read<Account>(KEYS.account) ?? null);
  const [token, setToken] = useState<string | null>(() => read<string>(KEYS.entitlement) ?? null);
  const [claims, setClaims] = useState<EntitlementClaims | null>(null);
  const [usage, setUsage] = useState<DailyUsage>(() => read<DailyUsage>(KEYS.usage) ?? { day: today(), generations: 0 });
  const [server, setServer] = useState<ServerConfig | null>(null);
  const [appleProducts, setAppleProducts] = useState<StoreProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devPro, setDevPro] = useState(false);

  useEffect(() => {
    write(KEYS.usage, usage);
  }, [usage]);
  useEffect(() => {
    write(KEYS.account, account ?? undefined);
  }, [account]);
  useEffect(() => {
    write(KEYS.entitlement, token ?? undefined);
  }, [token]);

  // Verify the stored token offline (signature + expiry).
  useEffect(() => {
    let cancelled = false;
    const jwk = configuredPublicJwk();
    if (!token || !jwk) {
      setClaims(null);
      return;
    }
    importPublicKey(jwk)
      .then((key) => verifyEntitlementToken(token, key))
      .then((c) => !cancelled && setClaims(c))
      .catch(() => !cancelled && setClaims(null));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const ensureAccount = useCallback(async (): Promise<Account> => {
    if (account) return account;
    const a = await createAccount();
    setAccount(a);
    return a;
  }, [account]);

  const refresh = useCallback(async () => {
    if (!billingConfigured() || !account || !navigator.onLine) return;
    try {
      const { token: t } = await fetchEntitlement(account);
      setToken(t);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [account]);

  // Server config, Apple products, entitlement refresh, Stripe return.
  useEffect(() => {
    if (!billingConfigured()) return;
    getServerConfig()
      .then(setServer)
      .catch(() => setServer(null));
    void refresh();
    const params = new URLSearchParams(location.search);
    if (params.get('checkout') === 'success') {
      history.replaceState(null, '', location.pathname);
      // the webhook may arrive a moment after the redirect
      let n = 0;
      const t = setInterval(() => {
        void refresh();
        if (++n >= 5) clearInterval(t);
      }, 2000);
      return () => clearInterval(t);
    }
  }, [refresh]);

  useEffect(() => {
    if (!isNativeIOS()) return;
    Store.getProducts({ ids: [PRICES.monthly.appleProductId, PRICES.yearly.appleProductId] })
      .then((r) => setAppleProducts(r.products))
      .catch(() => setAppleProducts([]));
  }, []);

  const channel: EntitlementState['channel'] = isNativeIOS()
    ? server?.apple && appleProducts.length
      ? 'apple'
      : 'none'
    : server?.stripe
      ? 'stripe'
      : 'none';

  const unavailableReason =
    channel !== 'none'
      ? null
      : !billingConfigured()
        ? 'Zahlungen sind in dieser Version noch nicht eingerichtet (kein Zahlungsserver konfiguriert).'
        : !configuredPublicJwk()
          ? 'Zahlungen sind noch nicht eingerichtet (Prüfschlüssel fehlt).'
          : isNativeIOS()
            ? 'Die Abos sind im App Store noch nicht verfügbar.'
            : 'Der Zahlungsserver ist nicht erreichbar oder Stripe ist nicht eingerichtet.';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const buy = (period: BillingPeriod) =>
    run(async () => {
      const a = await ensureAccount();
      if (channel === 'stripe') {
        const { url } = await startStripeCheckout(a, period, location.origin + location.pathname);
        location.href = url;
      } else if (channel === 'apple') {
        const r = await Store.purchase({ id: PRICES[period].appleProductId, appAccountToken: a.id });
        if (r.status === 'purchased' && r.signedTransaction) {
          const { token: t } = await verifyAppleTransaction(a, r.signedTransaction);
          setToken(t);
        } else if (r.status === 'pending') {
          setError('Der Kauf wartet auf Bestätigung (z. B. Familienfreigabe).');
        }
      } else throw new Error(unavailableReason ?? 'Nicht verfügbar');
    });

  const restore = () =>
    run(async () => {
      const a = await ensureAccount();
      if (isNativeIOS()) {
        const { signedTransactions } = await Store.restore();
        if (!signedTransactions.length) throw new Error('Keine aktiven Käufe für diese Apple-ID gefunden.');
        let last: string | null = null;
        for (const jws of signedTransactions) {
          try {
            last = (await verifyAppleTransaction(a, jws)).token;
          } catch {
            // expired or for another product: try the next one
          }
        }
        if (!last) throw new Error('Kein gültiges Abo gefunden.');
        setToken(last);
      } else {
        const { token: t } = await fetchEntitlement(a);
        setToken(t);
      }
    });

  const manage = () =>
    run(async () => {
      if (isNativeIOS()) await Store.manageSubscriptions();
      else {
        const a = await ensureAccount();
        const { url } = await openStripePortal(a, location.origin + location.pathname);
        location.href = url;
      }
    });

  const realTier = tierFromClaims(claims, account?.id ?? null);
  const tier: Tier = import.meta.env.DEV && devPro ? 'pro' : realTier;

  const value = useMemo<EntitlementState>(
    () => ({
      tier,
      claims,
      usage,
      channel,
      unavailableReason,
      appleProducts,
      busy,
      error,
      countGeneration: () => setUsage((u) => recordGeneration(u)),
      buy,
      restore,
      manage,
      refresh,
      devSetPro: import.meta.env.DEV ? setDevPro : undefined,
    }),
    [tier, claims, usage, channel, unavailableReason, appleProducts, busy, error, account, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
