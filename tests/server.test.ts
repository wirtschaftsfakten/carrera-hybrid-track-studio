import { createHmac, generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.mjs';
import { verifyAppleJws } from '../server/lib/apple.mjs';
import { openDb } from '../server/lib/db.mjs';
import { verifyStripeSignature } from '../server/lib/stripe.mjs';

const WEBHOOK_SECRET = 'whsec_test';
const BUNDLE = 'app.trackstudio.test';
const now = () => Math.floor(Date.now() / 1000);
const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const config = {
  allowedOrigins: ['https://app.example'],
  entitlementPrivateKey: pem,
  graceSeconds: 0,
  tokenMaxAgeSeconds: 3600,
  stripe: { secretKey: 'sk_test', webhookSecret: WEBHOOK_SECRET, priceMonthly: 'price_m', priceYearly: 'price_y' },
  apple: { bundleId: BUNDLE, productIds: ['trackstudio.pro.monthly'], rootCert: null, environments: ['Sandbox'] },
};

const subs: Record<string, unknown> = {};
let server: Server;
let base = '';

beforeAll(async () => {
  const app = createApp({
    db: openDb(null),
    config,
    stripeEnabled: () => false, // checkout itself needs the real Stripe API
    appleEnabled: () => true,
    fetchSubscription: async (id: string) => subs[id],
    // stand-in for the Apple chain check: the payload is the base64url JSON
    verifyJws: (jws: string) => JSON.parse(Buffer.from(jws, 'base64url').toString()),
  });
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const api = async (path: string, init: RequestInit & { auth?: { id: string; token: string } } = {}) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (init.auth) headers.Authorization = `Bearer ${init.auth.id}.${init.auth.token}`;
  const res = await fetch(base + path, { ...init, headers });
  return { status: res.status, body: await res.json(), headers: res.headers };
};
const tierOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).tier;
const signed = (payload: string, t = now()) => `t=${t},v1=${createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex')}`;
const webhook = (event: object, sig?: string) => {
  const raw = JSON.stringify(event);
  return api('/api/stripe/webhook', { method: 'POST', body: raw, headers: { 'Stripe-Signature': sig ?? signed(raw) } });
};

describe('Konto und Abo-Status', () => {
  it('ohne Anmeldung kein Status', async () => {
    expect((await api('/api/entitlement')).status).toBe(401);
    expect((await api('/api/entitlement', { auth: { id: '00000000-0000-0000-0000-000000000000', token: 'x'.repeat(43) } })).status).toBe(401);
  });

  it('neues Konto ist Free', async () => {
    const acc = (await api('/api/account', { method: 'POST', body: '{}' })).body;
    expect(acc.id).toMatch(/^[0-9a-f-]{36}$/);
    const { body } = await api('/api/entitlement', { auth: acc });
    expect(tierOf(body.token)).toBe('free');
  });

  it('CORS nur für erlaubte Herkunft', async () => {
    const ok = await api('/api/health', { headers: { Origin: 'https://app.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example');
    const bad = await api('/api/health', { headers: { Origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('Checkout ohne Stripe-Konfiguration meldet ehrlich 503', async () => {
    const acc = (await api('/api/account', { method: 'POST', body: '{}' })).body;
    const r = await api('/api/stripe/checkout', { method: 'POST', auth: acc, body: JSON.stringify({ period: 'monthly', returnUrl: 'https://app.example/' }) });
    expect(r.status).toBe(503);
  });
});

describe('Stripe-Webhooks', () => {
  it('Signaturprüfung: falsches Secret, alter Zeitstempel, manipulierter Inhalt', () => {
    const raw = '{"a":1}';
    expect(verifyStripeSignature(raw, signed(raw), WEBHOOK_SECRET)).toBe(true);
    expect(verifyStripeSignature(raw, signed(raw), 'whsec_other')).toBe(false);
    expect(verifyStripeSignature(raw, signed(raw, now() - 3600), WEBHOOK_SECRET)).toBe(false);
    expect(verifyStripeSignature('{"a":2}', signed(raw), WEBHOOK_SECRET)).toBe(false);
  });

  it('nicht signierter Webhook wird abgewiesen', async () => {
    expect((await webhook({ type: 'checkout.session.completed' }, 't=1,v1=00')).status).toBe(400);
  });

  it('Checkout abgeschlossen → Pro, Abo gelöscht → Free', async () => {
    const acc = (await api('/api/account', { method: 'POST', body: '{}' })).body;
    subs.sub_1 = { id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [{ current_period_end: now() + 3000, price: { id: 'price_m' } }] } };
    const done = await webhook({ type: 'checkout.session.completed', data: { object: { client_reference_id: acc.id, subscription: 'sub_1' } } });
    expect(done.status).toBe(200);
    expect(tierOf((await api('/api/entitlement', { auth: acc })).body.token)).toBe('pro');

    await webhook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled' } } });
    expect(tierOf((await api('/api/entitlement', { auth: acc })).body.token)).toBe('free');
  });
});

describe('Apple-Käufe', () => {
  const tx = (p: object) =>
    Buffer.from(
      JSON.stringify({
        bundleId: BUNDLE,
        productId: 'trackstudio.pro.monthly',
        environment: 'Sandbox',
        type: 'Auto-Renewable Subscription',
        originalTransactionId: '1000',
        expiresDate: Date.now() + 3600_000,
        ...p,
      }),
    ).toString('base64url');

  it('gültige Transaktion → Pro', async () => {
    const acc = (await api('/api/account', { method: 'POST', body: '{}' })).body;
    const r = await api('/api/apple/verify', { method: 'POST', auth: acc, body: JSON.stringify({ signedTransaction: tx({}) }) });
    expect(r.status).toBe(200);
    expect(tierOf(r.body.token)).toBe('pro');
  });

  it('falsche App, abgelaufen oder widerrufen → abgelehnt', async () => {
    const acc = (await api('/api/account', { method: 'POST', body: '{}' })).body;
    for (const p of [{ bundleId: 'other.app' }, { expiresDate: Date.now() - 1000 }, { revocationDate: Date.now() }, { productId: 'x' }]) {
      const r = await api('/api/apple/verify', { method: 'POST', auth: acc, body: JSON.stringify({ signedTransaction: tx(p) }) });
      expect(r.status).toBe(400);
    }
  });

  it('Wiederherstellen auf neuem Gerät verschiebt das Abo auf das neue Konto', async () => {
    const a = (await api('/api/account', { method: 'POST', body: '{}' })).body;
    const b = (await api('/api/account', { method: 'POST', body: '{}' })).body;
    const t = tx({ originalTransactionId: '2000' });
    await api('/api/apple/verify', { method: 'POST', auth: a, body: JSON.stringify({ signedTransaction: t }) });
    await api('/api/apple/verify', { method: 'POST', auth: b, body: JSON.stringify({ signedTransaction: t }) });
    expect(tierOf((await api('/api/entitlement', { auth: b })).body.token)).toBe('pro');
    expect(tierOf((await api('/api/entitlement', { auth: a })).body.token)).toBe('free');
  });

  it('echte Kettenprüfung lehnt nicht von Apple signierte Daten ab', () => {
    expect(() => verifyAppleJws('a.b.c', null)).toThrow(/Root CA/);
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', x5c: ['AA', 'BB'] })).toString('base64url');
    expect(() => verifyAppleJws(`${header}.e30.sig`, Buffer.from('x'))).toThrow(/JWS-Header/);
  });
});
