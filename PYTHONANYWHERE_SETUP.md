# Kostenlose Installation auf PythonAnywhere

Diese Variante benoetigt keinen eigenen Server und keine kostenpflichtige PythonAnywhere-Zeitaufgabe:

- PythonAnywhere stellt die Web-App und den dauerhaften Ordner `daten/` bereit.
- GitHub Actions synchronisiert eva2 einmal pro Stunde mit PythonAnywhere.
- Alle Ausleihen bleiben in `daten/ausleihen.json` gespeichert und sind im Menue `Alle Ausleihen` sichtbar.

## 1. Projekt zu PythonAnywhere bringen

Das Projekt zuerst in ein GitHub-Repository hochladen. Danach in einer PythonAnywhere-Bash-Konsole ausfuehren:

```bash
cd ~
git clone https://github.com/DEIN-GITHUB-NAME/DEIN-REPOSITORY.git raumverleih
cd raumverleih
mkdir -p daten
```

`daten/ausleihen.json` wird beim ersten Aufruf automatisch angelegt. Der Ordner ist vom Git-Upload ausgeschlossen, damit Ausleihdaten nicht versehentlich auf GitHub landen.

## 2. Kostenlosen Webdienst anlegen

1. In PythonAnywhere den Bereich `Web` oeffnen.
2. `Add a new web app` auswaehlen.
3. `Manual configuration` und eine angebotene Python-3-Version waehlen.
4. Den angezeigten Link zur WSGI-Konfigurationsdatei oeffnen.
5. Den vorhandenen Inhalt durch Folgendes ersetzen und `DEIN-BENUTZERNAME` anpassen:

```python
import os
import sys
import time

project = "/home/DEIN-BENUTZERNAME/raumverleih"
if project not in sys.path:
    sys.path.insert(0, project)

os.environ["RAUMVERLEIH_DATA_DIR"] = project + "/daten"
os.environ["RAUMVERLEIH_SYNC_TOKEN"] = "HIER-EIN-LANGES-ZUFAELLIGES-PASSWORT"
os.environ["RAUMVERLEIH_EXTERNAL_SYNC"] = "1"
os.environ["TZ"] = "Europe/Berlin"
time.tzset()

from pythonanywhere_wsgi import application
```

Ein zufaelliges Passwort kann in der PythonAnywhere-Bash-Konsole erzeugt werden:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Das Passwort nicht in GitHub-Dateien schreiben. Anschliessend im Bereich `Web` auf `Reload` klicken. Die App ist dann unter `https://DEIN-BENUTZERNAME.pythonanywhere.com` erreichbar.

## 3. Kostenlosen automatischen Sync aktivieren

Im GitHub-Repository unter `Settings` > `Secrets and variables` > `Actions` zwei Repository-Secrets anlegen:

| Secret | Wert |
| --- | --- |
| `PYTHONANYWHERE_URL` | `https://DEIN-BENUTZERNAME.pythonanywhere.com` |
| `RAUMVERLEIH_SYNC_TOKEN` | dasselbe zufaellige Passwort wie in der WSGI-Datei |

Danach unter `Actions` den Workflow `eva2 synchronisieren` einmal mit `Run workflow` starten. Anschliessend laeuft er automatisch stuendlich. Der Button in der App zeigt bei dieser Hosting-Variante `GitHub Actions`, weil PythonAnywhere den Import nicht selbst ausfuehrt.

## 4. Spaetere Aktualisierungen

Nach neuen Programmversionen in der PythonAnywhere-Bash-Konsole:

```bash
cd ~/raumverleih
git pull
```

Danach im Bereich `Web` erneut `Reload` klicken. Der Ordner `daten/` und damit der komplette Ausleihverlauf bleiben dabei erhalten.

## Wichtige Hinweise

- Die kostenlose PythonAnywhere-Web-App muss entsprechend den Hinweisen im PythonAnywhere-Konto regelmaessig verlaengert werden.
- Die App besitzt aktuell keine Anmeldung. Jeder, der den Link kennt, kann Ausleihen eintragen oder Raeume zurueckgeben.
- Fuer ein Backup im PythonAnywhere-Dateibereich regelmaessig `daten/ausleihen.json` herunterladen.
