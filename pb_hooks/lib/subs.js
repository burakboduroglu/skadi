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
    return { rates: rec.get("rates"), date: rec.getString("fetched"), stale: false }
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

    return { rates: fetched, date: rec.getString("fetched"), stale: false }
  } catch (err) {
    console.log("[subs] fx refresh failed: " + err)
    if (rec && rec.get("rates")) {
      return { rates: rec.get("rates"), date: rec.getString("fetched"), stale: true }
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

// --- google play ----------------------------------------------------------

// Read a Google Play listing's name and icon.
//
// The icon comes from og:image with a size suffix like "=s0-br30", rewritten to
// "=s256" so one predictable size is stored. These play-lh URLs are
// content-addressed - a vendor that rebrands uploads a new icon at a new URL and
// the old one keeps resolving - so linking is durable here in a way that linking
// to a vendor's own site would not be.
function playMeta(url) {
  if (!url || url.indexOf("play.google.com") === -1) return null
  try {
    const res = $http.send({
      url: url,
      method: "GET",
      timeout: 20,
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" }
    })
    if (res.statusCode !== 200) return null

    const html = toString(res.body)
    const icon = html.match(/<meta property="og:image" content="([^"]+)"/)
    const title = html.match(/<meta property="og:title" content="([^"]+)"/)

    return {
      icon: icon ? icon[1].replace(/=[^=\/]*$/, "=s256") : null,
      title: title ? title[1].replace(/\s*[-–]\s*(Apps on )?Google Play\s*$/i, "").trim() : null
    }
  } catch (err) {
    console.log("[subs] play lookup failed: " + err)
    return null
  }
}

// Fill in what the Play listing can supply and keep anchor_day in step with the
// charge date. Wrapped so a Play markup change or a network blip degrades to
// "no logo" instead of failing the save the user is trying to make.
const IMAGE_URL = /\.(png|jpe?g|webp|svg|gif|avif)(\?|#|$)/i

function applyDerived(record) {
  try {
    let needsLogo = !record.getString("logo_url")
    const needsName = !record.getString("name")

    // A direct image URL pasted into the link field is a logo, not a vendor
    // page. Accepting it here means it works from any entry path, not just from
    // the one field on the form that happens to be labelled "logo".
    const vendor = record.getString("vendor_url")
    if (needsLogo && vendor && IMAGE_URL.test(vendor)) {
      record.set("logo_url", vendor)
      needsLogo = false
    }

    if (needsLogo || needsName) {
      const meta = playMeta(record.getString("vendor_url"))
      if (meta) {
        if (needsLogo && meta.icon) record.set("logo_url", meta.icon)
        if (needsName && meta.title) record.set("name", meta.title)
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
  cycleMonths, monthly, rates, toTRY, playMeta, applyDerived, rollForward,
  parseDate, startOfTodayUTC
}
