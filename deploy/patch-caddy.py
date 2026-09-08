#!/usr/bin/env python3
"""Add the private-route 404 for /api/subs/summary to the bbp site block.

Idempotent: running it twice leaves one copy of the directive. Written as a
script rather than a sed one-liner because this terminal has duplicated pasted
blocks before and converts tabs to spaces, both of which make an in-place sed
edit land somewhere unintended and still exit 0.
"""
import datetime
import pathlib
import shutil
import sys

PATH = pathlib.Path("/etc/caddy/Caddyfile")
ANCHOR = "redir / /_/ 302"
DIRECTIVE = "respond /api/subs/summary 404"
COMMENT = "# Private route: Glance reads this on loopback, nobody else may."

text = PATH.read_text()
lines = text.splitlines()

# Drop any previous copy of the directive and its comment, so a re-run is a no-op.
cleaned = [ln for ln in lines if DIRECTIVE not in ln and COMMENT not in ln]

anchors = [i for i, ln in enumerate(cleaned) if ANCHOR in ln]
if len(anchors) != 1:
    sys.exit(f"expected exactly one '{ANCHOR}' line, found {len(anchors)} - not touching the file")

i = anchors[0]
indent = cleaned[i][: len(cleaned[i]) - len(cleaned[i].lstrip())]
cleaned[i + 1 : i + 1] = ["", indent + COMMENT, indent + DIRECTIVE]

new = "\n".join(cleaned) + "\n"
if new == text:
    print("already up to date, nothing written")
    sys.exit(0)

# with_suffix would *replace* .yml rather than append, leaving glance.bak-*
# sitting next to the real config. Append to the full name instead.
backup = PATH.with_name(f"{PATH.name}.bak-{datetime.datetime.now():%Y%m%d-%H%M%S}")
shutil.copy2(PATH, backup)
PATH.write_text(new)
print(f"backed up to {backup}")
print("--- inserted ---")
for ln in cleaned[max(0, i - 1) : i + 4]:
    print(ln)
