/// <reference path="../pb_data/types.d.ts" />

// Add anchor_day to subscriptions.
//
// Rolling a charge date forward by whole months has to remember the day the
// subscription actually bills on. Clamping alone is lossy: the 31st clamps to
// the 28th in February and then stays on the 28th forever. anchor_day keeps the
// intended day-of-month so every roll clamps from the original, not from the
// last clamped result.
migrate((app) => {
  const col = app.findCollectionByNameOrId("subscriptions")
  col.fields.add(new NumberField({
    name: "anchor_day",
    min: 1,
    max: 31,
    onlyInt: true
  }))
  app.save(col)
}, (app) => {
  const col = app.findCollectionByNameOrId("subscriptions")
  col.fields.removeByName("anchor_day")
  app.save(col)
})
