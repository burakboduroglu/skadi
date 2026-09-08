#!/usr/bin/env python3
"""Place the subscriptions widget in the Services page's left-hand column.

The block is fenced with sentinel comments, so a re-run replaces it wherever it
currently sits - including moving it off the Home page, where it lived first.
Anchored on the first 'size: full' column that follows the Services page header,
which is the end of that page's small column.
"""
import datetime
import pathlib
import shutil
import sys

PATH = pathlib.Path("/etc/glance/glance.yml")
PAGE = "  - name: Services"
COLUMN_END = "      - size: full"
OPEN = "          # >>> subs-tracker (managed, do not hand-edit) >>>"
CLOSE = "          # <<< subs-tracker <<<"
FORM = "https://bbp.burakboduroglu.com.tr/subs/"

# One source for the widget: the shipped widget.yml, read from beside this
# script. An inline second copy would drift the moment either was edited.
WIDGET = (pathlib.Path(__file__).resolve().parent.parent / "glance" / "widget.tr.yml").read_text()
WIDGET = "\n".join(
    l for l in WIDGET.splitlines() if not l.lstrip().startswith("#") or l.startswith("          #")
).strip("\n").replace("__SKADI_URL__", FORM)

text = PATH.read_text()
lines = text.splitlines()

# Strip a previous managed block wherever it is, so a re-run relocates rather
# than duplicating.
if OPEN in lines:
    start = lines.index(OPEN)
    if CLOSE not in lines[start:]:
        sys.exit("found an opening sentinel with no closing one - not touching the file")
    end = lines.index(CLOSE, start)
    del lines[start : end + 1]
    while start < len(lines) and lines[start].strip() == "":
        del lines[start]

pages = [i for i, ln in enumerate(lines) if ln == PAGE]
if len(pages) != 1:
    sys.exit(f"expected exactly one '{PAGE}' line, found {len(pages)} - not touching the file")

ends = [i for i, ln in enumerate(lines) if ln == COLUMN_END and i > pages[0]]
if not ends:
    sys.exit(f"no '{COLUMN_END}' after the Services page - not touching the file")

i = ends[0]
block = ["", OPEN] + WIDGET.split("\n") + [CLOSE, ""]
lines[i:i] = block

new = "\n".join(lines) + "\n"
if new == text:
    print("already up to date, nothing written")
    sys.exit(0)

# with_suffix would *replace* .yml rather than append, leaving glance.bak-*
# sitting next to the real config. Append to the full name instead.
backup = PATH.with_name(f"{PATH.name}.bak-{datetime.datetime.now():%Y%m%d-%H%M%S}")
shutil.copy2(PATH, backup)
PATH.write_text(new)
print(f"backed up to {backup}")
print(f"inserted {len(block)} lines before line {i + 1} (Services page, small column)")
