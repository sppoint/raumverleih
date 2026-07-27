import sys

from server import ensure_data_files, run_eva2_sync


def main():
    ensure_data_files()
    status, result = run_eva2_sync()

    if status != 200:
        print(result.get("error", "Synchronisierung fehlgeschlagen."))
        details = result.get("details")
        if details:
            print(details)
        raise SystemExit(1)

    print(result.get("output", "Synchronisierung erfolgreich."))


if __name__ == "__main__":
    main()
