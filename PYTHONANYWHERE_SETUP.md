# Kostenlose Installation auf PythonAnywhere

PythonAnywhere stellt die Webseite bereit und speichert den gemeinsamen Raumstatus dauerhaft in `daten/raumstatus.json`. Es gibt keinen GitHub-Workflow und keine automatische EVA2-Synchronisierung.

## 1. Projekt installieren

In einer PythonAnywhere-Bash-Konsole:

```bash
cd ~
git clone https://github.com/DEIN-GITHUB-NAME/DEIN-REPOSITORY.git raumverleih
cd raumverleih
mkdir -p daten
```

## 2. Web-App einrichten

1. Unter `Web` auf `Add a new web app` klicken.
2. `Manual configuration` und eine angebotene Python-3-Version waehlen.
3. Die angezeigte WSGI-Konfigurationsdatei oeffnen.
4. Den Inhalt durch diese Konfiguration ersetzen und den Benutzernamen anpassen:

```python
import os
import sys
import time

project = "/home/DEIN-BENUTZERNAME/raumverleih"
if project not in sys.path:
    sys.path.insert(0, project)

os.environ["RAUMVERLEIH_DATA_DIR"] = project + "/daten"
os.environ["TZ"] = "Europe/Berlin"
time.tzset()

from pythonanywhere_wsgi import application
```

Anschliessend unter `Web` auf `Reload` klicken. Die App ist unter `https://DEIN-BENUTZERNAME.pythonanywhere.com` erreichbar.

## 3. Aktualisierungen installieren

Nach einer neuen Programmversion oder einem neuen Semester-Stundenplan:

```bash
cd ~/raumverleih
git pull
```

Danach unter `Web` erneut auf `Reload` klicken. `daten/raumstatus.json` bleibt erhalten.

## Hinweise

- Jeder mit dem Link kann einen Raum als verliehen oder zurueckgegeben markieren.
- Die kostenlose Web-App muss entsprechend den Hinweisen im PythonAnywhere-Konto regelmaessig verlaengert werden.
- Es werden keine Namen oder Ausleihverlaeufe gespeichert.
