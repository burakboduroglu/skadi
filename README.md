<div align="center">

<img src="https://raw.githubusercontent.com/burakboduroglu/skadi/main/assets/logo.png" alt="Skadi logo" width="112">

# Skadi

**Subscription tracking that rides a PocketBase instance you already run.**

[![npm](https://img.shields.io/npm/v/@burakboduroglu/skadi?style=flat-square&color=000)](https://www.npmjs.com/package/@burakboduroglu/skadi)
[![License](https://img.shields.io/npm/l/@burakboduroglu/skadi?style=flat-square&color=000)](LICENSE)
![Self-hosted](https://img.shields.io/badge/self--hosted-only-000?style=flat-square)
![No telemetry](https://img.shields.io/badge/telemetry-none-000?style=flat-square)
![No Docker](https://img.shields.io/badge/Docker-not_required-000?style=flat-square&logo=docker)
![Bun](https://img.shields.io/badge/Bun-runtime-000?style=flat-square&logo=bun)

</div>

---

<div align="center">

<img src="https://raw.githubusercontent.com/burakboduroglu/skadi/main/assets/screenshot-list.png" alt="The list: totals, live rates, and every subscription with its own logo" width="620">

<img src="https://raw.githubusercontent.com/burakboduroglu/skadi/main/assets/screenshot-dialog.png" alt="Adding a subscription: paste a link, the name and logo resolve server-side" width="305">
<img src="https://raw.githubusercontent.com/burakboduroglu/skadi/main/assets/screenshot-menu.png" alt="Language and display currency, both stored per browser" width="305">

</div>

Skadi is not an application you deploy. It is three migrations, two hook files
and one static page, copied into a PocketBase directory you already have. The
database, auth, HTTP server, admin UI and backups are already running — a
dedicated subscription tracker would duplicate all of them.

## What it is

Add a subscription by pasting a **link**. Google Play, a Wikipedia article, or a
direct image URL: the server resolves it to a name and a logo, so a full entry is
usually a link, an amount and a date.

Charge dates **advance on their own**, clamped to the day a subscription actually
bills on, so one charged on the 31st does not sink to the 28th after a February.
Amounts can be **TRY, USD, EUR or GBP**, with totals quoted in whichever you pick
and rates cached six hours. A stale rate is labelled as stale, never passed off
as today's, and anything unconvertible is counted rather than silently zeroed.

**Cashback is one number per subscription**, in its own currency. No campaign
windows, no expiry alerting — when a deal changes you edit the number.

## Highlights

|     | Feature | How it works |
| --- | ------- | ------------ |
| 🧩 | **No infrastructure of its own** | Files copied into an existing PocketBase. No container, no second database, no extra port. |
| 🔗 | **Paste a link, get a name and a logo** | Play `og:image`/`og:title`, Wikimedia `File:` via the MediaWiki API, or any direct image by content type. |
| 📅 | **Dates that move themselves** | Passed charges roll forward by cycle, clamped to an anchor day. |
| 💱 | **Four currencies, one honest total** | Stale rates labelled, unconvertible rows counted, never zeroed. |
| 🔒 | **Superuser-only by default** | Null API rules: anonymous and ordinary tokens get 403 before any proxy. |
| 🌍 | **Turkish and English** | Two dictionaries and a lookup. No i18n runtime. |
| 📵 | **No telemetry** | Two outbound requests exist: the FX quote, and the link you asked it to resolve. |
| 📊 | **Dashboard optional** | A Glance widget is included; plain JSON for anything else; nothing at all is fine. |

## Footprint

Measured on a 2 vCPU / 3.7 GiB Debian box running PocketBase 0.40:

| | |
| --- | --- |
| Installed files | **76 KB** — migrations 12 KB, hooks 24 KB, page 40 KB |
| Database growth | **~45 KB** for the three collections plus a handful of subscriptions |
| Resident memory | **~22 MB**, and that is the whole PocketBase process |
| Extra processes | none |
| Extra ports | none |

The memory figure is PocketBase serving Skadi and nothing else, so it is an
upper bound rather than Skadi's own cost — the hooks run inside PocketBase's own
JS runtime and add no process of their own. If PocketBase is already running,
the marginal cost of Skadi is closer to the file sizes than to the memory line.

## Install

```bash
bunx @burakboduroglu/skadi install /path/to/pocketbase
```

Writes `pb_migrations/`, `pb_hooks/` and `pb_public/subs/`. It never touches
`pb_data/`, and refuses a directory holding neither a `pocketbase` binary nor a
`pb_data`.

Then restart PocketBase so the migrations run. **If it was already running, stop
it before copying and start it afterwards** — PocketBase watches `pb_hooks` and
restarts itself when those change, which races a service manager doing the same.

The page is served at `/subs/`. Two config snippets are yours to place:

```bash
skadi caddy                                    # required
skadi glance --url https://your.host/subs/     # optional, --lang en|tr
```

## How it works

```
browser ──▶ /subs/                            static page, superuser login
        └─▶ /api/collections/subscriptions    superuser-only CRUD
        └─▶ /api/subs/rates                   superuser-only, FX for the totals

dashboard ─▶ 127.0.0.1:8090/api/subs/summary  no auth, unreachable from outside
```

`subscriptions` holds the contracts, `cards` the payment methods you pick from,
and `fx_rates` a single cached row updated in place.

## Security

Two layers, either sufficient alone:

1. **PocketBase rules** — both collections are superuser-only, enforced with no
   proxy involved.
2. **Whatever you put in front** — `/subs/` is a login form anyone can reach
   until you gate it. Skadi does not ship an auth layer.

`GET /api/subs/summary` takes no token, because a dashboard reads it over
loopback rather than through your proxy. The line `skadi caddy` prints is what
removes the only path in from outside. **Drop it and the endpoint is public.**

The page authenticates as a superuser and keeps that token in `localStorage` — a
deliberate trade for a single-operator tool, and why every rendered field is
escaped. Details in [SECURITY.md](SECURITY.md).

## What it deliberately does not do

No reminders. No campaign expiry tracking. No scheduled job — rates refresh when
something asks. No multi-user. No import.

## Stack

PocketBase for storage, auth, HTTP and backups. JavaScript in PocketBase's hook
runtime, and one dependency-free HTML page — no framework, no bundler, no CSS
library. Bun as the package manager.

The name is Skaði, the Norse goddess of winter and the mountains, who chose a
husband by looking only at the feet. Apt for something that makes you look at
what you are actually paying.

## Contributing

Bug reports, logo-resolution failures and translation fixes are welcome; the
things above are not. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security problems go through
[a private advisory](https://github.com/burakboduroglu/skadi/security/advisories/new),
never a public issue.

## License

MIT — see [LICENSE](LICENSE).
