# Raumstatus Gebaeude C

Einfache Web-App fuer die Raeume `C115`, `C116`, `C117`, `C118`, `C119`, `C120`, `C125` und `C130`.

## Funktionen

- zeigt, welche Raeume laut Stundenplan aktuell frei oder belegt sind
- markiert einen Raum per Knopfdruck als `Verliehen` und stellt ihn deutlich rot dar
- gibt einen verliehenen Raum per Knopfdruck wieder frei
- speichert nur die aktuell verliehenen Raumnummern zentral in `daten/raumstatus.json`
- speichert keine Namen, Notizen, Buchungen oder Ausleihverlaeufe
- funktioniert auf Desktop, Tablet und Smartphone

## Lokal starten

`start_server.bat` doppelt anklicken. Die Seite oeffnet sich unter `http://127.0.0.1:8000/`.

## Stundenplan einmal pro Semester aktualisieren

Auf einem Computer mit Internetzugang im Projektordner ausfuehren:

```bash
python sync_eva2.py
```

Danach die aktualisierte Datei `eva2-data.js` zusammen mit dem Projekt auf den Server laden. Auf dem kostenlosen PythonAnywhere-Tarif wird EVA2 nicht automatisch aufgerufen.

## PythonAnywhere

Die kostenlose Einrichtung ist in [PYTHONANYWHERE_SETUP.md](PYTHONANYWHERE_SETUP.md) beschrieben. GitHub Actions werden nicht verwendet.

## Eigener Server

Anweisungen fuer Python und Docker stehen in [SERVER_SETUP.md](SERVER_SETUP.md).
