# Hybrid Track Studio (für Carrera HYBRID)

Streckenplaner, der aus einem editierbaren Teilebestand **geometrisch geprüfte, baubare Carrera-HYBRID-Rundkurse** erzeugt. Eine Codebasis für Website, installierbare PWA und native iOS-App (Capacitor). Die Streckenberechnung läuft komplett lokal und offline; nur Konto und Abo brauchen Internet.

> „Carrera“ und „HYBRID“ sind Marken der Carrera Toys GmbH. Die App nutzt keine Carrera-Logos oder Produktbilder; Name und Branding stehen zentral in `src/config/brand.ts`.

## Starten

```bash
npm install
npm run dev          # Entwicklung (http://localhost:5173)
npm test             # Vitest: Geometrie, Generator-Modi, 60/100+ Teile, Speicher, Free/Pro, Server, PDF
npm run build        # Typecheck + Produktions-Build nach dist/
npm run preview      # Build lokal ansehen (Service Worker aktiv)
npm run icons        # Web-, iOS-App-Icon und Splashscreen neu rendern
npm run server:keys  # Signaturschlüssel für den Abo-Status erzeugen
npm run server       # Abo-/Zahlungs-API (server/), liest server/.env
npm run cap:sync     # Build + Kopie ins iOS-Projekt
npm run cap:open     # iOS-Projekt in Xcode öffnen (nur macOS)
```

**Aufs Handy (PWA):** `dist/` auf einen HTTPS-Host legen (GitHub Pages, Netlify …). iPhone: Teilen → „Zum Home-Bildschirm“; Android/Chrome: „App installieren“. Nach dem ersten Aufruf funktioniert der Generator offline (Web Worker + Service Worker).

## Funktionen

- **Generator** mit drei Modi. Der Bestand ist immer nur der verfügbare Vorrat, nie eine Pflichtmenge:
  - *Automatisch* (Standard): Der Generator wählt die Größe selbst (8 bis 32 Teile bzw. weniger, wenn der Bestand kleiner ist). Nicht benötigte Teile bleiben übrig.
  - *Benutzerdefiniert*: Mindest- und Höchstzahl der Teile per Doppel-Schieberegler, z. B. 15–30 von 60.
  - *Maximale Ausnutzung* (Pro): möglichst viele Teile, aber nur gültige Rundkurse (bei 60 Teilen typisch 50+).
  - Streckenstile: abwechslungsreich, schnell, kurvenreich, kompakt. Filter für Länge (cm) und Bodenfläche (B × T cm).
  - Jede Variante wird vor der Anzeige unabhängig validiert. Ohne Ergebnis zeigt die App den Grund und konkrete Vorschläge (Fläche vergrößern, Mindestzahl senken, Kurven ergänzen …).
- **Editor**: maßstabsgetreuer SVG-Plan mit Fahrbahnoptik (blauer/roter Rand, Start-/Ziellinie, Fahrtrichtungspfeile), Zoom (Pinch, Mausrad, Buttons, Doppeltipp) und Verschieben, Drehen in 30°-Schritten. Teile anhängen, einfügen, ersetzen, löschen. Live-Prüfung, Teileübersicht (verbaut / übrig), Länge, Platzbedarf, PNG-/PDF-Export.
- **Vergleich**: alle Varianten eines Durchlaufs als Karten mit Teilezahl, Länge und Maßen.
- **Strecken**: speichern, laden, Favoriten (★), Status „gültig“ / „Bestand fehlt“ / „Entwurf“.
- **Inventar**: Teilezahlen, Maße, geprüfte und nicht verifizierte Teile, Quellen.
- **Pro**: Preisseite, Upgrade-Dialoge, Kauf, Wiederherstellen, Abo verwalten.

## Free und Pro

Alle Preise, Limits und Funktionen stehen zentral in `src/billing/plans.ts` (die Regeln in `src/billing/entitlements.ts`).

| | Free | Pro (0,99 €/Monat · 5,99 €/Jahr) |
|---|---|---|
| Generierungen | 3 pro Tag | unbegrenzt |
| Gespeicherte Strecken | 5 | unbegrenzt |
| Modi | Automatisch, Benutzerdefiniert | + Maximale Ausnutzung |
| Stile, Längenfilter | – | ✓ |
| Varianten pro Durchlauf | 3 | bis 24 |
| PNG-/PDF-Export | – | ✓ |

### Sicherheitsarchitektur

