import argparse
import json
import os
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("RAUMVERLEIH_DATA_DIR", ROOT / "daten")).resolve()
ROOM_STATUS_FILE = DATA_DIR / "raumstatus.json"
SCHEDULE_FILE = ROOT / "eva2-data.js"
ALLOWED_ROOMS = {
    "St-C115",
    "St-C116",
    "St-C117",
    "St-C118",
    "St-C119",
    "St-C120",
    "St-C125",
    "St-C130",
}
STATUS_LOCK = threading.Lock()


def ensure_data_files():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not ROOM_STATUS_FILE.exists():
        _write_status_file({"loanedRooms": []})


def get_health():
    return {
        "ok": True,
        "statusFile": ROOM_STATUS_FILE.exists(),
        "scheduleFile": SCHEDULE_FILE.exists(),
        "scheduleVersion": str(SCHEDULE_FILE.stat().st_mtime_ns) if SCHEDULE_FILE.exists() else None,
    }


def _read_status_file():
    try:
        payload = json.loads(ROOM_STATUS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        payload = {"loanedRooms": []}

    rooms = payload.get("loanedRooms", []) if isinstance(payload, dict) else []
    normalized = sorted({room for room in rooms if room in ALLOWED_ROOMS})
    return {"loanedRooms": normalized}


def read_room_status():
    ensure_data_files()
    with STATUS_LOCK:
        return _read_status_file()


def _write_status_file(payload):
    temporary_file = ROOM_STATUS_FILE.with_suffix(".json.tmp")
    temporary_file.write_text(
        json.dumps(payload, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_file.replace(ROOM_STATUS_FILE)


def update_room_status(payload):
    if not isinstance(payload, dict):
        raise ValueError("Ungueltiger Raumstatus.")

    room = payload.get("room")
    loaned = payload.get("loaned")
    if room not in ALLOWED_ROOMS:
        raise ValueError("Unbekannter Raum.")
    if not isinstance(loaned, bool):
        raise ValueError("Der Status muss wahr oder falsch sein.")

    ensure_data_files()
    with STATUS_LOCK:
        status = _read_status_file()
        loaned_rooms = set(status["loanedRooms"])
        if loaned:
            loaned_rooms.add(room)
        else:
            loaned_rooms.discard(room)

        result = {"loanedRooms": sorted(loaned_rooms)}
        _write_status_file(result)
        return result


class RoomStatusHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        request_path = urlparse(self.path).path
        if request_path == "/api/health":
            self.send_json(200, get_health())
            return

        if request_path == "/api/room-status":
            self.send_json(200, read_room_status())
            return

        super().do_GET()

    def do_POST(self):
        request_path = urlparse(self.path).path
        if request_path != "/api/room-status":
            self.send_error(404)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 100_000:
                raise ValueError("Ungueltige Datengroesse.")

            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            self.send_json(200, update_room_status(payload))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            self.send_json(400, {"error": str(error)})

    def send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="Raumstatus-Webserver")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    ensure_data_files()
    handler = partial(RoomStatusHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    address = f"http://{args.host}:{args.port}/"

    print(f"Raumstatus laeuft unter {address}")
    print(f"Verliehene Raeume werden in {ROOM_STATUS_FILE} gespeichert.")

    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(address)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
