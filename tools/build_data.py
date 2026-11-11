"""Build data/data.js: the Shatibiyyah matn + the page of each verse in the book.

Usage: python build_data.py <matn_json_dir> <ocr_txt_dir> <out_dir> [quran_json]

quran_json (optional): plain Quran text from api.alquran.cloud
(quran-simple-clean); enables the per-page index of quoted Quranic phrases.

- matn_json_dir: pages fetched by fetch_matn.sh (Turath book 7754).
- ocr_txt_dir:   one p-NNN.txt per scanned page of the user's own PDF copy of
                 «تقريب المعاني» (local OCR). Only page numbers are kept; the
                 OCR text itself is never written to the output.
"""
import glob
import json
import os
import re
import sys

DIAC = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def norm(s: str) -> str:
    s = DIAC.sub("", s)
    s = re.sub("[أإآٱ]", "ا", s)
    s = s.replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    s = re.sub(r"[^ء-ي0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def load_matn(d):
    verses, section = [], ""
    for f in sorted(glob.glob(os.path.join(d, "*.json"))):
        text = json.load(open(f, encoding="utf-8"))["text"]
        for line in text.split("\n"):
            m = re.search(r'data-type="title"[^>]*>(.*?)</span>', line)
            if m:
                section = re.sub(r"\s+", " ", m.group(1)).strip()
                continue
            m = re.match(r"^([٠-٩]+) - (.*)$", line)
            if m:
                n = int(m.group(1).translate(AR_DIGITS))
                parts = [p.strip() for p in m.group(2).split("...")]
                verses.append({"n": n, "s": section, "a": parts[0], "b": parts[1] if len(parts) > 1 else ""})
    return verses


def load_pages(d):
    pages = {}
    for f in glob.glob(os.path.join(d, "p-*.txt")):
        num = int(re.search(r"p-(\d+)\.txt$", f).group(1))
        pages[num] = norm(open(f, encoding="utf-8").read())
    return pages


def score(tokens, page_text):
    if not tokens:
        return 0.0
    return sum(1 for t in tokens if t in page_text) / len(tokens)


def assign_pages(verses, pages):
    """Monotone assignment (verses appear in order) maximising the match score."""
    nums = sorted(pages)
    toks = [[t for t in norm(v["a"] + " " + v["b"]).split() if len(t) >= 4] for v in verses]
    NEG = -1e9
    P = len(nums)
    best = [0.0] * P
    back = []
    for i, tk in enumerate(toks):
        sc = [score(tk, pages[p]) for p in nums]
        new, bp = [NEG] * P, [0] * P
        run, arg = NEG, 0
        for j in range(P):
            if best[j] > run:  # strict: prefer the earliest page on ties
                run, arg = best[j], j
            new[j] = run + sc[j] - 0.002 * 0  # no extra prior
            bp[j] = arg
        best = new
        back.append(bp)
    j = max(range(P), key=lambda k: (best[k], -k))
    out = [0] * len(verses)
    for i in range(len(verses) - 1, -1, -1):
        out[i] = nums[j]
        j = back[i][j]
    # The book prints a verse (or a group of verses) and its commentary may run
    # onto the following pages. Prefer the earliest page where the verse itself
    # shows up, without ever going before the previous verse's page.
    prev = nums[0]
    for i, tk in enumerate(toks):
        for q in range(max(prev, out[i] - 3), out[i]):
            if q in pages and score(tk, pages[q]) >= 0.5:
                out[i] = q
                break
        prev = out[i]
    return out, toks


def load_raw_pages(d):
    pages = {}
    for f in glob.glob(os.path.join(d, "p-*.txt")):
        num = int(re.search(r"p-(\d+)\.txt$", f).group(1))
        pages[num] = open(f, encoding="utf-8").read()
    return pages


STOP = set(
    "علي ان الي من في ما لا او عن هو هي وقرا قرا قال اي ثم كل قد لم لن بل هل اذا اذ ذلك هذا "
    "التي الذي انه كما مع بعد قبل حيث وان فان وما ولا وهو وهي وفي ومن الا انما لما عند بين".split()
)


def quran_index(path):
    data = json.load(open(path, encoding="utf-8"))["data"]["surahs"]
    ayahs = [norm(a["text"]) for s in data for a in s["ayahs"]]
    return " | " + " | ".join(ayahs) + " | ", {w for a in ayahs for w in a.split()}


def quran_phrases(raw_pages, corpus, vocab):
    """Per page: parenthesised segments that are verbatim Quran wording.

    A segment is kept only if it is found verbatim in the Quran text, so the
    index holds Quran wording only, never the commentary.
    """
    out = []
    for num in sorted(raw_pages):
        # Windows OCR emits each RTL line with its words in reverse order.
        lines = [" ".join(reversed(l.split())) for l in raw_pages[num].split("\n")]
        seen = []
        for seg in re.split(r"[()]", " ".join(lines)):
            words = norm(seg).split()
            if not words or len(words) > 10:
                continue
            best = []
            for i in range(len(words)):
                j = i + 1
                while j <= len(words) and (" " + " ".join(words[i:j]) + " ") in corpus:
                    j += 1
                if j - 1 - i > len(best):
                    best = words[i:j - 1]
            if len(best) == 1 and (len(best[0]) < 4 or best[0] not in vocab or len(words) > 2):
                continue
            if all(w in STOP or len(w) < 3 for w in best):
                continue
            phrase = " ".join(best)
            if phrase and phrase not in seen:
                seen.append(phrase)
        keep = [p for p in seen if not any(p != o and (" " + p + " ") in (" " + o + " ") for o in seen)]
        out.extend([num, p] for p in keep)
    return out


def main():
    matn_dir, ocr_dir, out_dir = sys.argv[1:4]
    quran_path = sys.argv[4] if len(sys.argv) > 4 else None
    verses = load_matn(matn_dir)
    pages = load_pages(ocr_dir)
    assigned, toks = assign_pages(verses, pages)
    weak = 0
    for v, p, tk in zip(verses, assigned, toks):
        v["p"] = p
        if score(tk, pages[p]) < 0.4:
            weak += 1
    json.dump(verses, open(os.path.join(out_dir, "verses.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    with open(os.path.join(out_dir, "data.js"), "w", encoding="utf-8") as fh:
        fh.write("window.SHATIBIYYAH=" + json.dumps(verses, ensure_ascii=False, separators=(",", ":")) + ";\n")
        if quran_path:
            corpus, vocab = quran_index(quran_path)
            qw = quran_phrases(load_raw_pages(ocr_dir), corpus, vocab)
            fh.write("window.QWORDS=" + json.dumps(qw, ensure_ascii=False, separators=(",", ":")) + ";\n")
            print("quran phrases", len(qw))
    print("verses", len(verses), "pages", len(pages), "weak", weak)


if __name__ == "__main__":
    main()
