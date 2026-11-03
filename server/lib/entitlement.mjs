// Pro status is derived only from server-side records written by verified
// Stripe webhooks or verified Apple transactions, never from client input.
import { createPrivateKey, sign } from 'node:crypto';

export function activeUntil(user, nowSec) {
  let until = 0;
  const s = user.stripe;
  if (s && ['active', 'trialing', 'past_due'].includes(s.status) && s.periodEnd) until = Math.max(until, s.periodEnd);
  const a = user.apple;
  if (a && !a.revoked && a.expiresAt) until = Math.max(until, a.expiresAt);
  return until > nowSec ? until : 0;
}

export function computeClaims(user, cfg, nowSec = Math.floor(Date.now() / 1000)) {
  const until = activeUntil(user, nowSec);
  const pro = until > 0;
  const src = !pro ? 'none' : user.apple?.expiresAt === until ? 'apple' : 'stripe';
  return {
    sub: user.id,
    tier: pro ? 'pro' : 'free',
    src,
    iat: nowSec,
    exp: pro ? Math.min(until + cfg.graceSeconds, nowSec + cfg.tokenMaxAgeSeconds) : nowSec + cfg.tokenMaxAgeSeconds,
    periodEnd: pro ? until : undefined,
  };
}

/** base64url(JSON) "." base64url(ECDSA P-256 SHA-256 signature, raw r||s) */
export function signClaims(claims, privateKeyPem) {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const key = createPrivateKey(privateKeyPem);
  const sig = sign('sha256', Buffer.from(body), { key, dsaEncoding: 'ieee-p1363' });
  return `${body}.${sig.toString('base64url')}`;
}
