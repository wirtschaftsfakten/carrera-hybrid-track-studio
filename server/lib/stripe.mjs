// Stripe Checkout + Billing without the SDK: REST calls with fetch and
// webhook signature verification as documented by Stripe
// (header "Stripe-Signature: t=<ts>,v1=<hmac>", HMAC-SHA256 over "<ts>.<raw body>").
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.stripe.com/v1';

export function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const parts = {};
  const v1 = [];
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=');
    if (k === 't') parts.t = v;
    if (k === 'v1' && v) v1.push(v);
  }
  const ts = Number(parts.t);
  if (!ts || !v1.length || Math.abs(nowSec - ts) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest();
  return v1.some((sig) => {
    const b = Buffer.from(sig, 'hex');
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
}

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripeRequest(secretKey, method, path, params) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : form(params || {}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `Stripe ${res.status}`);
  return body;
}

export async function createCheckoutSession(cfg, user, period, returnUrl) {
  const price = period === 'yearly' ? cfg.priceYearly : cfg.priceMonthly;
  return stripeRequest(cfg.secretKey, 'POST', '/checkout/sessions', {
    mode: 'subscription',
    line_items: { 0: { price, quantity: 1 } },
    success_url: `${returnUrl}?checkout=success`,
    cancel_url: `${returnUrl}?checkout=cancel`,
    client_reference_id: user.id,
    customer: user.stripe?.customerId,
    subscription_data: { metadata: { userId: user.id } },
    metadata: { userId: user.id },
    allow_promotion_codes: 'true',
  });
}

export const createPortalSession = (cfg, user, returnUrl) =>
  stripeRequest(cfg.secretKey, 'POST', '/billing_portal/sessions', { customer: user.stripe.customerId, return_url: returnUrl });

/** current_period_end moved to the subscription items in newer API versions. */
export function periodEndOf(sub) {
  return sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
}

export function subscriptionRecord(sub) {
  return {
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    subscriptionId: sub.id,
    status: sub.status,
    periodEnd: periodEndOf(sub),
    priceId: sub.items?.data?.[0]?.price?.id ?? null,
  };
}

/**
 * Applies a verified webhook event to the user records. Returns the id of
 * the updated user or null. `fetchSubscription` is injected for testing.
 */
export async function applyStripeEvent(db, event, fetchSubscription) {
  const obj = event.data?.object ?? {};
  if (event.type === 'checkout.session.completed') {
    const userId = obj.client_reference_id || obj.metadata?.userId;
    if (!userId || !db.get(userId) || !obj.subscription) return null;
    const sub = await fetchSubscription(typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id);
    db.update(userId, { stripe: subscriptionRecord(sub) });
    return userId;
  }
  if (event.type.startsWith('customer.subscription.')) {
    const rec = subscriptionRecord(obj);
    const user =
      (obj.metadata?.userId && db.get(obj.metadata.userId)) ||
      db.find((u) => u.stripe?.subscriptionId === obj.id || (rec.customerId && u.stripe?.customerId === rec.customerId));
    if (!user) return null;
    if (event.type === 'customer.subscription.deleted') rec.status = 'canceled';
    db.update(user.id, { stripe: rec });
    return user.id;
  }
  return null;
}
