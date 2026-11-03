import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canGenerate,
  canSaveTrack,
  effectiveSettings,
  generationsLeft,
  hasFeature,
  recordGeneration,
  tierFromClaims,
  type EntitlementClaims,
} from '../src/billing/entitlements';
import { LIMITS, PRICES } from '../src/billing/plans';
import { importPublicKey, verifyEntitlementToken } from '../src/billing/token';
import { DEFAULT_SETTINGS } from '../src/lib/storage';
// server side of the token (same format, other implementation)
import { computeClaims, signClaims } from '../server/lib/entitlement.mjs';

describe('Free/Pro-Konfiguration', () => {
  it('Preise und Limits sind zentral hinterlegt', () => {
    expect(PRICES.monthly.amountCents).toBe(99);
    expect(PRICES.yearly.amountCents).toBe(599);
    expect(LIMITS.free.generationsPerDay).toBe(3);
    expect(LIMITS.pro.generationsPerDay).toBe(Infinity);
  });
});

describe('Berechtigungslogik', () => {
  const day = '2026-11-03';

  it('Free: 3 Generierungen pro Tag, danach gesperrt', () => {
    let u = { day, generations: 0 };
    for (let i = 0; i < 3; i++) {
      expect(canGenerate('free', u, day)).toBe(true);
      u = recordGeneration(u, day);
    }
    expect(generationsLeft('free', u, day)).toBe(0);
    expect(canGenerate('free', u, day)).toBe(false);
    expect(canGenerate('pro', u, day)).toBe(true);
  });

  it('Zähler beginnt am nächsten Tag neu', () => {
    const u = { day, generations: 3 };
    expect(generationsLeft('free', u, '2026-11-04')).toBe(3);
    expect(recordGeneration(u, '2026-11-04')).toEqual({ day: '2026-11-04', generations: 1 });
  });

  it('Speicherplätze: Free begrenzt, Pro unbegrenzt', () => {
    expect(canSaveTrack('free', LIMITS.free.maxSavedTracks - 1)).toBe(true);
    expect(canSaveTrack('free', LIMITS.free.maxSavedTracks)).toBe(false);
    expect(canSaveTrack('pro', 10_000)).toBe(true);
  });

  it('Export nur mit Pro', () => {
    expect(hasFeature('free', 'exportPng')).toBe(false);
    expect(hasFeature('free', 'exportPdf')).toBe(false);
    expect(hasFeature('pro', 'exportPdf')).toBe(true);
  });

  it('gesperrte Generator-Einstellungen fallen bei Free zurück', () => {
    const s = { ...DEFAULT_SETTINGS, mode: 'max' as const, style: 'fast' as const, maxResults: 20, lengthEnabled: true };
    expect(effectiveSettings(s, 'free')).toMatchObject({ mode: 'auto', style: 'varied', maxResults: 3, lengthEnabled: false });
    expect(effectiveSettings(s, 'pro')).toMatchObject({ mode: 'max', style: 'fast', maxResults: 20, lengthEnabled: true });
  });

  it('Pro nur mit passender Konto-ID und gültigem Ablaufdatum', () => {
    const c: EntitlementClaims = { sub: 'u1', tier: 'pro', src: 'stripe', iat: 0, exp: 2000 };
    expect(tierFromClaims(c, 'u1', 1000)).toBe('pro');
    expect(tierFromClaims(c, 'u2', 1000)).toBe('free');
    expect(tierFromClaims(c, 'u1', 2001)).toBe('free');
    expect(tierFromClaims(null, 'u1', 1000)).toBe('free');
  });
});

describe('Signierter Abo-Status (Server signiert, App prüft)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const cfg = { graceSeconds: 100, tokenMaxAgeSeconds: 1000 };
  const now = Math.floor(Date.now() / 1000);

  it('gültiger Token wird akzeptiert', async () => {
    const user = { id: 'u1', stripe: { status: 'active', periodEnd: now + 500 } };
    const token = signClaims(computeClaims(user, cfg, now), pem);
    const claims = await verifyEntitlementToken(token, await importPublicKey(jwk));
    expect(claims).toMatchObject({ sub: 'u1', tier: 'pro', src: 'stripe', exp: now + 600 });
    expect(tierFromClaims(claims, 'u1')).toBe('pro');
  });

  it('manipulierter Token (free → pro) wird abgelehnt', async () => {
    const token = signClaims(computeClaims({ id: 'u1' }, cfg, now), pem);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), tier: 'pro' })).toString('base64url');
    expect(await verifyEntitlementToken(`${forged}.${sig}`, await importPublicKey(jwk))).toBeNull();
    expect(await verifyEntitlementToken('kaputt', await importPublicKey(jwk))).toBeNull();
  });

  it('Token mit fremdem Schlüssel wird abgelehnt', async () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const token = signClaims(computeClaims({ id: 'u1', apple: { expiresAt: now + 500 } }, cfg, now), other);
    expect(await verifyEntitlementToken(token, await importPublicKey(jwk))).toBeNull();
  });

  it('abgelaufenes, gekündigtes oder widerrufenes Abo ergibt Free', () => {
    expect(computeClaims({ id: 'u', stripe: { status: 'active', periodEnd: now - 1 } }, cfg, now).tier).toBe('free');
    expect(computeClaims({ id: 'u', stripe: { status: 'canceled', periodEnd: now + 500 } }, cfg, now).tier).toBe('free');
    expect(computeClaims({ id: 'u', apple: { expiresAt: now + 500, revoked: true } }, cfg, now).tier).toBe('free');
    expect(computeClaims({ id: 'u', apple: { expiresAt: now + 500 } }, cfg, now)).toMatchObject({ tier: 'pro', src: 'apple' });
  });

  it('Token läuft spätestens nach der Maximaldauer ab (Offline-Nutzung begrenzt)', () => {
    const c = computeClaims({ id: 'u', stripe: { status: 'active', periodEnd: now + 10 ** 7 } }, cfg, now);
    expect(c.exp).toBe(now + cfg.tokenMaxAgeSeconds);
  });
});
