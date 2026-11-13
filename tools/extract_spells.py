"""Extract column-ordered class lists and spell records from the supplied Spanish PDF."""

import argparse
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
import fitz  # PyMuPDF, only needed to regenerate seeds


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if c.isalnum())


def lines(page):
    columns = [[], [], []]
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = [s for s in line["spans"] if s["text"].strip()]
            if not spans:
                continue
            x, y, *_ = spans[0]["bbox"]
            if not 48 < y < 785:
                continue
            col = 0 if x < 214 else 1 if x < 389 else 2
            columns[col].append(
                (y, x, "".join(s["text"] for s in spans).strip(), spans[0]["font"])
            )
    for col in columns:
        # Spans may be split into separate PDF lines at the same baseline.
        groups = []
        for y, x, t, font in sorted(col):
            if groups and y - groups[-1][0] < 2:
                groups[-1][1].append((x, t, font))
            else:
                groups.append((y, [(x, t, font)]))
        for _, parts in groups:
            parts.sort()
            yield " ".join(t for _, t, _ in parts), parts[0][2], parts[0][0]


def joined(parts):
    text = " ".join(parts)
    return re.sub(r"(?<=\w)- (?=[a-záéíóúüñ])", "", text).strip()


def parse(pdf):
    listing = defaultdict(dict)
    records = {}
    group = None
    level = None
    listing_done = False
    pending = []
    title = None
    body = []

    def flush():
        if title:
            records[title] = body.copy()

    for p in range(173, 238):
        for t, font, x in lines(pdf[p - 1]):
            if not listing_done:
                if font == "Arial-BoldMT" and "[" in t:
                    listing_done = True
                    title = t
                    continue
                if re.match(r"Conjuros del? ", t):
                    group = t.split()[-1]
                    level = None
                elif m := re.fullmatch(r"(Trucos.*|Nivel (\d))", t, re.I):
                    level = int(m[2] or 0)
                elif group and level is not None:
                    pending.append(t)
                    if "]" in t:
                        name = joined(pending)
                        pending.clear()
                        listing[(group, level)][name] = True
                continue
            if (
                font == "Arial-BoldMT"
                and not t.startswith("A niveles")
                and (not title or "]" in title)
            ):
                flush()
                title = t
                body = []
            elif title and "]" not in title and font == "Arial-BoldMT":
                title = joined([title, t])
            elif title:
                body.append((t, font, x, p))
    flush()
    return listing, records


def english(title):
    return fold(title.split("[")[-1].split("]")[0])


def build(pdf, levels):
    lists, records = parse(pdf)
    by_english = {english(n): n for n in records}
    by_spanish = {fold(n.split("[")[0]): n for n in records}
    levels_by_title = defaultdict(set)
    classes_by_title = defaultdict(set)
    for (group, level), entries in lists.items():
        for entry in entries:
            title = by_english.get(english(entry)) or by_spanish.get(
                fold(entry.split("[")[0])
            )
            if title is None:
                if level in levels:
                    raise ValueError(f"Sin ficha: {entry}, {group}, nivel {level}")
                continue
            levels_by_title[title].add(level)
            classes_by_title[title].add(group)
    result = []
    for title, classes in classes_by_title.items():
        body = records[title]
        listed = levels_by_title[title]
        # When a list repeats a spell under two levels, use the level in its entry.
        if len(listed) == 1:
            level = next(iter(listed))
        else:
            level = int(re.search(r"\d", body[0][0])[0])
            if level not in listed:
                raise ValueError(f"Nivel ambiguo: {title}")
        if level not in levels:
            continue
        school = re.sub(
            r"^(?:(?:Nivel?|Nvel|Nival)\s*\d+|Truco)[,\s]+", "", body[0][0], flags=re.I
        )
        school = re.sub(r"\s*\(ritual\)", "", school, flags=re.I).strip(" .")
        fields = {}
        field = None
        for i, (t, *_) in enumerate(body[1:], 1):
            label, separator, value = re.sub(
                r"^(Tiempo de lanzamiento)\.", r"\1:", t
            ).partition(":")
            key = fold(label)
            if key.startswith("tiempode") and separator:
                field = "casting_time"
            elif key == "alcance" and separator:
                field = "range"
            elif key.startswith("compon") and separator:
                field = "components"
            elif key == "duracion" and separator:
                fields["duration"] = [value.strip()]
                break
            elif field:
                fields[field].append(t)
                continue
            else:
                raise ValueError((title, t))
            fields[field] = [value.strip()]
        meta = {k: joined(v) for k, v in fields.items()}
        if set(meta) != {"duration", "casting_time", "range", "components"} or not all(
            meta.values()
        ):
            raise ValueError((title, meta))
        paragraphs = []
        for text, font, x, page in body[i + 1 :]:
            # First-line indents in the three body columns mark new paragraphs.
            indent = min(abs(x - offset) for offset in (56.8, 231.5, 406.4))
            if (
                not paragraphs
                or (indent < 1 and paragraphs[-1][-1].endswith((".", ":", "!", "?")))
                or text.startswith("•")
            ):
                paragraphs.append([])
            paragraphs[-1].append(text)
        description = "\n\n".join(joined(paragraph) for paragraph in paragraphs)
        if not description or "Tiempo de lanzamiento:" in description:
            raise ValueError(f"Descripción inválida: {title}")
        result.append(
            dict(
                name=title.split("[")[0].strip(),
                level=level,
                school=school,
                **meta,
                concentration="concentracion" in fold(meta["duration"]),
                ritual="ritual" in body[0][0].lower(),
                classes=sorted(classes),
                description=description,
                source_page=body[0][3],
            )
        )
    return sorted(result, key=lambda s: (s["level"], fold(s["name"])))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument(
        "--levels", type=int, nargs="+", choices=range(10), default=[0, 1]
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    with fitz.open(args.pdf) as doc:
        spells = build(doc, set(args.levels))
    args.output.write_text(
        json.dumps(spells, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    print(f"{len(spells)} fichas en {args.output}")
