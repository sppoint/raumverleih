# Serverbetrieb

Die App benoetigt Python 3, weil der gemeinsame Raumstatus in `daten/raumstatus.json` gespeichert wird.

## Direkt mit Python

```bash
python3 server.py --host 0.0.0.0 --port 8000 --no-browser
```

Danach ist die Seite unter `http://SERVER-IP:8000/` erreichbar. Fuer einen dauerhaften Betrieb empfiehlt sich ein Reverse Proxy mit HTTPS und ein systemd-Dienst.

Der Serverprozess benoetigt Schreibrechte fuer den Ordner `daten/`.

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Der Ordner `daten/` wird als Volume eingebunden. Dadurch bleibt der aktuelle Raumstatus auch nach einem Container-Neustart erhalten.

## Semester-Stundenplan erneuern

Auf einem Computer mit Zugriff auf EVA2:

```bash
python3 sync_eva2.py
```

Die erzeugte Datei `eva2-data.js` anschliessend auf den Server uebertragen und den Webdienst neu laden. Es gibt keinen automatischen Hintergrund-Sync.

## Endpunkte

- `GET /api/health` prueft den Serverzustand.
- `GET /api/room-status` liefert die aktuell verliehenen Raumnummern.
- `POST /api/room-status` setzt einen Raum auf verliehen oder zurueckgegeben.

Namen, Notizen und Verlaeufe werden nicht gespeichert.
