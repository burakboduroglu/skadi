# subs-tracker

Subscription tracking on `penolox-server`, built on the PocketBase instance that
already serves `bbp.burakboduroglu.com.tr`. No new service, no new port, no
Docker, no extra backup target — `pb_data` is already covered by
`restore-kit.timer`.

## Shape

| Piece | Where | What it does |
|---|---|---|
| `pb_migrations/1788890841_subscriptions.js` | `/opt/pocketbase/pb_migrations/` | Creates `subscriptions` and `fx_rates`. Both have NULL API rules = superuser only. |
| `pb_hooks/lib/subs.js` | `/opt/pocketbase/pb_hooks/lib/` | Cycle math, FX cache, Google Play icon resolution. |
| `pb_hooks/subs.pb.js` | `/opt/pocketbase/pb_hooks/` | `GET /api/subs/summary`, `GET /api/subs/rates`, logo-resolving record hooks. |
| `pb_public/subs/index.html` | `/opt/pocketbase/pb_public/subs/` | The entry form, at `/subs/`. |
| `glance/subscriptions-widget.yml` | `/etc/glance/glance.yml` | Dashboard widget. |
| `glance/caddy-block.txt` | `/etc/caddy/Caddyfile` | 404s `/api/subs/summary` from the internet. |

## Security model

Two independent gates, either of which is sufficient:

1. **Cloudflare Access** on `/subs*` and `/api/collections/subscriptions*`,
   same one-time-PIN policy as `/_/`.
2. **PocketBase superuser-only rules.** The collections have no list/view/create/
   update/delete rule, which in PocketBase means only a superuser token passes.
   An anonymous or ordinary-user token gets 403 even if Access were misconfigured.

`GET /api/subs/summary` is the one unauthenticated route, and it is unreachable
from outside: Caddy answers 404 for exactly that path, and Glance talks to
PocketBase directly on `127.0.0.1:8090`, never through Caddy.

`GET /api/subs/rates` is superuser-only and stays reachable, because the entry
form needs it. The form cannot call Yahoo itself — Yahoo sends no CORS headers —
and pointing the browser at a different FX provider would let the form and the
dashboard report different totals for the same data.

Note: the existing edge rate limit on `/api/collections/_superusers*` (5 req /
10 s) also covers the form's login call. The token is cached in localStorage, so
this only bites on repeated failed logins.

## Data model

`subscriptions` — name, category, amount, currency (TRY/USD/EUR/GBP), cashback,
cycle (weekly/monthly/quarterly/yearly), next_charge, payment_method, status,
vendor_url, logo_url, notes.

**Cashback is a plain per-charge amount in the subscription's own currency.**
There is deliberately no campaign start/end window and no expiry alerting: the
number is entered once and edited by hand when the campaign changes. Anything
more was explicitly cut as unwanted complexity.

`fx_rates` — one row, TRY-per-unit rates from Yahoo Finance
(`query1.finance.yahoo.com/v8/finance/chart/USDTRY=X` and friends). This is the
same source Glance's `markets` widget on this box already uses, so no new third
party is introduced, and it quotes the TRY pairs directly with no cross-rate
arithmetic. Refreshed lazily on read when older than 6 h. A failed refresh keeps
the last good rates and sets `fx_stale`, which both the widget and the form
surface; a stale rate is never presented as today's.

Yahoo's chart endpoint is undocumented and could change. The failure mode is
already handled — stale rates plus a visible warning — which is why a second
provider was not added.

Amounts that cannot be converted are counted in `unconverted` rather than
silently treated as zero.

## Logos

Paste a Google Play listing URL into `vendor_url` and leave `logo_url` empty; on
save a hook reads the listing's `og:image` and stores the icon URL rewritten to
`=s256`. These `play-lh.googleusercontent.com` URLs are content-addressed, so a
vendor rebrand publishes a new icon at a new URL and the old one keeps resolving.

The icon is linked, not downloaded, because PocketBase file access follows the
collection's view rule — a self-hosted logo behind superuser-only rules could not
be loaded by the widget's `<img>` without opening the collection to the public.

## Deploy

Files are staged to `/tmp/subs` by the agent; every step below is run by Burak.
See the session transcript for the paste-ready blocks in order:

1. Back up `pb_data`, install migrations/hooks/public, restart `pocketbase`.
2. Verify the migration applied and `/api/subs/summary` answers on loopback.
3. Add the `respond /api/subs/summary 404` line to the Caddyfile, reload Caddy.
4. Add the widget to `glance.yml`, restart `glance`.
5. Add the Cloudflare Access policy paths for `/subs*` and
   `/api/collections/subscriptions*`.

## Verify

	curl -s http://127.0.0.1:8090/api/subs/summary | head -c 300          # JSON, on the box
	curl -s -o /dev/null -w '%{http_code}\n' https://bbp.burakboduroglu.com.tr/api/subs/summary   # 404
	curl -s -o /dev/null -w '%{http_code}\n' https://bbp.burakboduroglu.com.tr/api/collections/subscriptions/records  # 403 or Access redirect
