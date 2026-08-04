import json
import os
import time
from http import HTTPStatus

from server import (
    ROOT,
    SCHEDULE_FILE,
    ensure_data_files,
    get_health,
    read_room_status,
    update_room_status,
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
    "/eva2-data.js": (SCHEDULE_FILE, "application/javascript; charset=utf-8"),
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
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    return send_response(start_response, status_code, body, "application/json; charset=utf-8")


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET").upper()
    path = environ.get("PATH_INFO", "/")

    if method == "GET" and path == "/api/health":
        return send_json(start_response, 200, get_health())

    if method == "GET" and path == "/api/room-status":
        return send_json(start_response, 200, read_room_status())

    if method == "POST" and path == "/api/room-status":
        try:
            content_length = int(environ.get("CONTENT_LENGTH") or "0")
            if content_length <= 0 or content_length > 100_000:
                raise ValueError("Ungueltige Datengroesse.")

            payload = json.loads(environ["wsgi.input"].read(content_length).decode("utf-8"))
            return send_json(start_response, 200, update_room_status(payload))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            return send_json(start_response, 400, {"error": str(error)})

    if method == "GET" and path in STATIC_FILES:
        file_path, content_type = STATIC_FILES[path]
        if file_path.exists():
            return send_response(start_response, 200, file_path.read_bytes(), content_type)
        return send_json(start_response, 404, {"error": "Datei nicht gefunden."})

    return send_json(start_response, 404, {"error": "Nicht gefunden."})
