/// <reference path="../pb_data/types.d.ts" />

// Subscription tracker: two collections.
//   subscriptions - the contracts themselves
//   fx_rates      - a single-row daily cache of EUR-based rates
//
// Both collections deliberately have NULL API rules, which in PocketBase means
// "superuser only". Nothing is readable or writable with an anonymous or a
// regular-user token. The web form authenticates as a superuser; the Glance
// widget never touches the collection API at all, it reads the /api/subs/summary
// route which runs with $app privileges and is blocked at the Caddy layer.
migrate((app) => {
  const subs = new Collection({
    name: "subscriptions",
    type: "base",
    fields: [
      { name: "name", type: "text", required: true, max: 100 },
      { name: "category", type: "select", maxSelect: 1, values: [
        "Yazılım", "Medya", "Oyun", "Bulut", "Finans", "Sağlık", "Eğitim", "Diğer"
      ]},
      { name: "amount", type: "number", required: true, min: 0 },
      { name: "currency", type: "select", required: true, maxSelect: 1, values: [
        "TRY", "USD", "EUR", "GBP"
      ]},
      // Cashback is money that comes back on every charge, entered by hand and
      // expressed in the same currency as `amount`. It never expires on its own;
      // when a campaign changes, the number is edited.
      { name: "cashback", type: "number", min: 0 },
      { name: "cycle", type: "select", required: true, maxSelect: 1, values: [
        "weekly", "monthly", "quarterly", "yearly"
      ]},
      { name: "next_charge", type: "date", required: true },
      { name: "payment_method", type: "text", max: 60 },
      { name: "status", type: "select", required: true, maxSelect: 1, values: [
        "active", "paused", "cancelled"
      ]},
      // vendor_url accepts a Google Play link; a hook resolves the app icon from
      // it into logo_url on save. A direct image URL in logo_url is left alone.
      { name: "vendor_url", type: "url" },
      { name: "logo_url", type: "url" },
      { name: "notes", type: "text", max: 2000 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ],
    indexes: [
      "CREATE INDEX idx_subs_next_charge ON subscriptions (next_charge)",
      "CREATE INDEX idx_subs_status ON subscriptions (status)"
    ]
  })
  app.save(subs)

  const fx = new Collection({
    name: "fx_rates",
    type: "base",
    fields: [
      { name: "base", type: "text", required: true, max: 8 },
      { name: "rates", type: "json", maxSize: 20000 },
      { name: "fetched", type: "date", required: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ]
  })
  app.save(fx)
}, (app) => {
  // Down migration: drop both, newest first.
  for (const name of ["fx_rates", "subscriptions"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name))
    } catch (err) {
      // already gone
    }
  }
})
