// HTTP API for accounts, entitlements, Stripe and Apple. Plain node:http,
// no framework. The track generator itself never talks to this server.
import { authenticate, createAccount } from './lib/auth.mjs';
import { assignAppleRecord, applyAppleNotification, transactionRecord, verifyAppleJws } from './lib/apple.mjs';
import { computeClaims, signClaims } from './lib/entitlement.mjs';
import { applyStripeEvent, createCheckoutSession, createPortalSession, stripeRequest, verifyStripeSignature } from './lib/stripe.mjs';

const MAX_BODY = 256 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Anfrage zu groß'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const fail = (status, message) => Object.assign(new Error(message), { status });

/**
 * deps: { db, config, stripeEnabled(), appleEnabled(),
 *         fetchSubscription?(id), verifyJws?(jws) } (the last two for tests)
 */
export function createApp(deps) {
  const { db, config } = deps;
  const fetchSubscription = deps.fetchSubscription ?? ((id) => stripeRequest(config.stripe.secretKey, 'GET', `/subscriptions/${id}`));
  const verifyJws = deps.verifyJws ?? ((jws) => verifyAppleJws(jws, config.apple.rootCert));
  const tokenFor = (user) => signClaims(computeClaims(db.get(user.id), config), config.entitlementPrivateKey);

  // Stripe redirects only back to known app origins
  const allowedReturn = (url) => {
    try {
      const u = new URL(url);
      return config.allowedOrigins.includes(u.origin) ? `${u.origin}${u.pathname}` : null;
    } catch {
      return null;
    }
  };

  return async function handle(req, res) {
    const origin = req.headers.origin;
    const cors = origin && config.allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...cors,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '600',
      });
      return res.end();
    }

    const url = new URL(req.url, 'http://local');
    try {
      const raw = req.method === 'POST' ? await readBody(req) : '';
      const json = () => {
        try {
          return raw ? JSON.parse(raw) : {};
        } catch {
          throw fail(400, 'Ungültiges JSON');
        }
      };
      const user = () => {
        const u = authenticate(db, req.headers.authorization);
        if (!u) throw fail(401, 'Nicht angemeldet');
        return u;
      };
      const needKey = () => {
        if (!config.entitlementPrivateKey) throw fail(503, 'Signaturschlüssel fehlt auf dem Server');
      };

      switch (`${req.method} ${url.pathname}`) {
        case 'GET /api/health':
          return send(200, { ok: true });
        case 'GET /api/config':
          return send(200, { stripe: deps.stripeEnabled(), apple: deps.appleEnabled() });
        case 'POST /api/account':
          return send(201, createAccount(db));
        case 'GET /api/entitlement':
          needKey();
          return send(200, { token: tokenFor(user()) });
        case 'POST /api/stripe/checkout': {
          if (!deps.stripeEnabled()) throw fail(503, 'Stripe ist nicht eingerichtet');
          const u = user();
          const { period, returnUrl } = json();
          const ret = allowedReturn(returnUrl);
          if (!['monthly', 'yearly'].includes(period) || !ret) throw fail(400, 'Ungültige Anfrage');
          const session = await createCheckoutSession(config.stripe, u, period, ret);
          return send(200, { url: session.url });
        }
        case 'POST /api/stripe/portal': {
          if (!deps.stripeEnabled()) throw fail(503, 'Stripe ist nicht eingerichtet');
          const u = user();
          const ret = allowedReturn(json().returnUrl);
          if (!u.stripe?.customerId || !ret) throw fail(400, 'Kein Stripe-Abo für dieses Konto');
          const session = await createPortalSession(config.stripe, u, ret);
          return send(200, { url: session.url });
        }
        case 'POST /api/stripe/webhook': {
          if (!verifyStripeSignature(raw, req.headers['stripe-signature'], config.stripe.webhookSecret)) throw fail(400, 'Signatur ungültig');
          await applyStripeEvent(db, JSON.parse(raw), fetchSubscription);
          return send(200, { received: true });
        }
        case 'POST /api/apple/verify': {
          if (!deps.appleEnabled()) throw fail(503, 'Apple-Käufe sind nicht eingerichtet');
          const u = user();
          let rec;
          try {
            rec = transactionRecord(verifyJws(String(json().signedTransaction || '')), config.apple);
          } catch (e) {
            throw fail(400, e.message);
          }
          if (rec.revoked) throw fail(400, 'Kauf wurde widerrufen');
          if (rec.expiresAt * 1000 < Date.now()) throw fail(400, 'Abo abgelaufen');
          assignAppleRecord(db, u.id, rec);
          return send(200, { token: tokenFor(u) });
        }
        case 'POST /api/apple/notifications': {
          if (!deps.appleEnabled()) throw fail(503, 'Apple-Käufe sind nicht eingerichtet');
          try {
            applyAppleNotification(db, String(json().signedPayload || ''), config.apple, verifyJws);
          } catch (e) {
            throw fail(400, e.message);
          }
          return send(200, { received: true });
        }
        default:
          throw fail(404, 'Nicht gefunden');
      }
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      return send(status, { error: status === 500 ? 'Interner Fehler' : e.message });
    }
  };
}
