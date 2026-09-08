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

// FX comes from Yahoo Finance, the same source Glance's `markets` widget already
// uses on this box - one fewer third party to depend on - and it quotes the TRY
// pairs directly, so no cross-rate arithmetic is needed.
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/"
const FX_SYMBOLS = { USD: "USDTRY=X", EUR: "EURTRY=X", GBP: "GBPTRY=X" }
const FX_MAX_AGE_MS = 6 * 60 * 60 * 1000
const FX_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// Rates are stored as TRY per one unit of the currency, so TRY is always 1.
function fetchRates() {
  const out = { TRY: 1 }
  for (const cur in FX_SYMBOLS) {
    const res = $http.send({
      url: YAHOO_CHART + FX_SYMBOLS[cur] + "?range=1d&interval=1d",
      method: "GET",
      timeout: 20,
      headers: { "User-Agent": FX_UA }
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
  let fetchedAt = null
  if (rec) {
    const raw = rec.getString("fetched")
    if (raw) {
      fetchedAt = new Date(raw.replace(" ", "T").replace("Z", "") + "Z")
    }
  }

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

const PLAY_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// Resolve a Google Play listing URL to its app icon on Google's CDN.
//
// The listing carries the icon as og:image with a size suffix like "=s0-br30";
// that suffix is rewritten to "=s256" so we store one predictable size. These
// play-lh URLs are content-addressed - a vendor that rebrands uploads a new
// icon at a new URL and the old one keeps resolving - so linking is durable
// here in a way that linking to a vendor's own site would not be.
function playIcon(url) {
  if (!url || url.indexOf("play.google.com") === -1) return null
  try {
    const res = $http.send({
      url: url,
      method: "GET",
      timeout: 20,
      headers: { "User-Agent": PLAY_UA, "Accept-Language": "en-US,en;q=0.9" }
    })
    if (res.statusCode !== 200) return null

    const html = toString(res.body)
    const m = html.match(/<meta property="og:image" content="([^"]+)"/)
    if (!m) return null

    return m[1].replace(/=[^=\/]*$/, "=s256")
  } catch (err) {
    console.log("[subs] play icon lookup failed: " + err)
    return null
  }
}

// Fill logo_url from a Google Play vendor_url when it was left empty.
// Wrapped so a Play markup change or a network blip degrades to "no logo"
// instead of failing the save the user is trying to make.
function applyLogo(record) {
  try {
    if (record.getString("logo_url")) return
    const icon = playIcon(record.getString("vendor_url"))
    if (icon) record.set("logo_url", icon)
  } catch (err) {
    console.log("[subs] logo resolve skipped: " + err)
  }
}

module.exports = { cycleMonths, monthly, rates, toTRY, playIcon, applyLogo }
