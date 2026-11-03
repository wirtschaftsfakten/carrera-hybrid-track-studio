// Start: npm run server (reads server/.env if present)
import { createServer } from 'node:http';
import { createApp } from './app.mjs';
import { appleEnabled, config, stripeEnabled } from './config.mjs';
import { openDb } from './lib/db.mjs';

const db = openDb(config.dataFile);
const app = createApp({ db, config, stripeEnabled, appleEnabled });
createServer(app).listen(config.port, () => {
  console.log(`Billing-API auf http://localhost:${config.port}`);
  console.log(`Stripe: ${stripeEnabled() ? 'aktiv' : 'nicht eingerichtet'} · Apple: ${appleEnabled() ? 'aktiv' : 'nicht eingerichtet'}`);
  if (!config.entitlementPrivateKey) console.log('Hinweis: Kein Signaturschlüssel – npm run server:keys ausführen.');
});
