from __future__ import annotations

import datetime as dt
import html
import json
import os
import re
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

BASE_URL = "https://eva2.inf.h-brs.de/stundenplan/"
DISPLAY_URL = "https://eva2.inf.h-brs.de/stundenplan/anzeigen/"
TARGET_ROOMS = [
    "St-C115",
    "St-C116",
    "St-C117",
    "St-C118",
    "St-C119",
    "St-C120",
    "St-C125",
    "St-C130",
]

DAY_MAP = {
    "Mo": 1,
    "Di": 2,
    "Mi": 3,
    "Do": 4,
    "Fr": 5,
    "Sa": 6,
    "So": 0,
}


def fetch_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=30, context=ssl._create_unverified_context()) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def strip_tags(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_room_options(index_html: str) -> tuple[str, dict[str, str]]:
    term_match = re.search(r'name="term"\s+value="([^"]+)"', index_html)
    if not term_match:
        raise RuntimeError("Konnte den term-Wert auf der eva2-Seite nicht finden.")

    select_match = re.search(
        r'<select[^>]+name="identifier_raum"[^>]*>(.*?)</select>',
        index_html,
        re.DOTALL | re.IGNORECASE,
    )
    if not select_match:
        raise RuntimeError("Konnte die Raumauswahl auf der eva2-Seite nicht finden.")

    options = {}
    for value, label in re.findall(r'<option value="([^"]*)">(.*?)</option>', select_match.group(1), re.DOTALL):
        clean_label = strip_tags(label)
        if clean_label in TARGET_ROOMS:
            options[clean_label] = html.unescape(value)

    return term_match.group(1), options


def parse_period(period_text: str) -> tuple[str, str, str]:
    period_match = re.search(
        r"(\d{2}\.\d{2}\.\d{4})-(\d{2}\.\d{2}\.\d{4})\s+\(([^)]+)\)",
        period_text,
    )
    if not period_match:
        raise RuntimeError(f"Unbekanntes Zeitraum-Format: {period_text}")

    start = dt.datetime.strptime(period_match.group(1), "%d.%m.%Y").strftime("%Y-%m-%d")
    end = dt.datetime.strptime(period_match.group(2), "%d.%m.%Y").strftime("%Y-%m-%d")
    flag = period_match.group(3)

    if flag.startswith("gKW"):
        week_mode = "even"
    elif flag.startswith("uKW"):
        week_mode = "odd"
    else:
        week_mode = "all"

    return start, end, week_mode


def parse_room_page(room: str, page_html: str) -> list[dict[str, str | int]]:
    table_match = re.search(r"<table.*?</table>", page_html, re.DOTALL | re.IGNORECASE)
    if not table_match:
        return []

    current_day = None
    entries = []

    for row_html in re.findall(r"<tr[^>]*>(.*?)</tr>", table_match.group(0), re.DOTALL | re.IGNORECASE):
        cells = [strip_tags(cell) for cell in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, re.DOTALL | re.IGNORECASE)]
        if not cells or "von" in [cell.lower() for cell in cells]:
            continue

        if len(cells) == 7:
            day_label = cells[0] or current_day
            start_time, end_time, _, title, period_text, who = cells[1:]
        elif len(cells) == 6:
            day_label = current_day
            start_time, end_time, _, title, period_text, who = cells
        else:
            continue

        if day_label not in DAY_MAP:
            continue

        current_day = day_label
        start_date, end_date, week_mode = parse_period(period_text)

        entries.append(
            {
                "room": room,
                "weekday": day_label,
                "weekdayIndex": DAY_MAP[day_label],
                "startTime": start_time,
                "endTime": end_time,
                "title": title,
                "who": who,
                "startDate": start_date,
                "endDate": end_date,
                "weekMode": week_mode,
                "periodLabel": period_text,
            }
        )

    return entries


def build_room_url(term: str, room_identifier: str) -> str:
    query = urllib.parse.urlencode(
        {
            "weeks": "40;41;42;43;44;45;46;47;48;49;50;51;54;55;56",
            "days": "1-7",
            "mode": "table",
            "identifier_raum": room_identifier,
            "show_raum": "",
            "term": term,
        }
    )
    return f"{DISPLAY_URL}?{query}"


def build_schedule_payload() -> dict[str, object]:
    index_html = fetch_text(BASE_URL)
    term, room_options = parse_room_options(index_html)

    unavailable_rooms = [room for room in TARGET_ROOMS if room not in room_options]
    room_entries: dict[str, list[dict[str, str | int]]] = {}

    for room, room_identifier in room_options.items():
        page_html = fetch_text(build_room_url(term, room_identifier))
        room_entries[room] = parse_room_page(room, page_html)

    return {
        "generatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": BASE_URL,
        "rooms": room_entries,
        "unavailableRooms": unavailable_rooms,
    }


def write_schedule_payload(payload: dict[str, object]) -> Path:
    output = "window.EVA2_SCHEDULE = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    default_output_file = Path(__file__).resolve().parent / "eva2-data.js"
    output_file = Path(os.environ.get("EVA2_OUTPUT_FILE", default_output_file)).resolve()
    output_file.parent.mkdir(parents=True, exist_ok=True)
    temporary_file = output_file.with_suffix(output_file.suffix + ".tmp")
    temporary_file.write_text(output, encoding="utf-8")
    temporary_file.replace(output_file)
    return output_file


def main() -> None:
    payload = build_schedule_payload()
    output_file = write_schedule_payload(payload)

    print(f"{output_file} aktualisiert")
    print(f"Importierte Raeume: {', '.join(sorted(payload['rooms']))}")
    if payload["unavailableRooms"]:
        print(f"Nicht auf eva2 gefunden: {', '.join(payload['unavailableRooms'])}")


if __name__ == "__main__":
    main()
