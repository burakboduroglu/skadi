/// <reference path="../pb_data/types.d.ts" />

// Subscription tracker routes and record hooks.
// Helpers live in lib/subs.js and are required inside each handler, because a
// hook callback cannot see its own file's top-level scope.

// GET /api/subs/summary
//
// Everything the Glance widget needs, pre-computed, so the Go template stays a
// dumb renderer. Intentionally unauthenticated: Caddy returns 404 for
// /api/subs/* on the public path, and Glance reaches PocketBase directly on
// 127.0.0.1:8090, so this route has no route to the outside world.
routerAdd("GET", "/api/subs/summary", (e) => {
  const lib = require(`${__hooks}/lib/subs.js`)

  const fx = lib.rates(e.app)
  const records = e.app.findRecordsByFilter(
    "subscriptions",
    "status = 'active'",
    "next_charge",
    500,
    0
  )

  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  let monthlyGross = 0
  let monthlyCashback = 0
  let unconverted = 0
  const upcoming = []

  for (const r of records) {
    const currency = r.getString("currency")
    const cycle = r.getString("cycle")
    const amount = r.getFloat("amount")
    const cashback = r.getFloat("cashback")

    const amountTRY = lib.toTRY(amount, currency, fx.rates)
    const cashbackTRY = lib.toTRY(cashback, currency, fx.rates)

    if (amountTRY === null) {
      // A missing rate must not quietly count as zero.
      unconverted++
    } else {
      monthlyGross += lib.monthly(amountTRY, cycle)
      monthlyCashback += lib.monthly(cashbackTRY || 0, cycle)
    }

    const rawDate = r.getString("next_charge")
    let days = null
    if (rawDate) {
      const d = new Date(rawDate.replace(" ", "T"))
      if (!isNaN(d.getTime())) {
        const chargeDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
        days = Math.round((chargeDay - today) / 86400000)
      }
    }

    if (days !== null && days <= 45) {
      upcoming.push({
        id: r.id,
        name: r.getString("name"),
        logo: r.getString("logo_url"),
        amount: amount,
        currency: currency,
        amount_try: amountTRY,
        cashback: cashback,
        cycle: cycle,
        days: days,
        overdue: days < 0
      })
    }
  }

  upcoming.sort((a, b) => a.days - b.days)

  return e.json(200, {
    currency: "TRY",
    monthly_gross: Math.round(monthlyGross * 100) / 100,
    monthly_cashback: Math.round(monthlyCashback * 100) / 100,
    monthly_net: Math.round((monthlyGross - monthlyCashback) * 100) / 100,
    yearly_net: Math.round((monthlyGross - monthlyCashback) * 12 * 100) / 100,
    active_count: records.length,
    unconverted: unconverted,
    fx_date: fx.date ? fx.date.substring(0, 10) : null,
    fx_stale: fx.stale,
    upcoming: upcoming
  })
})

// GET /api/subs/rates
//
// The entry form needs the same rates the widget uses. It cannot call Yahoo
// itself - Yahoo sends no CORS headers - and having the browser use a second
// FX source would let the form and the dashboard disagree about the same total.
// Superuser-only, so this one stays reachable from outside.
routerAdd("GET", "/api/subs/rates", (e) => {
  const fx = require(`${__hooks}/lib/subs.js`).rates(e.app)
  return e.json(200, {
    base: "TRY",
    rates: fx.rates,
    date: fx.date ? fx.date.substring(0, 10) : null,
    stale: fx.stale
  })
}, $apis.requireSuperuserAuth())

// Resolve a Google Play link to its icon whenever logo_url is left empty.
// The helper lives in lib because a hook callback runs in an isolated runtime
// and cannot reference a function defined at the top level of this file.
onRecordCreateRequest((e) => {
  require(`${__hooks}/lib/subs.js`).applyLogo(e.record)
  e.next()
}, "subscriptions")

onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/subs.js`).applyLogo(e.record)
  e.next()
}, "subscriptions")
