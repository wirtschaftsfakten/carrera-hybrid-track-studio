# Carrera HYBRID Track Studio

Mobile-first PWA, die aus einem editierbaren Teilebestand automatisch **geometrisch geprüfte, baubare Carrera-HYBRID-Rundkurse** erzeugt. Kein Backend, keine Konten, keine kostenpflichtigen APIs; Bestand, Einstellungen und gespeicherte Strecken liegen im `localStorage` des Geräts.

## Starten

```bash
npm install
npm run dev        # Entwicklung
npm test           # Vitest: Geometrie, Rundkursschluss, Teilbegrenzung, Generator
npm run build      # Typecheck + Produktions-Build nach dist/
npm run preview    # Build lokal ansehen (Service Worker aktiv)
npm run icons      # App-Icons neu rendern (ohne Zusatzpakete)
```

**Aufs Handy:** `dist/` auf einen beliebigen HTTPS-Host legen (z. B. GitHub Pages, Netlify; der Build nutzt relative Pfade und läuft auch in Unterordnern). Dann im Browser öffnen → iPhone: Teilen → „Zum Home-Bildschirm“; Android/Chrome: Menü → „App installieren“. Nach dem ersten Aufruf funktioniert alles offline (auch der Generator, er läuft in einem Web Worker).

## Funktionen

- **Generator** – Backtracking-Suche über den Bestand. Option „Alle Teile verbauen“, Mindestanzahl Teile, Anzahl Varianten, optionale Raumgröße (B × T in cm). Jede Variante wird vor der Anzeige ein zweites Mal unabhängig validiert. Gibt es keinen Rundkurs, steht das da – mit Begründung und dem Hinweis, ob der Suchraum vollständig durchsucht wurde.
- **Editor** – SVG-Plan mit echter Geometrie. Teile anhängen/einfügen (nach dem ausgewählten Teil), ersetzen, löschen, beliebiges Teil zu „Teil 1“ machen, Ansicht in 30°-Schritten drehen. Live-Validierung: Lücke in cm, Drehwinkel, Überschneidungen (rot markiert), Start/Ziel-Regel, Bestand.
- **Strecken** – gespeicherte Layouts mit Status „gültig“ / „Bestand fehlt“ / „Entwurf“.
- **Bestand** – Teilezahlen, Maße je Teil, Rechenregeln, nicht verifizierte Teile, Quellen.

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

1. **Drehung:** Mit den restlichen Kurven muss die Gesamtdrehung noch exakt ±360° erreichbar sein (bei „alle Teile“ schon vorab geprüft – z. B. 7 R + 2 L ⇒ 300° ⇒ sofort „unmöglich“).
2. **Distanz:** Die restliche Streckenlänge muss mindestens der Luftlinie zurück zum Start entsprechen.
3. **Überschneidung:** Das neue Teil wird gegen alle früheren, nicht benachbarten Teile geprüft (SAT auf konvexen Teilflächen, volle Fahrbahnbreite, 3 mm Toleranz für reines Berühren).
4. **Raum:** Teilstrecke breiter als die Raumdiagonale ⇒ Abbruch; fertige Layouts müssen in einer 30°-Drehung in den Raum passen.

Ein Rundkurs zählt nur, wenn Endposition ≤ 0,5 mm vom Start entfernt ist **und** die Richtung exakt ±360° gedreht hat. Duplikate werden über eine kanonische Form ausgefiltert (zyklische Rotation, Spiegelung, umgekehrte Fahrtrichtung; Start/Ziel zählt geometrisch als Gerade) – es werden also nicht dieselben Strecken gedreht oder gespiegelt angeboten. Phase 1: 24 zufällige Neustarts mit Knotenbudget (Vielfalt bei großen Beständen). Phase 2: vollständige Suche bis Ende oder 6 s. Nur wenn Phase 2 fertig wird, sagt die App „kein Rundkurs möglich“; sonst „keiner gefunden (Zeitlimit)“.

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
src/components/*             UI (TrackSvg, Generator, Editor, Strecken, Bestand)
public/sw.js                 Service Worker (Build trägt Asset-Liste ein)
tests/*.test.ts              Vitest
```
