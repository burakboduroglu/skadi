/// <reference path="../../pb_data/types.d.ts" />

// Shared helpers for the subscription tracker.
//
// PocketBase runs every hook callback in a pooled, isolated JS runtime, so a
// handler cannot close over anything defined at the top level of its own file.
// Everything reusable therefore lives here and is pulled in with
// require(`${__hooks}/lib/subs.js`) from *inside* each handler.

const CYCLE_MONTHS = { weekly: 12 / 52, monthly: 1, quarterly: 3, yearly: 12 }

// How many months one billing cycle covers. Anything unrecognised is treated as
// monthly rather than dropped, so a bad value never silently removes a cost.
function cycleMonths(cycle) {
  return CYCLE_MONTHS[cycle] || 1
}

// Normalise a per-cycle amount to a per-month amount.
function monthly(amount, cycle) {
  return (amount || 0) / cycleMonths(cycle)
}

// --- dates ----------------------------------------------------------------

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function startOfTodayUTC() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

function parseDate(raw) {
  if (!raw) return null
  const d = new Date(String(raw).replace(" ", "T"))
  return isNaN(d.getTime()) ? null : d
}

function toPbDate(year, month, day) {
  const pad = (n) => (n < 10 ? "0" + n : "" + n)
  return year + "-" + pad(month + 1) + "-" + pad(day) + " 00:00:00.000Z"
}

// Advance every active subscription whose charge date has passed to its next
// one. Without this a monthly subscription reads "gecikmiş" forever after the
// first cycle, because nothing else ever moves the date.
//
// Month steps clamp against anchor_day rather than against the previous date:
// a subscription billing on the 31st would otherwise clamp to the 28th in
// February and stay there for good.
function rollForward(app) {
  let records
  try {
    records = app.findRecordsByFilter("subscriptions", "status = 'active'", "next_charge", 500, 0)
  } catch (err) {
    return 0
  }

  const today = startOfTodayUTC()
  let moved = 0

  for (const r of records) {
    const d = parseDate(r.getString("next_charge"))
    if (!d) continue

    let year = d.getUTCFullYear()
    let month = d.getUTCMonth()
    let day = d.getUTCDate()
    if (Date.UTC(year, month, day) >= today) continue

    const cycle = r.getString("cycle")
    const anchor = r.getInt("anchor_day") || day

    // The guard stops a malformed record from spinning forever; 600 steps is
    // more than a decade of weekly charges.
    let guard = 0
    while (Date.UTC(year, month, day) < today && guard++ < 600) {
      if (cycle === "weekly") {
        const next = new Date(Date.UTC(year, month, day + 7))
        year = next.getUTCFullYear()
        month = next.getUTCMonth()
        day = next.getUTCDate()
      } else {
        month += cycle === "yearly" ? 12 : cycle === "quarterly" ? 3 : 1
        year += Math.floor(month / 12)
        month = ((month % 12) + 12) % 12
        day = Math.min(anchor, daysInMonth(year, month))
      }
    }

    if (guard >= 600) {
      console.log("[subs] roll-forward gave up on " + r.id)
      continue
    }

    r.set("next_charge", toPbDate(year, month, day))
    try {
      app.save(r)
      moved++
    } catch (err) {
      console.log("[subs] roll-forward save failed for " + r.id + ": " + err)
    }
  }

  return moved
}

// --- fx -------------------------------------------------------------------

// FX comes from Yahoo Finance, the same source Glance's `markets` widget already
// uses on this box - one fewer third party to depend on - and it quotes the TRY
// pairs directly, so no cross-rate arithmetic is needed.
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/"
const FX_SYMBOLS = { USD: "USDTRY=X", EUR: "EURTRY=X", GBP: "GBPTRY=X" }
const FX_MAX_AGE_MS = 6 * 60 * 60 * 1000
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// Rates are stored as TRY per one unit of the currency, so TRY is always 1.
function fetchRates() {
  const out = { TRY: 1 }
  for (const cur in FX_SYMBOLS) {
    const res = $http.send({
      url: YAHOO_CHART + FX_SYMBOLS[cur] + "?range=1d&interval=1d",
      method: "GET",
      timeout: 20,
      headers: { "User-Agent": BROWSER_UA }
    })
    if (res.statusCode !== 200) {
      throw new Error("fx: " + FX_SYMBOLS[cur] + " returned " + res.statusCode)
    }
    const result = res.json && res.json.chart && res.json.chart.result
    const price = result && result[0] && result[0].meta && result[0].meta.regularMarketPrice
    if (!price) {
      throw new Error("fx: no price for " + FX_SYMBOLS[cur])
    }
    out[cur] = price
  }
  return out
}

