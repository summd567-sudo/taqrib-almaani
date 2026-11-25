"""Audit (and optionally repair) the verse -> page mapping of one book.

Usage: python tools/audit_pages.py <ocr_txt_dir> <key> [--fix] [--set N=PAGE ...]

A verse is "strong" when most of its words are found verbatim on its page.
For the others the page is only known to lie between the pages of the nearest
strong neighbours; this script re-scores those candidate pages with character
4-grams (robust to the OCR gluing/splitting words of the vocalised verse line)
and reports, or with --fix applies, the best candidate.
--set forces a page for a verse after a manual look at the scan.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import build_data as b  # noqa: E402

HEAD = "window.SHATIBIYYAH="


def grams(s, n=4):
    s = s.replace(" ", "")
    return {s[i:i + n] for i in range(len(s) - n + 1)}


def main():
    ocr_dir, key = sys.argv[1:3]
    fix = "--fix" in sys.argv
    forced = {}
    if "--set" in sys.argv:
        for item in sys.argv[sys.argv.index("--set") + 1:]:
            if "=" in item:
                n, p = item.split("=")
                forced[int(n)] = int(p)
    path = os.path.join(os.path.dirname(__file__), "..", "data", "data.js")
    # Pages confirmed by hand are remembered and re-applied on every run, so a
    # later audit never moves a verse that was checked against the scan.
    opath = os.path.join(os.path.dirname(__file__), "..", "data", "page_overrides.json")
    overrides = json.load(open(opath, encoding="utf-8")) if os.path.exists(opath) else {}
    saved = {int(n): pg for n, pg in overrides.get(key, {}).items()}
    saved.update(forced)
    forced = saved
    lines = open(path, encoding="utf-8").read().split("\n")
    idx = next(i for i, l in enumerate(lines) if l.startswith(HEAD))
    vs = json.loads(lines[idx][len(HEAD):].rstrip(";"))
    pages = b.load_pages(ocr_dir)
    pg = {p: grams(t) for p, t in pages.items()}

    def tok(v):
        return [t for t in b.norm(v["a"] + " " + v["b"]).split() if len(t) >= 4]

    def gscore(v, p):
        g = grams(b.norm(v["a"] + " " + v["b"]))
        return len(g & pg[p]) / max(1, len(g)) if p in pg else 0.0

    strong = [b.score(tok(v), pages[v[key]]) >= 0.4 for v in vs]
    changed, unsure = 0, []
    for i, v in enumerate(vs):
        if v["n"] in forced:
            if v[key] != forced[v["n"]]:
                changed += 1
            v[key] = forced[v["n"]]
            continue
        if strong[i]:
            continue
        j = i - 1
        while j >= 0 and not strong[j]:
            j -= 1
        k = i + 1
        while k < len(vs) and not strong[k]:
            k += 1
        lo = vs[j][key] if j >= 0 else v[key]
        hi = vs[k][key] if k < len(vs) else v[key]
        cand = sorted(((gscore(v, p), p) for p in range(lo, hi + 1)), reverse=True)
        best, second = cand[0], (cand[1] if len(cand) > 1 else (0.0, None))
        sure = lo == hi or (best[0] >= 0.3 and best[0] - second[0] >= 0.12)
        if not sure:
            unsure.append((v["n"], v[key], lo, hi, [(p, round(s, 2)) for s, p in cand]))
            continue
        if best[1] != v[key]:
            changed += 1
            print("move", v["n"], v[key], "->", best[1], [(p, round(s, 2)) for s, p in cand])
            v[key] = best[1]
    # keep the mapping monotone
    for i in range(1, len(vs)):
        assert vs[i][key] >= vs[i - 1][key], ("not monotone", vs[i]["n"], vs[i - 1][key], vs[i][key])
    print("strong", sum(strong), "of", len(vs), "| changed", changed, "| still unsure", len(unsure))
    for u in unsure:
        print("unsure", *u)
    if fix:
        lines[idx] = HEAD + json.dumps(vs, ensure_ascii=False, separators=(",", ":")) + ";"
        open(path, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
        overrides[key] = {str(n): forced[n] for n in sorted(forced)}
        open(opath, "w", encoding="utf-8", newline="\n").write(json.dumps(overrides, indent=1) + "\n")
        print("written")


if __name__ == "__main__":
    main()