- Der Pro-Status entsteht **nur auf dem Server** (`server/`): aus signaturgeprüften Stripe-Webhooks oder aus Apple-Transaktionen, deren Zertifikatskette bis „Apple Root CA – G3“ geprüft wurde.
- Der Server gibt einen **signierten Berechtigungs-Token** aus (ECDSA P-256). Die App enthält nur den öffentlichen Schlüssel und prüft Signatur, Konto-ID und Ablauf. Einen Wert im `localStorage` auf „pro“ zu ändern, bringt nichts.
- Tokens laufen nach spätestens 14 Tagen ab (Offline-Nutzung), danach holt die App einen neuen.
- Konten sind anonym: Der Server vergibt eine UUID und ein geheimes Token (gespeichert wird nur dessen Hash). Die UUID dient bei Apple als `appAccountToken`.
- Ehrliche Grenze: Die Pro-Funktionen laufen offline im Gerät. Wer den App-Code selbst verändert, kann lokale Sperren umgehen; das gilt für jede Offline-App. Auch der Tageszähler der Free-Version liegt lokal. Was der Server schützt, ist der Abo-Status selbst.
- Ohne konfigurierten Server zeigt die App „Zahlungen noch nicht eingerichtet“ statt eines Kauf-Buttons ohne Funktion. Den Schalter „Pro simulieren“ gibt es nur in `npm run dev`.

## Neues Streckenteil hinzufügen

1. In `src/geometry/catalog.ts` die `PieceId` erweitern und einen Eintrag in `PIECES` anlegen: Geometrie (`straight` mit Länge oder `arc` mit Mittelradius, Winkel in 30°-Schritten, Richtung), `entry`/`exit` (Anschlusstyp), `mirror` (Gegenstück links/rechts), `shapeCode`, optional `maxPerTrack`, `sources` (Index in `SOURCES`).
2. `verified: true` nur mit belastbarer Maßquelle. Nicht verifizierte Teile bleiben in `UNVERIFIED_PIECES` und werden weder generiert noch als gültig gewertet.
3. In `PIECE_ORDER` und `DEFAULT_INVENTORY` aufnehmen und einen Test in `tests/geometry.test.ts` ergänzen.
4. Winkel, die keine Vielfachen von 30° sind, brauchen eine feinere `HEADING_UNIT_DEG` (die Rechnung bleibt exakt ganzzahlig).

## Recherche: Geometrie der HYBRID-Teile

| Teil | Buchstabe | Geometrie im Modell | Beleg |
|---|---|---|---|
| Fahrbahnbreite | – | 250 mm | Carrera FAQ (25 × 43,3 cm), carrera-fun.com |
| Gerade, Start-/Zielgerade | B, A | 433,01 mm (= 250·√3) | Carrera FAQ: 43,3 cm; carrera-fun.com: 433 mm |
| Kurve R1 rechts / links | D / C | 60°, Mittelradius 375 mm (innen 250, außen 500) | Carrera FAQ: 37,5 cm in Fahrbahnmitte; carrera-fun.com: 60°, 250/500 mm |
| Kurve R2 rechts / links | H / G | 30°, Mittelradius 1125 mm (innen 1000, außen 1250) | carrera-fun.com; Carrera-Set 50052004 „Curves Radius 2 30°“ |

**Gegenproben, die der Code als Tests erfüllt**

- 4 Geraden + 1 Start/Ziel + 10 R1-Kurven = **609 cm** Streckenlänge – exakt die offizielle Angabe zum Set „Speedway to Hell“.
- Unter den generierten Layouts des Grundbestands ist eines mit **251 × 175 cm** Außenmaß – die offizielle Aufbaufläche des Sets.
- 8 Rechts- minus 2 Linkskurven à 60° = 360°: das Grundset schließt genau dann, wenn die Kurven 60° haben.

**Hexagon-Raster.** 433 mm ist die Schlüsselweite eines Sechsecks mit 250 mm Kantenlänge; eine 60°-Kurve mit Mittelradius 375 mm (= 1,5 × 250) führt exakt von einer Sechseckseite zur übernächsten. Deshalb rechnet die App mit 250·√3 statt gerundet 433 mm – sonst entstünde pro Gerade ein Rechenfehler von 0,013 mm, den es am echten Material nicht gibt. Zwei R2-Kurven ergeben eine 60°-Kurve im dreifachen Maßstab und liegen wieder auf dem Raster; eine einzelne R2-Kurve (30°) verlässt es, das Modell rechnet trotzdem exakt (Winkel in ganzzahligen 30°-Schritten, Positionen in Millimetern).

**Fahrtrichtung.** Laut Anleitung werden die Teile „immer in Fahrtrichtung zusammengesteckt (Pfeile auf den roten bzw. blauen Randstreifen)“, die Autos erkennen die Bahn nur in Pfeilrichtung. Blau = linker Rand, Rot = rechter Rand. Eine Rechtskurve ist nie als Linkskurve nutzbar. Im Modell wird jedes Teil mit seinem Eingang an den Ausgang des Vorgängers gesetzt; die Pfeile im Plan zeigen die Fahrtrichtung.

**Ungeklärt / nicht verwendet**

- *Haarnadelkurve 180° L/R (50052005)*: keine offiziellen Maße gefunden. Ein Community-Beitrag beschreibt sie als 60°- + 120°-Element – unbestätigt, daher **nicht im Generator**.
- *Schikane (I)*: als Teil gelistet, aber ohne Maße – **nicht im Generator**.
- Die Anleitung spricht davon, Teile „in einem 135° Winkel zueinanderstehend zusammenzustecken“. Das beschreibt den Steckvorgang (Teile schräg ansetzen und dann flach ablegen, „wie Parkett“), nicht die Geometrie der fertigen Strecke.
- Die genaue Lage der Start-/Ziellinie auf dem Teil ist nicht bemaßt; sie wird schematisch dargestellt.