// A json field does not come back from the record as a parsed object, so the
// cached rates have to be decoded before they can be indexed. Reading them raw
// made every non-TRY amount unconvertible, but only when served from cache -
// a fresh fetch returns a real object and worked, which is why the failure
// looked intermittent.
function readRates(rec) {
  const raw = rec.get("rates")
  if (!raw) return null
  if (typeof raw === "object") return raw
  try {
    return JSON.parse(typeof raw === "string" ? raw : toString(raw))
  } catch (err) {
    console.log("[subs] cached rates unreadable: " + err)
    return null
  }
}

// Read the cached rates, refreshing them when older than six hours.
//
// A failed refresh is never fatal: the last good rates are returned with
// stale=true so the widget can say so. Showing a stale rate as if it were
// today's is the one outcome worth avoiding.
function rates(app) {
  let rec = null
  try {
    rec = app.findFirstRecordByFilter("fx_rates", "base = 'TRY'")
  } catch (err) {
    rec = null
  }

  const now = new Date()
  const fetchedAt = rec ? parseDate(rec.getString("fetched")) : null
  const fresh = fetchedAt && (now.getTime() - fetchedAt.getTime()) < FX_MAX_AGE_MS
  if (rec && fresh) {
    const cached = readRates(rec)
    // An unreadable cache is treated as no cache, so it refetches rather than
    // silently reporting every foreign amount as unconvertible.
    if (cached) return { rates: cached, date: rec.getString("fetched"), stale: false }
  }

  try {
    const fetched = fetchRates()

    if (!rec) {
      const col = app.findCollectionByNameOrId("fx_rates")
      rec = new Record(col)
      rec.set("base", "TRY")
    }
    rec.set("rates", fetched)
    rec.set("fetched", now.toISOString().replace("T", " ").substring(0, 19) + "Z")
    app.save(rec)

    // Exactly one row, always. The cache is updated in place rather than
    // appended to, and this sweeps anything left over - the first version of
    // this hook cached under base 'EUR' before the move to Yahoo.
    try {
      const extras = app.findRecordsByFilter("fx_rates", "id != {:keep}", "", 50, 0, { keep: rec.id })
      for (const extra of extras) app.delete(extra)
    } catch (err) {
      console.log("[subs] fx cleanup skipped: " + err)
    }

    return { rates: fetched, date: rec.getString("fetched"), stale: false }
  } catch (err) {
    console.log("[subs] fx refresh failed: " + err)
    const cached = rec ? readRates(rec) : null
    if (cached) {
      return { rates: cached, date: rec.getString("fetched"), stale: true }
    }
    // Nothing cached and nothing fetched: refuse to invent a rate.
    return { rates: null, date: null, stale: true }
  }
}

// Convert an amount into TRY. Returns null when the conversion cannot be done,
// so callers can report "unknown" instead of silently counting it as zero.
function toTRY(amount, currency, fx) {
  if (currency === "TRY") return amount
  if (!fx || !fx[currency]) return null
  return amount * fx[currency]
}

// --- link resolution ----------------------------------------------------

