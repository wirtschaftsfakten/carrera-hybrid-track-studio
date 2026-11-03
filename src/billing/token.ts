import type { EntitlementClaims } from './entitlements';

/**
 * Signed entitlement token: base64url(JSON claims) "." base64url(signature).
 * Signature: ECDSA P-256 / SHA-256 (raw r||s), made by the server with its
 * private key. The app only holds the public key, so editing localStorage
 * cannot turn "free" into "pro"; a token is only accepted when the
 * signature, the account id and the expiry match.
 */

const b64urlToBytes = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}

export async function verifyEntitlementToken(token: string, key: CryptoKey): Promise<EntitlementClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      b64urlToBytes(parts[1]),
      new TextEncoder().encode(parts[0]),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]))) as EntitlementClaims;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
    return claims;
  } catch {
    return null;
  }
}

/** Public key from the build config (VITE_ENTITLEMENT_PUBLIC_JWK), or null if not set up. */
export function configuredPublicJwk(): JsonWebKey | null {
  const raw = import.meta.env.VITE_ENTITLEMENT_PUBLIC_JWK;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JsonWebKey;
  } catch {
    return null;
  }
}
