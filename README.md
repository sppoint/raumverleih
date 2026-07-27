# Raumverleih Dashboard

Kleine lokale Web-App fuer den Raumverleih auf Basis der auf `https://eva2.inf.h-brs.de/stundenplan/` gelisteten Raeume.
Der Fokus liegt auf den verleihbaren Raeumen `C115`, `C116`, `C117`, `C118`, `C119`, `C120`, `C125` und `C130`.

## Funktionen

- zeigt nur die verleihbaren Raeume in einer Uebersicht
- synchronisiert die offiziellen Stundenplaene direkt ueber den Button auf der Seite
- synchronisiert eva2 automatisch beim Start und danach standardmaessig jede Stunde
- markiert sofort, welche Raeume gerade frei, regulaer belegt oder ausgeliehen sind
- speichert jede Ausleihe dauerhaft in `daten/ausleihen.json`
- zeigt den vollstaendigen Ausleihverlauf im Menue `Alle Ausleihen`
- speichert feste Wochenbelegungen lokal im Browser
- bietet Suche sowie Filter nach Gebaeude und Status

## Start

1. `start_server.bat` doppelt anklicken.
2. Die Seite oeffnet sich automatisch unter `http://127.0.0.1:8000/`.
3. Bei Bedarf auf `Jetzt synchronisieren` klicken; die Seite laedt danach automatisch neu.

Die Seite nicht direkt ueber `index.html` starten, weil der Browser ohne den lokalen Server nicht in die Ausleihdatei schreiben darf.

## Hinweis

Die App zeigt die offiziellen Stundenplandaten aus `eva2` und kombiniert sie mit euren manuellen Ausleihen.
Falls ein Raum nicht auf `eva2` verfuegbar ist, bleibt er trotzdem in der Verleihoberflaeche sichtbar und kann weiter manuell verwaltet werden.
Der vollstaendige Ausleihverlauf mit Beginn und Rueckgabe liegt in `daten/ausleihen.json` und wird im Menue `Alle Ausleihen` angezeigt.

## Kostenlos auf PythonAnywhere

Die kostenlose Hosting-Variante mit PythonAnywhere und automatischem eva2-Abgleich ueber GitHub Actions ist in [PYTHONANYWHERE_SETUP.md](PYTHONANYWHERE_SETUP.md) beschrieben.

## Server und Docker

Alle fuer den Serverbetrieb benoetigten Dateien sind enthalten. Die vollstaendige Anleitung steht in [SERVER_SETUP.md](SERVER_SETUP.md).

Kurzstart auf einem Server mit Docker:

```bash
cp .env.example .env
docker compose up -d --build
```
