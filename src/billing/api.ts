/**
 * Client for the billing server (server/). The base URL comes from
 * VITE_API_BASE; without it every payment function reports "not set up"
 * instead of pretending to work.
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
export const billingConfigured = (): boolean => API_BASE.length > 0;

export interface Account {
  id: string;
  /** Secret bearer token, only stored on the device. */
  token: string;
}

export interface ServerConfig {
  stripe: boolean;
  apple: boolean;
}

async function call<T>(path: string, init: RequestInit & { account?: Account } = {}): Promise<T> {
  if (!billingConfigured()) throw new Error('Zahlungsserver ist nicht eingerichtet.');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.account) headers.Authorization = `Bearer ${init.account.id}.${init.account.token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Serverfehler ${res.status}`);
  return body as T;
}

export const getServerConfig = () => call<ServerConfig>('/api/config');
export const createAccount = () => call<Account>('/api/account', { method: 'POST', body: '{}' });
export const fetchEntitlement = (account: Account) => call<{ token: string }>('/api/entitlement', { account });
export const startStripeCheckout = (account: Account, period: 'monthly' | 'yearly', returnUrl: string) =>
  call<{ url: string }>('/api/stripe/checkout', { method: 'POST', account, body: JSON.stringify({ period, returnUrl }) });
export const openStripePortal = (account: Account, returnUrl: string) =>
  call<{ url: string }>('/api/stripe/portal', { method: 'POST', account, body: JSON.stringify({ returnUrl }) });
export const verifyAppleTransaction = (account: Account, signedTransaction: string) =>
  call<{ token: string }>('/api/apple/verify', { method: 'POST', account, body: JSON.stringify({ signedTransaction }) });
