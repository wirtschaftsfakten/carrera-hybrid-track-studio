// Server configuration from environment variables (see server/.env.example).
// Nothing is enabled unless its credentials are present.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const env = process.env;
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const file = (p) => {
  try {
    return p ? readFileSync(p) : null;
  } catch {
    return null;
  }
};

export const config = {
  port: Number(env.PORT || 8787),
  dataFile: env.DATA_FILE || fileURLToPath(new URL('./data/db.json', import.meta.url)),
  allowedOrigins: list(env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173,capacitor://localhost'),
  /** PEM, ECDSA P-256 private key for entitlement tokens (npm run server:keys). */
  entitlementPrivateKey: env.ENTITLEMENT_PRIVATE_KEY_PEM || file(env.ENTITLEMENT_PRIVATE_KEY_FILE)?.toString('utf8') || null,
  /** Grace period after a paid period ends (renewal delays), seconds. */
  graceSeconds: Number(env.GRACE_SECONDS || 3 * 24 * 3600),
  /** Max lifetime of a token before the app must refresh (offline use). */
  tokenMaxAgeSeconds: Number(env.TOKEN_MAX_AGE_SECONDS || 14 * 24 * 3600),
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || null,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || null,
    priceMonthly: env.STRIPE_PRICE_MONTHLY || null,
    priceYearly: env.STRIPE_PRICE_YEARLY || null,
  },
  apple: {
    bundleId: env.APPLE_BUNDLE_ID || null,
    productIds: list(env.APPLE_PRODUCT_IDS || 'trackstudio.pro.monthly,trackstudio.pro.yearly'),
    /** DER file of "Apple Root CA - G3" from https://www.apple.com/certificateauthority/ */
    rootCert: file(env.APPLE_ROOT_CA_G3_FILE),
    /** 'Production', 'Sandbox' or both (comma separated). */
    environments: list(env.APPLE_ENVIRONMENTS || 'Production,Sandbox'),
  },
};

export const stripeEnabled = () =>
  !!(config.stripe.secretKey && config.stripe.webhookSecret && config.stripe.priceMonthly && config.stripe.priceYearly && config.entitlementPrivateKey);
export const appleEnabled = () => !!(config.apple.bundleId && config.apple.rootCert && config.entitlementPrivateKey);
