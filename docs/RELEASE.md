# Release: Zahlungen, iOS und offene Punkte

Stand: Code und Tests sind fertig. Die folgenden Schritte brauchen Zugangsdaten, einen Mac oder eine rechtliche Entscheidung und sind deshalb **noch nicht erledigt**. Bis sie erledigt sind, zeigt die App „Zahlungen noch nicht eingerichtet“ und verkauft nichts.

## 1. Abo-Server (`server/`)

1. Hosting wählen, das Node ≥ 22.9 ausführt und HTTPS hat (z. B. Render, Fly.io, Railway, eigener VPS). `server/data/` braucht dauerhaften Speicher (JSON-Datei). Bei mehreren Instanzen oder mehr Nutzern die Datei in `server/lib/db.mjs` durch eine echte Datenbank ersetzen.
2. `npm run server:keys` → `server/data/entitlement-private.pem` (geheim halten) und die Zeile `VITE_ENTITLEMENT_PUBLIC_JWK=…` für die App.
3. `server/.env.example` nach `server/.env` kopieren und ausfüllen. `ALLOWED_ORIGINS` = Web-Domain(s) + `capacitor://localhost`.
4. Start: `npm run server`. Prüfen: `GET /api/health`, `GET /api/config`.

## 2. Stripe (Website und PWA)

1. Stripe-Konto mit Firmendaten, Steuern (Stripe Tax oder eigene Einstellung für 19 % MwSt.) und Auszahlungskonto.
2. Produkt „Pro“ mit zwei wiederkehrenden Preisen anlegen: 0,99 € monatlich und 5,99 € jährlich → Preis-IDs in `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`.
3. Kundenportal aktivieren (Kündigen, Zahlungsmethode ändern).
4. Webhook-Endpunkt `https://<server>/api/stripe/webhook` mit den Ereignissen `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` und `customer.subscription.deleted` → Signing Secret in `STRIPE_WEBHOOK_SECRET`.
5. Erst im Testmodus (`sk_test_…`) mit Testkarten durchspielen, dann Live-Schlüssel.

## 3. App-Build für Web/PWA

`.env.example` nach `.env` kopieren: `VITE_API_BASE`, `VITE_ENTITLEMENT_PUBLIC_JWK`, `VITE_TERMS_URL`, `VITE_PRIVACY_URL`. Danach `npm run build` und `dist/` deployen. Das GitHub-Pages-Deployment (`.github/workflows/deploy.yml`) braucht diese Werte als Repository-Variablen, wenn Zahlungen dort aktiv sein sollen.

## 4. Apple App Store (iOS)

Voraussetzungen: Mac mit Xcode 16+, Apple Developer Program (99 €/Jahr), App Store Connect.

1. **Bundle-ID** festlegen. Derzeit steht der Platzhalter `app.trackstudio.hybrid` in `capacitor.config.ts` und im Xcode-Projekt. Er muss überall gleich sein, auch in `APPLE_BUNDLE_ID` auf dem Server.
2. In App Store Connect die App anlegen, eine **Abo-Gruppe** „Pro“ mit zwei automatisch verlängerbaren Abos erstellen: `trackstudio.pro.monthly` (0,99 €) und `trackstudio.pro.yearly` (5,99 €). Andere IDs → `VITE_APPLE_PRODUCT_MONTHLY/YEARLY` und `APPLE_PRODUCT_IDS` anpassen.
3. **App Store Server Notifications V2**: URL `https://<server>/api/apple/notifications` (Production und Sandbox).
4. `AppleRootCA-G3.cer` von https://www.apple.com/certificateauthority/ laden und als `APPLE_ROOT_CA_G3_FILE` hinterlegen.
5. Auf dem Mac:
   ```bash
   npm install
   npm run cap:sync
   npm run cap:open
   ```
   In Xcode: Team wählen (Signing & Capabilities), Capability **In-App Purchase** hinzufügen, auf echtem Gerät testen (Sandbox-Tester aus App Store Connect).
6. Optional für lokale Tests ohne App Store Connect: In Xcode eine StoreKit-Konfigurationsdatei anlegen (File → New → StoreKit Configuration File) und im Scheme auswählen. Die Server-Prüfung lehnt solche lokalen Käufe ab, weil sie nicht von Apple signiert sind.
7. Product → Archive → Distribute → App Store Connect → **TestFlight**.

### Apple-Richtlinien, die der Code schon berücksichtigt

- Digitale Abos in der iOS-App laufen nur über In-App-Kauf; in der iOS-App gibt es keine Stripe-Links (3.1.1).
- Button „Käufe wiederherstellen“ vorhanden (3.1.1).
- Preis, Laufzeit, automatische Verlängerung und Kündigungshinweis stehen auf der Kaufseite (3.1.2). Links zu Nutzungsbedingungen und Datenschutz werden über `VITE_TERMS_URL` / `VITE_PRIVACY_URL` eingebunden.
- Abo-Verwaltung öffnet das System-Blatt von Apple.
- Kernfunktion ohne Konto nutzbar; das Konto ist anonym (5.1.1).
- `ITSAppUsesNonExemptEncryption = false` (nur Standard-HTTPS).

### Noch zu liefern

- Nutzungsbedingungen (EULA) und Datenschutzerklärung als Webseiten (Pflicht für Abos und App-Store-Eintrag).
- App-Store-Eintrag: Screenshots (6,9″ und 6,5″ iPhone), Beschreibung, Altersfreigabe, Datenschutz-Angaben („Data not collected“ passt, solange nur die anonyme Konto-ID gespeichert wird).
- Eigenes App-Branding für den Verkauf: Der Name „Hybrid Track Studio“ und das Hexagon-Logo sind eigenständig. Ob „Carrera HYBRID“ in der Beschreibung als Kompatibilitätsangabe zulässig ist, sollte rechtlich geprüft werden.

## 5. Streckenteile

Verifiziert sind Gerade, Start/Ziel, R1-Kurve 60° und R2-Kurve 30° (Quellen in `src/geometry/catalog.ts`). Haarnadel 180° und Schikane sind ohne belastbare Maße und daher gesperrt. Neue Teile: siehe README, „Neues Streckenteil hinzufügen“.

## 6. Was nur auf diesem PC geprüft wurde

- `npm test`, `npm run build` (TypeScript + Vite) und `npx cap sync ios` laufen unter Windows.
- Das iOS-Projekt wurde unter Windows erzeugt. Kompiliert ist es erst, wenn Xcode es auf einem Mac gebaut hat. `StorePlugin.swift` ist daher noch ungetestet.
- Echte Zahlungen (Stripe und Apple) sind nicht getestet, weil die Zugangsdaten fehlen. Die Server-Logik ist mit simulierten, signierten Webhooks und Transaktionen getestet.
