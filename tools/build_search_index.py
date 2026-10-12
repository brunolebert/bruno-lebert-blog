#!/usr/bin/env python3
"""Index déterministe construit exclusivement depuis le HTML du BLOG."""
from pathlib import Path
from html.parser import HTMLParser
import unicodedata
import json
import re
import sys
import hashlib
import gzip

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "search-index.json"
EXCLUDED = {"script", "style", "svg", "noscript", "template"}

def norm(value):
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = value.lower().replace("œ", "oe").replace("æ", "ae")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value)).strip()

class Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = []
        self.capture = []
        self.current = None
        self.title = ""
        self.description = ""
        self.robots = ""
        self.canonical = ""
        self.headings = {"h1": [], "h2": [], "h3": []}
        self.visible = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in EXCLUDED:
            self.skip.append(tag)
        if tag == "meta":
            name = (attrs.get("name") or "").lower()
            if name == "description":
                self.description = attrs.get("content", "")
            if name == "robots":
                self.robots = attrs.get("content", "").lower()
        if tag == "link" and attrs.get("rel", "").lower() == "canonical":
            self.canonical = attrs.get("href", "")
        if tag in ("title", "h1", "h2", "h3"):
            self.capture.append([tag, []])

    def handle_endtag(self, tag):
        if self.skip and self.skip[-1] == tag:
            self.skip.pop()
        if self.capture and self.capture[-1][0] == tag:
            kind, parts = self.capture.pop()
            text = " ".join(" ".join(parts).split())
            if kind == "title":
                self.title = text
            elif text:
                self.headings[kind].append(text)

    def handle_data(self, data):
        if self.skip:
            return
        data = " ".join(data.split())
        if not data:
            return
        if self.capture:
            self.capture[-1][1].append(data)
        if not self.capture or self.capture[-1][0] != "title":
            self.visible.append(data)

def create():
    pages = sorted(
        p for p in ROOT.rglob("*.html")
        if ".git" not in p.parts
        and not any(x.startswith(".") for x in p.relative_to(ROOT).parts)
    )
    entries = []
    omitted = []

    for path in pages:
        parser = Extractor()
        parser.feed(path.read_text(encoding="utf-8", errors="replace"))
        rel = path.relative_to(ROOT).as_posix()
        if "noindex" in parser.robots or not parser.title:
            omitted.append(rel)
            continue

        url = "/" if rel == "index.html" else "/" + rel

        # Les champs de recherche proviennent du HTML réel.
        body = norm(" ".join(parser.visible))
        headings = {
            name: list(dict.fromkeys(parser.headings[name]))[:80]
            for name in ("h1", "h2", "h3")
        }

        entries.append({
            "u": url,
            "t": parser.title,
            "d": parser.description,
            "h1": headings["h1"],
            "h2": headings["h2"],
            "h3": headings["h3"],
            "c": parser.canonical,
            "n": norm(" ".join([
                parser.title,
                parser.description,
                *headings["h1"],
                *headings["h2"],
                *headings["h3"]
            ])),
            "b": body
        })

    if len(entries) + len(omitted) != len(pages):
        raise RuntimeError("COUVERTURE_CORPUS_INCOMPLETE")

    result = {
        "schema": "blog-search-v1",
        "normalisation": "NFKD/minuscules/ponctuation-vers-espaces",
        "pages_analysees": len(pages),
        "pages_exclues": omitted,
        "entrees": entries
    }
    raw = json.dumps(
        result, ensure_ascii=False, sort_keys=True,
        separators=(",", ":")
    ).encode("utf-8")
    OUTPUT.write_bytes(raw)

    tests = [
        "Chave", "Boulevard Chave", "194 Boulevard Chave",
        "Vauban", "DPE", "copropriété", "plus-value",
        "estimation", "terrasse", "gestion locative"
    ]

    print("PAGES_ANALYSEES=" + str(len(pages)))
    print("PAGES_INDEXEES=" + str(len(entries)))
    print("PAGES_EXCLUES=" + str(len(omitted)))
    print("NOMBRE_ENTREES=" + str(len(entries)))
    print("TAILLE_INDEX_OCTETS=" + str(len(raw)))
    print("TAILLE_GZIP_ESTIMEE=" + str(len(gzip.compress(raw))))
    print("SHA256=" + hashlib.sha256(raw).hexdigest())

    for term in tests:
        q = norm(term)
        matches = [
            e for e in entries
            if q in e["n"] or q in e["b"]
        ]
        matches.sort(key=lambda e: (
            -(10 if q in norm(e["t"]) else
               5 if q in e["n"] else 1),
            e["u"]
        ))
        key = norm(term).replace(" ", "_").upper()
        print(
            "TEST_" + key + "=" +
            ("OUI" if matches else "NON") +
            "|MATCHES=" + str(len(matches)) +
            "|DESTINATION=" +
            (matches[0]["u"] if matches else "AUCUNE")
        )

if __name__ == "__main__":
    create()
