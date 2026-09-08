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

WIDGET = '''          - type: custom-api
            title: Abonelikler
            title-url: ''' + FORM + '''
            cache: 30m
            url: http://127.0.0.1:8090/api/subs/summary
            template: |
              <div class="flex justify-between text-center margin-bottom-15">
                <div>
                  <div class="color-highlight size-h3">{{ printf "%.0f" (.JSON.Float "monthly_net") }} ₺</div>
                  <div class="size-h6">AYLIK NET</div>
                </div>
                <div>
                  <div class="size-h3">{{ printf "%.0f" (.JSON.Float "yearly_net") }} ₺</div>
                  <div class="size-h6">YILLIK</div>
                </div>
                <div>
                  <div class="size-h3 color-positive">{{ printf "%.0f" (.JSON.Float "monthly_cashback") }} ₺</div>
                  <div class="size-h6">CASHBACK</div>
                </div>
              </div>

              {{ $upcoming := .JSON.Array "upcoming" }}
              {{ if $upcoming }}
              <ul class="list list-gap-10 collapsible-container" data-collapse-after="5">
                {{ range $upcoming }}
                <li class="flex items-center gap-10">
                  {{ $logo := .String "logo" }}
                  {{ if $logo }}
                  <img class="shrink-0" src="{{ $logo }}" alt="" loading="lazy"
                       style="width: 24px; height: 24px; object-fit: contain; border-radius: 5px">
                  {{ end }}
                  <div class="grow text-truncate">
                    <div class="text-truncate">{{ .String "name" }}</div>
                    <div class="size-h6">
                      {{ $d := .Int "days" }}
                      {{ if .Bool "overdue" }}<span class="color-negative">gecikmiş</span>
                      {{ else if eq $d 0 }}<span class="color-negative">bugün</span>
                      {{ else if le $d 3 }}<span class="color-highlight">{{ $d }} gün</span>
                      {{ else }}{{ $d }} gün{{ end }}
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div>{{ printf "%.0f" (.Float "amount") }} {{ .String "currency" }}</div>
                    {{ if gt (.Float "cashback") 0.0 }}
                    <div class="size-h6 color-positive">−{{ printf "%.0f" (.Float "cashback") }}</div>
                    {{ end }}
                  </div>
                </li>
                {{ end }}
              </ul>
              {{ else }}
              <p class="size-h6 color-subdue">45 gün içinde ödeme yok.</p>
              {{ end }}

              {{ if .JSON.Bool "fx_stale" }}
              <p class="size-h6 color-negative margin-top-10">
                Kur güncellenemedi{{ if .JSON.String "fx_date" }} — {{ .JSON.String "fx_date" }} kuru kullanıldı{{ end }}
              </p>
              {{ end }}
              {{ if gt (.JSON.Int "unconverted") 0 }}
              <p class="size-h6 color-negative margin-top-5">
                {{ .JSON.Int "unconverted" }} kayıt kur bulunamadığı için toplama dahil edilmedi.
              </p>
              {{ end }}

              <p class="margin-top-15 text-right">
                <a href="''' + FORM + '''?add=1" class="color-highlight size-h6">+ Abonelik ekle</a>
              </p>'''

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
