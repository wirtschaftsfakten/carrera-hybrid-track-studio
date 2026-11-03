// Generates the ECDSA P-256 key pair for entitlement tokens.
//   private key -> server (ENTITLEMENT_PRIVATE_KEY_FILE), keep secret
//   public JWK  -> app build (VITE_ENTITLEMENT_PUBLIC_JWK)
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../data/', import.meta.url);
mkdirSync(dir, { recursive: true });
const keyFile = new URL('entitlement-private.pem', dir);
if (existsSync(keyFile)) {
  console.error('server/data/entitlement-private.pem existiert bereits – nicht überschrieben.');
  process.exit(1);
}
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
const jwk = publicKey.export({ format: 'jwk' });
console.log('Privater Schlüssel: server/data/entitlement-private.pem');
console.log('In die .env der App eintragen:');
console.log(`VITE_ENTITLEMENT_PUBLIC_JWK=${JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y })}`);
