import json
import os
import time
from http import HTTPStatus


os.environ.setdefault("RAUMVERLEIH_EXTERNAL_SYNC", "1")

from server import (
    ROOT,
    SYNC_IMPORT_TOKEN,
    ensure_data_files,
    get_health,
    get_schedule_file,
    read_loans,
    run_eva2_sync,
    valid_sync_token,
    write_loans,
    write_schedule_data,
)


os.environ.setdefault("TZ", "Europe/Berlin")
if hasattr(time, "tzset"):
    time.tzset()

ensure_data_files()

STATIC_FILES = {
    "/": (ROOT / "index.html", "text/html; charset=utf-8"),
    "/index.html": (ROOT / "index.html", "text/html; charset=utf-8"),
    "/app.js": (ROOT / "app.js", "application/javascript; charset=utf-8"),
    "/styles.css": (ROOT / "styles.css", "text/css; charset=utf-8"),
}


def send_response(start_response, status_code, body, content_type):
    if isinstance(body, str):
        body = body.encode("utf-8")

    status = f"{status_code} {HTTPStatus(status_code).phrase}"
    headers = [
        ("Content-Type", content_type),
        ("Content-Length", str(len(body))),
        ("Cache-Control", "no-store, no-cache, must-revalidate"),
        ("Pragma", "no-cache"),
        ("Expires", "0"),
    ]
    start_response(status, headers)
    return [body]


def send_json(start_response, status_code, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return send_response(start_response, status_code, body, "application/json; charset=utf-8")


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET").upper()
    path = environ.get("PATH_INFO", "/")

    if method == "GET" and path == "/api/health":
        return send_json(start_response, 200, get_health())

    if method == "GET" and path == "/api/loans":
        return send_json(start_response, 200, read_loans())

    if method == "GET" and path == "/eva2-data.js":
        schedule_file = get_schedule_file()
        if schedule_file.exists():
            return send_response(
                start_response,
                200,
                schedule_file.read_bytes(),
                "application/javascript; charset=utf-8",
            )
        return send_json(start_response, 404, {"error": "Stundenplandatei nicht gefunden."})

    if method == "POST" and path == "/api/loans":
        try:
            content_length = int(environ.get("CONTENT_LENGTH") or "0")
            if content_length <= 0 or content_length > 2_000_000:
                raise ValueError("Ungueltige Dateigroesse")

            payload = json.loads(environ["wsgi.input"].read(content_length).decode("utf-8"))
            entries = write_loans(payload)
            return send_json(start_response, 200, {"saved": True, "entries": entries})
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            return send_json(start_response, 400, {"saved": False, "error": str(error)})

    if method == "POST" and path == "/api/sync":
        status, result = run_eva2_sync()
        return send_json(start_response, status, result)

    if method == "POST" and path == "/api/schedule-import":
        if not SYNC_IMPORT_TOKEN:
            return send_json(start_response, 503, {"imported": False, "error": "Import-Token fehlt."})

        if not valid_sync_token(environ.get("HTTP_X_SYNC_TOKEN", "")):
            return send_json(start_response, 401, {"imported": False, "error": "Ungueltiges Import-Token."})

        try:
            content_length = int(environ.get("CONTENT_LENGTH") or "0")
            if content_length <= 0 or content_length > 5_000_000:
                raise ValueError("Ungueltige Dateigroesse")

            payload = json.loads(environ["wsgi.input"].read(content_length).decode("utf-8"))
            write_schedule_data(payload)
            return send_json(
                start_response,
                200,
                {"imported": True, "generatedAt": payload.get("generatedAt")},
            )
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            return send_json(start_response, 400, {"imported": False, "error": str(error)})

    if method == "GET" and path in STATIC_FILES:
        file_path, content_type = STATIC_FILES[path]
        return send_response(start_response, 200, file_path.read_bytes(), content_type)

    return send_json(start_response, 404, {"error": "Nicht gefunden."})