// Turn whatever link the user pasted into a logo and, where possible, a name.
//
// Three cases, in order, because the first two would be misread by the third:
//   1. A Wikimedia file link. The "#/media/File:X.svg" fragment never reaches a
//      server, so the page fetch alone cannot see which file was meant - but the
//      pasted string still carries it, and the MediaWiki API resolves it to a
//      rendered thumbnail (SVGs come back as PNG, which every browser draws).
//   2. A direct image URL, detected from the response's own content type rather
//      than from its extension, so an extensionless CDN link still works.
//   3. Anything else: read og:image and og:title out of the HTML.
const WIKI_FILE = /(?:File|Dosya|Datei):([^#?&/]+\.(?:svg|png|jpe?g|gif|webp))/i
const WIKI_HOST = /https?:\/\/([a-z0-9-]+\.(?:wikipedia|wikimedia)\.org)/i

function wikimediaFile(url) {
  const file = url.match(WIKI_FILE)
  if (!file) return null

  const host = (url.match(WIKI_HOST) || [null, "en.wikipedia.org"])[1]
  const api = "https://" + host + "/w/api.php?action=query&format=json" +
    "&prop=imageinfo&iiprop=url&iiurlwidth=256&titles=File:" + encodeURIComponent(file[1])

  const res = $http.send({ url: api, method: "GET", timeout: 20, headers: { "User-Agent": BROWSER_UA } })
  if (res.statusCode !== 200) return null

  const pages = res.json && res.json.query && res.json.query.pages
  for (const key in pages) {
    const info = pages[key].imageinfo
    if (info && info[0]) return info[0].thumburl || info[0].url || null
  }
  return null
}

function headerValue(headers, name) {
  if (!headers) return ""
  const direct = headers[name] || headers[name.toLowerCase()]
  if (!direct) return ""
  return Array.isArray(direct) ? (direct[0] || "") : String(direct)
}

// Strip the site's own name off a page title: "Hetzner - Wikipedia" is a name
// for a subscription, "Hetzner" is.
function cleanTitle(raw) {
  if (!raw) return null
  return raw
    .replace(/\s*[-–|]\s*(Apps on )?Google Play\s*$/i, "")
    .replace(/\s*[-–|]\s*Wikipedia\s*$/i, "")
    .trim() || null
}

function resolveLink(url) {
  if (!url) return null
  try {
    const fromWiki = wikimediaFile(url)
    if (fromWiki) return { icon: fromWiki, title: null }

    const res = $http.send({
      url: url,
      method: "GET",
      timeout: 25,
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" }
    })
    if (res.statusCode !== 200) return null

    if (headerValue(res.headers, "Content-Type").indexOf("image/") === 0) {
      return { icon: url, title: null }
    }

    const html = toString(res.body)
    const icon = html.match(/<meta property="og:image" content="([^"]+)"/)
    const title = html.match(/<meta property="og:title" content="([^"]+)"/)

    let iconUrl = icon ? icon[1] : null
    // Play's og:image carries a size suffix like "=s0-br30"; pin it to one size.
    if (iconUrl && iconUrl.indexOf("play-lh.googleusercontent.com") !== -1) {
      iconUrl = iconUrl.replace(/=[^=\/]*$/, "=s256")
    }

    return { icon: iconUrl, title: cleanTitle(title ? title[1] : null) }
  } catch (err) {
    console.log("[subs] link resolve failed: " + err)
    return null
  }
}

// Fill in what the link can supply and keep anchor_day in step with the charge
// date. Wrapped so a markup change or a network blip degrades to "no logo"
// instead of failing the save the user is trying to make.
function applyDerived(record) {
  try {
    // The link is authoritative for the logo: re-resolved on every save, so
    // pasting a better link is how you fix a wrong logo. A failed lookup leaves
    // the existing logo alone rather than clearing it.
    // The name is only ever filled in when blank - a name typed by hand outranks
    // whatever a page calls itself.
    const link = record.getString("vendor_url")
    if (link) {
      const meta = resolveLink(link)
      if (meta) {
        if (meta.icon) record.set("logo_url", meta.icon)
        if (meta.title && !record.getString("name")) record.set("name", meta.title)
      }
    }

    // anchor_day always tracks the date the user actually typed, so editing the
    // charge date re-anchors the monthly roll.
    const d = parseDate(record.getString("next_charge"))
    if (d) record.set("anchor_day", d.getUTCDate())
  } catch (err) {
    console.log("[subs] derived fields skipped: " + err)
  }
}

module.exports = {
  cycleMonths, monthly, rates, toTRY, resolveLink, applyDerived, rollForward,
  parseDate, startOfTodayUTC
}
