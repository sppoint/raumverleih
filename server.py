import argparse
import hmac
import json
import os
import shutil
import subprocess
import sys
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("RAUMVERLEIH_DATA_DIR", ROOT / "daten")).resolve()
LOANS_FILE = DATA_DIR / "ausleihen.json"
SCHEDULE_FILE = DATA_DIR / "eva2-data.js"
BUNDLED_SCHEDULE_FILE = ROOT / "eva2-data.js"
SYNC_IMPORT_TOKEN = os.environ.get("RAUMVERLEIH_SYNC_TOKEN", "")
EXTERNAL_SYNC_MANAGED = os.environ.get("RAUMVERLEIH_EXTERNAL_SYNC", "0").lower() in {"1", "true", "yes"}
WRITE_LOCK = threading.Lock()
SCHEDULE_WRITE_LOCK = threading.Lock()
SYNC_LOCK = threading.Lock()


def ensure_data_files():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not LOANS_FILE.exists():
        LOANS_FILE.write_text("[]\n", encoding="utf-8")

    if not SCHEDULE_FILE.exists() and BUNDLED_SCHEDULE_FILE.exists():
        shutil.copyfile(BUNDLED_SCHEDULE_FILE, SCHEDULE_FILE)


def read_loans():
    try:
        loans = json.loads(LOANS_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        loans = []

    return loans if isinstance(loans, list) else []


def write_loans(loans):
    if not isinstance(loans, list) or not all(isinstance(loan, dict) for loan in loans):
        raise ValueError("Ungueltige Ausleihdaten")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(loans, ensure_ascii=False, indent=2) + "\n"
    temporary_file = LOANS_FILE.with_suffix(".json.tmp")

    with WRITE_LOCK:
        temporary_file.write_text(serialized, encoding="utf-8")
        temporary_file.replace(LOANS_FILE)

    return len(loans)


def get_health():
    return {
        "status": "ok",
        "loansFile": LOANS_FILE.exists(),
        "scheduleFile": SCHEDULE_FILE.exists(),
        "scheduleVersion": str(SCHEDULE_FILE.stat().st_mtime_ns) if SCHEDULE_FILE.exists() else None,
        "syncInProgress": SYNC_LOCK.locked(),
        "externalSync": EXTERNAL_SYNC_MANAGED,
    }


def get_schedule_file():
    return SCHEDULE_FILE if SCHEDULE_FILE.exists() else BUNDLED_SCHEDULE_FILE


def write_schedule_data(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("rooms"), dict):
        raise ValueError("Ungueltige Stundenplandaten")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    content = "window.EVA2_SCHEDULE = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    temporary_file = SCHEDULE_FILE.with_suffix(".js.tmp")

    with SCHEDULE_WRITE_LOCK:
        temporary_file.write_text(content, encoding="utf-8")
        temporary_file.replace(SCHEDULE_FILE)


def valid_sync_token(value):
    return bool(SYNC_IMPORT_TOKEN) and bool(value) and hmac.compare_digest(SYNC_IMPORT_TOKEN, value)


def run_eva2_sync():
    if not SYNC_LOCK.acquire(blocking=False):
        return 409, {"synced": False, "error": "Synchronisierung laeuft bereits."}

    try:
        environment = os.environ.copy()
        environment["EVA2_OUTPUT_FILE"] = str(SCHEDULE_FILE)
        result = subprocess.run(
            [sys.executable, str(ROOT / "sync_eva2.py")],
            cwd=ROOT,
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return 504, {"synced": False, "error": "Synchronisierung hat zu lange gedauert."}
    except OSError:
        return 500, {"synced": False, "error": "Synchronisierung konnte nicht gestartet werden."}
    finally:
        SYNC_LOCK.release()

    output = "\n".join(part for part in [result.stdout.strip(), result.stderr.strip()] if part)
    if result.returncode != 0:
        return 500, {
            "synced": False,
            "error": "eva2 konnte nicht synchronisiert werden. Bitte die Internetverbindung pruefen.",
            "details": output,
        }

    return 200, {"synced": True, "output": output}


def automatic_sync_loop(interval_minutes, sync_on_start, stop_event):
    if sync_on_start:
        status, result = run_eva2_sync()
        message = result.get("output") if status == 200 else result.get("error")
        print(f"Automatischer eva2-Sync beim Start: {message}", flush=True)

    if interval_minutes <= 0:
        return

    while not stop_event.wait(interval_minutes * 60):
        status, result = run_eva2_sync()
        message = result.get("output") if status == 200 else result.get("error")
        print(f"Automatischer eva2-Sync: {message}", flush=True)


class RoomDashboardHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        request_path = urlsplit(self.path).path

        if request_path == "/api/health":
            self.send_json(200, get_health())
            return

        if request_path == "/api/loans":
            self.send_loans()
            return

        if request_path == "/eva2-data.js":
            self.send_schedule_file()
            return

        if request_path.startswith("/daten/"):
            self.send_error(404)
            return

        super().do_GET()

    def do_POST(self):
        request_path = urlsplit(self.path).path

        if request_path == "/api/loans":
            self.save_loans()
            return

        if request_path == "/api/sync":
            self.sync_schedule()
            return

        if request_path == "/api/schedule-import":
            self.import_schedule()
            return

        self.send_error(404)

    def send_loans(self):
        self.send_json(200, read_loans())

    def send_schedule_file(self):
        source_file = get_schedule_file()
        if not source_file.exists():
            self.send_error(404)
            return

        body = source_file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def save_loans(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 2_000_000:
                raise ValueError("Ungueltige Dateigroesse")

            loans = json.loads(self.rfile.read(content_length).decode("utf-8"))
            entries = write_loans(loans)
            self.send_json(200, {"saved": True, "entries": entries})
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            self.send_json(400, {"saved": False, "error": str(error)})

    def sync_schedule(self):
        status, result = run_eva2_sync()
        self.send_json(status, result)

    def import_schedule(self):
        if not SYNC_IMPORT_TOKEN:
            self.send_json(503, {"imported": False, "error": "Import-Token ist nicht konfiguriert."})
            return

        if not valid_sync_token(self.headers.get("X-Sync-Token", "")):
            self.send_json(401, {"imported": False, "error": "Ungueltiges Import-Token."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 5_000_000:
                raise ValueError("Ungueltige Dateigroesse")

            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            write_schedule_data(payload)
            self.send_json(200, {"imported": True, "generatedAt": payload.get("generatedAt")})
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            self.send_json(400, {"imported": False, "error": str(error)})

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="Lokaler Server fuer das Raumverleih-Dashboard")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument(
        "--sync-interval",
        type=int,
        default=int(os.environ.get("EVA2_SYNC_INTERVAL_MINUTES", "60")),
        help="Minuten zwischen automatischen eva2-Synchronisierungen; 0 deaktiviert das Intervall.",
    )
    parser.add_argument("--skip-initial-sync", action="store_true")
    args = parser.parse_args()

    ensure_data_files()
    handler = partial(RoomDashboardHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    address = f"http://{args.host}:{args.port}/"
    stop_event = threading.Event()
    sync_thread = threading.Thread(
        target=automatic_sync_loop,
        args=(args.sync_interval, not args.skip_initial_sync, stop_event),
        name="eva2-auto-sync",
        daemon=True,
    )
    sync_thread.start()

    print(f"Raumverleih laeuft unter {address}")
    print(f"Ausleihen werden in {LOANS_FILE} gespeichert.")
    print(f"Stundenplaene werden in {SCHEDULE_FILE} gespeichert.")
    if args.sync_interval > 0:
        print(f"Automatischer eva2-Sync: alle {args.sync_interval} Minuten.")

    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(address)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        server.server_close()


if __name__ == "__main__":
    main()
