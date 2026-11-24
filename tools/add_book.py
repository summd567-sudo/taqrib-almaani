"""Add (or refresh) the page numbers of another commentary in data/data.js.

Usage: python tools/add_book.py <ocr_txt_dir> <key> [data_dir]

- ocr_txt_dir: one p-NNN.txt per scanned page of the user's own PDF copy
               (see tools/ocr.ps1). Only page numbers are kept.
- key:         the verse field that receives the page number (e.g. "w" for
               «الوافي»); it must match the book id in app.js.

Existing fields and the QWORDS index in data.js are left untouched.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import build_data as b  # noqa: E402


def main():
    ocr_dir, key = sys.argv[1:3]
    data_dir = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), "..", "data")
    path = os.path.join(data_dir, "data.js")
    lines = open(path, encoding="utf-8").read().split("\n")
    head = "window.SHATIBIYYAH="
    idx = next(i for i, l in enumerate(lines) if l.startswith(head))
    verses = json.loads(lines[idx][len(head):].rstrip(";"))

    pages = b.load_pages(ocr_dir)
    assigned, toks = b.assign_pages(verses, pages)
    weak = 0
    for v, p, tk in zip(verses, assigned, toks):
        v[key] = p
        if b.score(tk, pages[p]) < 0.4:
            weak += 1
    lines[idx] = head + json.dumps(verses, ensure_ascii=False, separators=(",", ":")) + ";"
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    print("verses", len(verses), "pages", len(pages), "weak", weak)


if __name__ == "__main__":
    main()