Quellen:
- Carrera „Speedway to Hell“ (FAQ zu Gerade/Kurve/Streckenlänge/Fläche): https://carrera-toys.com/en-eu/products/50050001-speedway-to-hell
- carrera-fun.com, „CARRERA HYBRID: The track“: https://www.carrera-fun.com/?p=7909&lang=en
- Carrera HYBRID Bedienungsanleitung (V03-03): https://backend.carrera-revell-toys.com/var/assets/_default_upload_bucket/Carrera-Hybrid-Manual.pdf
- Carrera „Curves Radius 2 30°“: https://carrera-toys.com/en-eu/products/50052004-curves-radius-2-30-2x-l-2x-r
- Sturmkind Community, Hexagon-Raster: https://community.sturmkind.com/topic/6935-andere-kurvenradien-im-hexagon/

## Algorithmus

`src/generator/search.ts` – Tiefensuche mit Backtracking. Die Start-/Zielgerade liegt fest am Ursprung, jedes weitere Teil wird am Ausgang des Vorgängers angesetzt. Pruning:

1. **Drehung:** Mit den restlichen Kurven *und den noch freien Plätzen bis zur Höchstzahl* muss die Gesamtdrehung noch exakt ±360° erreichbar sein.
2. **Distanz:** Die restlichen Teile müssen den Start noch erreichen können (jedes Teil versetzt das Ende höchstens um seine Sehne).
3. **Überschneidung:** Das neue Teil wird gegen alle früheren, nicht benachbarten Teile geprüft (SAT auf konvexen Teilflächen, volle Fahrbahnbreite, 3 mm Toleranz für reines Berühren).
4. **Raum:** Teilstrecke breiter als die Raumdiagonale ⇒ Abbruch; fertige Layouts müssen in einer 30°-Drehung in den Raum passen.

Ein Rundkurs zählt nur, wenn Endposition ≤ 0,5 mm vom Start entfernt ist **und** die Richtung exakt ±360° gedreht hat. Duplikate werden über eine kanonische Form ausgefiltert (zyklische Rotation, Spiegelung, umgekehrte Fahrtrichtung; Start/Ziel zählt geometrisch als Gerade) – es werden also nicht dieselben Strecken gedreht oder gespiegelt angeboten. Phase 1: zufällige Neustarts mit Knotenbudget, jeweils mit einer zufälligen Höchstzahl im gewünschten Bereich. Die enge Höchstzahl lässt das Pruning die Strecke zum Start zurückführen; so bleibt die Suche auch bei 60–100+ Teilen schnell (typisch 1–2 s). Phase 2: vollständige Suche; sobald genug Formen bekannt sind, nur noch ein kurzes Zusatzbudget. Phase 3 (nur „Maximale Ausnutzung“): Gefundene Rundkurse werden durch schlusserhaltende Einfügungen verlängert, also zwei Module mit exakt entgegengesetztem Versatz (Gerade/Gerade, R1-S-Kurve, R2-S-Kurve), danach komplette Neuprüfung. Nur wenn die vollständige Suche fertig wird, sagt die App „kein Rundkurs möglich“, sonst „keiner gefunden“. Ergebnisse werden nach Streckenstil bewertet (Geradenanteil, Richtungswechsel, Flächenausnutzung, Teilevielfalt).

Grundbestand: 40 verschiedene Formen, vollständig durchsucht in rund 1 s.

## Struktur

```
src/geometry/catalog.ts      Teilekatalog mit Maßen, Quellenhinweisen
src/geometry/pose.ts         Posen, Bogen-/Geradenmathematik, Umrisse
src/geometry/collision.ts    Footprints, SAT-Überschneidungstest
src/geometry/layout.ts       Platzierung, Validierung (Schluss, Überschneidung, Regeln, Bestand)
src/geometry/orientation.ts  beste Ausrichtung / Raumprüfung
src/generator/search.ts      Backtracking-Generator
src/generator/canonical.ts   Formsignatur gegen Dubletten
src/generator/worker.ts      Web Worker
src/components/*             UI (TrackSvg, Generator, Editor, Strecken, Inventar, Pro)
src/billing/*                Free/Pro-Konfiguration, Regeln, Token-Prüfung, API, StoreKit-Brücke
src/lib/export.ts, pdf.ts    PNG-/PDF-Export (eigener PDF-Writer, keine Abhängigkeit)
src/lib/platform.ts          native Speicherung (Capacitor Preferences)
server/                      Abo-API: Konten, Stripe Checkout/Billing/Webhooks, Apple-Verifikation
ios/                         Capacitor-iOS-Projekt (StorePlugin.swift = StoreKit 2)
public/sw.js                 Service Worker (Build trägt Asset-Liste ein)
tests/*.test.ts              Vitest
docs/RELEASE.md              Zahlungen einrichten, TestFlight, offene Punkte
```
