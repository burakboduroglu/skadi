/// <reference path="../pb_data/types.d.ts" />

// A `cards` collection so payment methods are picked, not typed.
//
// payment_method stays a text field on subscriptions rather than becoming a
// relation: the values already stored are text, and a relation migration would
// have to rewrite them in place. The form offers this list as a dropdown, which
// is what actually prevents "visa" and "Visa" becoming two things.
migrate((app) => {
  const cards = new Collection({
    name: "cards",
    type: "base",
    fields: [
      { name: "name", type: "text", required: true, max: 60 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_cards_name ON cards (name)"]
  })
  app.save(cards)

  const seen = {}
  const add = (raw) => {
    const name = (raw || "").trim()
    const key = name.toLowerCase()
    if (!name || seen[key]) return
    seen[key] = true
    const rec = new Record(cards)
    rec.set("name", name)
    app.save(rec)
  }

  // Backfill whatever is already on the subscriptions, so no existing value is
  // stranded outside the list the form can offer. A fresh install starts with
  // an empty list; cards are added from the form.
  try {
    const subs = app.findRecordsByFilter("subscriptions", "payment_method != ''", "", 500, 0)
    for (const s of subs) add(s.getString("payment_method"))
  } catch (err) {
    console.log("[subs] card backfill skipped: " + err)
  }
}, (app) => {
  app.delete(app.findCollectionByNameOrId("cards"))
})
