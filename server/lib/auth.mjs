// Anonymous accounts: the server creates a random id (UUID, also used as
// Apple appAccountToken) and a secret token. Only a SHA-256 hash of the
// secret is stored. The app sends "Bearer <id>.<secret>".
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const hash = (s) => createHash('sha256').update(s).digest();

export function createAccount(db) {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  db.insert({ id, tokenHash: hash(token).toString('hex'), createdAt: Date.now() });
  return { id, token };
}

export function authenticate(db, header) {
  const m = /^Bearer ([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,})$/.exec(header || '');
  if (!m) return null;
  const user = db.get(m[1]);
  if (!user) return null;
  const a = Buffer.from(user.tokenHash, 'hex');
  const b = hash(m[2]);
  return a.length === b.length && timingSafeEqual(a, b) ? user : null;
}
