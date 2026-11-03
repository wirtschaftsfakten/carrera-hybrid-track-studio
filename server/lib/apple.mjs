// Verification of StoreKit 2 signed transactions (JWS, ES256, x5c chain)
// and App Store Server Notifications V2, following Apple's documented
// procedure: the chain must end in Apple Root CA - G3 (configured file), the
// leaf must carry the App Store receipt-signing OID and the intermediate the
// Apple WWDR OID, and the JWS signature must verify with the leaf key.
import { verify, X509Certificate } from 'node:crypto';

// DER encodings of the OID TLVs
const OID_LEAF = Buffer.from('060a2a864886f76364060b01', 'hex'); // 1.2.840.113635.100.6.11.1
const OID_INTERMEDIATE = Buffer.from('060a2a864886f76364060201', 'hex'); // 1.2.840.113635.100.6.2.1

const b64urlJson = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

export function verifyAppleJws(jws, rootCertDer, now = new Date()) {
  if (!rootCertDer) throw new Error('Apple Root CA nicht konfiguriert');
  const parts = String(jws).split('.');
  if (parts.length !== 3) throw new Error('Ungültiges JWS');
  const header = b64urlJson(parts[0]);
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) throw new Error('Unerwarteter JWS-Header');
  const [leaf, intermediate, root] = header.x5c.map((c) => new X509Certificate(Buffer.from(c, 'base64')));
  const trusted = new X509Certificate(rootCertDer);
  if (root.fingerprint256 !== trusted.fingerprint256) throw new Error('Zertifikatskette endet nicht bei Apple Root CA - G3');
  if (!leaf.verify(intermediate.publicKey) || !intermediate.verify(root.publicKey)) throw new Error('Zertifikatskette ungültig');
  for (const c of [leaf, intermediate, root]) {
    if (now < new Date(c.validFrom) || now > new Date(c.validTo)) throw new Error('Zertifikat abgelaufen');
  }
  if (!leaf.raw.includes(OID_LEAF) || !intermediate.raw.includes(OID_INTERMEDIATE)) throw new Error('Zertifikat nicht von Apple für App-Store-Belege');
  const ok = verify(
    'sha256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(parts[2], 'base64url'),
  );
  if (!ok) throw new Error('Signatur ungültig');
  return b64urlJson(parts[1]);
}

/** Checks a decoded JWSTransactionDecodedPayload against the app's configuration. */
export function transactionRecord(tx, cfg) {
  if (tx.bundleId !== cfg.bundleId) throw new Error('Falsche App (bundleId)');
  if (!cfg.productIds.includes(tx.productId)) throw new Error('Unbekanntes Produkt');
  if (cfg.environments.length && !cfg.environments.includes(tx.environment)) throw new Error('Umgebung nicht erlaubt');
  if (tx.type && tx.type !== 'Auto-Renewable Subscription') throw new Error('Kein Abo');
  return {
    originalTransactionId: String(tx.originalTransactionId),
    productId: tx.productId,
    expiresAt: tx.expiresDate ? Math.floor(tx.expiresDate / 1000) : 0,
    revoked: !!tx.revocationDate,
    environment: tx.environment,
    appAccountToken: tx.appAccountToken || null,
  };
}

/**
 * Stores a verified transaction on `userId`. An Apple subscription belongs to
 * the Apple ID, so "restore" on a new device moves it to the current account.
 */
export function assignAppleRecord(db, userId, rec) {
  const previous = db.find((u) => u.id !== userId && u.apple?.originalTransactionId === rec.originalTransactionId);
  if (previous) db.update(previous.id, { apple: null });
  return db.update(userId, { apple: rec });
}

/** App Store Server Notification V2 → updates the owning user. */
export function applyAppleNotification(db, signedPayload, cfg, verifyJws = (j) => verifyAppleJws(j, cfg.rootCert)) {
  const n = verifyJws(signedPayload);
  const info = n.data?.signedTransactionInfo;
  if (!info) return null;
  if (n.data.bundleId && n.data.bundleId !== cfg.bundleId) throw new Error('Falsche App (bundleId)');
  const rec = transactionRecord(verifyJws(info), cfg);
  if (['REFUND', 'REVOKE'].includes(n.notificationType)) rec.revoked = true;
  const user =
    db.find((u) => u.apple?.originalTransactionId === rec.originalTransactionId) || (rec.appAccountToken && db.get(rec.appAccountToken));
  if (!user) return null;
  db.update(user.id, { apple: rec });
  return user.id;
}
