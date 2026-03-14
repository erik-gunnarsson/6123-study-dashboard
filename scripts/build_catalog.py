#!/usr/bin/env python3

import json
import re
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
WORKBOOK_PATH = ROOT / "exercise handbook solutions.xlsx"
OUTPUT_PATH = ROOT / "data" / "question-catalog.json"
NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def column_index(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", cell_ref)
    if not match:
      return 0
    value = 0
    for char in match.group(1):
        value = value * 26 + ord(char) - 64
    return value - 1


def load_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    shared = []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    for item in root.findall("a:si", NS):
        shared.append("".join(text.text or "" for text in item.iterfind(".//a:t", NS)))
    return shared


def read_sheet_rows(archive: zipfile.ZipFile, path: str, shared_strings: list[str]) -> list[list[str]]:
    root = ET.fromstring(archive.read(path))
    rows = []
    for row in root.findall(".//a:sheetData/a:row", NS):
        cells = {}
        for cell in row.findall("a:c", NS):
            index = column_index(cell.attrib["r"])
            value = ""
            inline_string = cell.find("a:is", NS)
            normal_value = cell.find("a:v", NS)
            value_type = cell.attrib.get("t")

            if inline_string is not None:
                value = "".join(text.text or "" for text in inline_string.iterfind(".//a:t", NS))
            elif normal_value is not None:
                value = normal_value.text or ""
                if value_type == "s":
                    value = shared_strings[int(value)]

            cells[index] = " ".join(str(value).strip().split())

        if not cells:
            continue

        max_index = max(cells)
        rows.append([cells.get(index, "") for index in range(max_index + 1)])

    return rows


def question_prompt(section_label: str, question_number: int) -> str:
    return (
        f"Solve Question {question_number} from {section_label} using the original handbook wording. "
        "Use the attached PDF for the full prompt, then self-assess against the solution."
    )


def main() -> None:
    sections = []
    questions = []

    with zipfile.ZipFile(WORKBOOK_PATH) as archive:
        shared_strings = load_shared_strings(archive)
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}

        for sheet in workbook.find("a:sheets", NS):
            name = sheet.attrib["name"]
            if not name.startswith("Part "):
                continue

            relationship_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = "xl/" + rel_map[relationship_id]
            rows = read_sheet_rows(archive, target, shared_strings)
            title_row = next((row for row in rows if row and row[0].startswith("Part ")), [])
            section_title = title_row[0]
            section_id = name.lower().replace(" ", "-")
            section_number = int(name.split(" ")[1])

            label = section_title.split(":", 1)[0]
            theme = section_title.split(":", 1)[1].strip() if ":" in section_title else section_title
            tags = [tag.strip() for tag in theme.split(";") if tag.strip()]
            sections.append(
                {
                    "id": section_id,
                    "label": f"{label}: {theme}",
                    "number": section_number,
                    "theme": theme,
                    "tags": tags,
                }
            )

            current_number = None
            current_lines = []

            def flush_question() -> None:
                if current_number is None:
                    return

                solution_text = "\n".join(line for line in current_lines if line)
                questions.append(
                    {
                        "id": f"{section_id}-q{current_number}",
                        "source": "handbook",
                        "section": section_id,
                        "sectionLabel": f"{label}: {theme}",
                        "sectionNumber": section_number,
                        "title": f"{name} Question {current_number}",
                        "prompt": question_prompt(name, current_number),
                        "promptStatus": "placeholder",
                        "sourceRef": f"exercise_handbook_2023_24.pdf · {name} · Question {current_number}",
                        "solutionRef": f"exercise handbook solutions.xlsx · {name} · Question {current_number}",
                        "solutionText": solution_text,
                        "tags": tags,
                    }
                )

            for row in rows[1:]:
                first_cell = row[0] if row else ""
                if first_cell.isdigit():
                    flush_question()
                    current_number = int(first_cell)
                    current_lines = []
                    continue

                if current_number is None:
                    continue

                joined = " | ".join(cell for cell in row if cell)
                if joined:
                    current_lines.append(joined)

            flush_question()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(
            {
                "version": 1,
                "generatedFrom": WORKBOOK_PATH.name,
                "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                "sections": sorted(sections, key=lambda section: section["number"]),
                "questions": questions,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
