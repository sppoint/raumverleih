# Server-Installation

Das Dashboard benoetigt keine externen Python-Pakete. Fuer den einfachsten und reproduzierbaren Betrieb wird Docker Compose verwendet.

## Voraussetzungen

- Linux- oder Windows-Server mit Docker und Docker Compose
- Internetzugriff vom Server auf `https://eva2.inf.h-brs.de`
- freier TCP-Port, standardmaessig `8000`

## Installation mit Docker

1. Den kompletten Projektordner auf den Server kopieren.
2. Im Projektordner die Konfiguration anlegen:

   ```bash
   cp .env.example .env
   ```

3. Bei Bedarf Port und Synchronisierungsintervall in `.env` anpassen.
4. Anwendung bauen und starten:

   ```bash
   docker compose up -d --build
   ```

5. Status kontrollieren:

   ```bash
   docker compose ps
   docker compose logs -f raumverleih
   ```

Danach ist das Dashboard unter `http://SERVER-IP:8000/` erreichbar.

## Automatische Synchronisierung

`sync_eva2.py` wird automatisch in einem Hintergrund-Thread ausgefuehrt:

- einmal direkt nach jedem Serverstart
- danach standardmaessig alle 60 Minuten
- weiterhin manuell ueber den Button `Jetzt synchronisieren`

Das Intervall wird in `.env` gesetzt:

```env
EVA2_SYNC_INTERVAL_MINUTES=60
```

Mit dem Wert `0` wird der regelmaessige Lauf deaktiviert. Der einmalige Import beim Start bleibt aktiv.

## Persistente Dateien und Backup

Alle veraenderlichen Daten liegen im Ordner `daten/` und bleiben bei Container-Neustarts und neuen Images erhalten:

- `daten/ausleihen.json`: vollstaendiger Ausleihverlauf
- `daten/eva2-data.js`: letzter erfolgreicher eva2-Import

Fuer ein Backup reicht es, den kompletten Ordner `daten/` zu sichern. Die Dateien werden atomar ersetzt, damit nie teilweise geschriebene Daten ausgeliefert werden.

## Aktualisierung und Neustart

Nach dem Austausch von Programmdateien:

```bash
docker compose up -d --build
```

Nur neu starten:

```bash
docker compose restart
```

Beenden:

```bash
docker compose down
```

## Betrieb ohne Docker

Mit Python 3.10 oder neuer:

```bash
python3 server.py --host 0.0.0.0 --port 8000 --no-browser
```

Der automatische Import ist auch in diesem Modus standardmaessig aktiv. Das Intervall kann mit `--sync-interval 30` geaendert werden.

## Sicherheit

Die Anwendung besitzt keine Benutzeranmeldung. Sie sollte nur im internen Netzwerk erreichbar sein oder hinter einem Reverse Proxy mit HTTPS und Zugangsschutz betrieben werden. Den Port in der Firewall nur fuer die benoetigten Netze freigeben.
