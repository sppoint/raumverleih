import json
import os
import urllib.error
import urllib.request

from sync_eva2 import build_schedule_payload


def required_environment(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Umgebungsvariable {name} fehlt.")
    return value


def main():
    site_url = required_environment("PYTHONANYWHERE_URL").rstrip("/")
    sync_token = required_environment("RAUMVERLEIH_SYNC_TOKEN")
    payload = build_schedule_payload()
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{site_url}/api/schedule-import",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "X-Sync-Token": sync_token,
            "User-Agent": "Raumverleih-eva2-Sync/1.0",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Import fehlgeschlagen (HTTP {error.code}): {details}") from error

    if not result.get("imported"):
        raise RuntimeError(result.get("error", "PythonAnywhere hat den Import abgelehnt."))

    print(f"eva2-Daten von {payload['generatedAt']} erfolgreich uebertragen.")


if __name__ == "__main__":
    main()
