<div align="center">

<img src="https://raw.githubusercontent.com/burakboduroglu/skadi/main/assets/logo.png" alt="Skadi logo" width="128">

# Skadi

**Subscription tracking that rides a PocketBase instance you already run — two collections, one endpoint, one page.**

[![npm](https://img.shields.io/npm/v/@burakboduroglu/skadi?style=flat-square&color=000)](https://www.npmjs.com/package/@burakboduroglu/skadi)
[![License](https://img.shields.io/npm/l/@burakboduroglu/skadi?style=flat-square&color=000)](LICENSE)
[![Install size](https://img.shields.io/bundlephobia/min/@burakboduroglu/skadi?style=flat-square&color=000&label=size)](https://www.npmjs.com/package/@burakboduroglu/skadi)

![Self-hosted](https://img.shields.io/badge/self--hosted-only-000?style=flat-square)
![No telemetry](https://img.shields.io/badge/telemetry-none-000?style=flat-square)
![PocketBase](https://img.shields.io/badge/PocketBase-0.23+-000?style=flat-square)
![Bun](https://img.shields.io/badge/Bun-runtime-000?style=flat-square&logo=bun)
![No Docker](https://img.shields.io/badge/Docker-not_required-000?style=flat-square&logo=docker)

</div>

---

Skadi tracks what you pay every month for the services you subscribe to, and what comes back as cashback. It is not an application you deploy. It is a set of files you drop into a PocketBase directory you already have: two collections, a pair of JSON endpoints written as PocketBase hooks, and a single static HTML page. Nothing else starts, nothing else listens, and nothing else needs backing up.

That framing is the whole point. A dedicated subscription tracker means another container, another database, another volume in your backup, another process competing for RAM on a small box. If PocketBase is already running, all of that is redundant — the database, the auth, the HTTP server, the backup story and the admin UI are sitting there, and Skadi is roughly six hundred lines that use them.

<div align="center">

<img src="https://raw.githubusercontent.com/burakboduroglu/skadi/main/assets/screenshot-list.png" alt="The list: totals, live rates, and every subscription with its own logo" width="620">

<img src="https://raw.githubusercontent.com/burakboduroglu/skadi/main/assets/screenshot-dialog.png" alt="Adding a subscription: paste a link, the name and logo resolve server-side" width="305">
<img src="https://raw.githubusercontent.com/burakboduroglu/skadi/main/assets/screenshot-menu.png" alt="Language and display currency, both stored per browser" width="305">

</div>

## What it is

You add a subscription by pasting a **link**. Google Play, a Wikipedia article, or a direct image URL — the server resolves it to a name and a logo, so a full entry is usually a link, an amount, and a date. It reads Google Play's `og:image` and `og:title`, resolves a Wikimedia `File:` link through the MediaWiki API, and takes a direct image URL at its own content type rather than guessing from the extension.

Charge dates **advance on their own**. A monthly subscription whose date has passed is rolled forward to the next one, clamped against the day it actually bills on — a subscription charged on the 31st does not sink to the 28th after one February and stay there.

Amounts can be in **TRY, USD, EUR or GBP** and the totals are quoted in whichever of those you pick, converted at rates taken from Yahoo Finance and cached for six hours. Every row keeps the currency it is genuinely charged in; converting that away would hide the fact. When a rate cannot be fetched the last good one is used and labelled as stale — a stale rate is never presented as today's — and anything that cannot be converted is counted and reported rather than silently treated as zero.

**Cashback is a flat per-charge amount** you type in yourself, in the subscription's own currency. There are deliberately no campaign windows, no start and end dates, no expiry alerting. When a deal changes you edit the number.

**The dashboard is optional.** Skadi is complete without one: the page lists every subscription, its totals and its dates. If you happen to run [Glance](https://github.com/glanceapp/glance), `skadi glance` prints a widget — monthly net, yearly net, cashback, and what is due in the next 45 days with each service's logo. If you run something else, `/api/subs/summary` is plain JSON and yours to render. If you run nothing, skip it entirely and never look at that endpoint again.

## Highlights

|     | Feature | How it works |
| --- | ------- | ------------ |
| 🧩 | **No infrastructure of its own** | Migrations, hooks and a static page copied into an existing PocketBase. No container, no second database, no extra port. |
| 🔗 | **Paste a link, get a name and a logo** | Play `og:image`/`og:title`, Wikimedia `File:` through the MediaWiki API, or any direct image detected by content type. |
| 📅 | **Dates that move themselves** | Passed charges roll forward by cycle, clamped to an anchor day so month-end billing does not drift. |
| 💱 | **Four currencies, one honest total** | Rates cached six hours; stale rates are labelled, unconvertible rows are counted, never zeroed. |
| 💸 | **Cashback without ceremony** | One number per subscription. No campaign windows to maintain, because nobody maintains them. |
| 🔒 | **Superuser-only by default** | Both collections ship with null API rules. An anonymous or ordinary token gets 403 before any proxy is involved. |
| 🛰️ | **A summary endpoint with no way in** | Any dashboard reads it over loopback; one proxy line 404s it from the internet. |
| 📊 | **Dashboard optional** | Glance widget included, plain JSON for anything else, and nothing at all is a supported choice. |
| 🌍 | **Turkish and English** | Two dictionaries and a lookup. No i18n runtime, no build step. |
| 📵 | **No telemetry, no accounts, no phoning home** | The only outbound requests are the FX quote and the logo you asked it to resolve. |
| 🪶 | **Small** | One HTML file, two hook files, three migrations. No bundler, no framework, no dependencies. |

## Install

Skadi ships on npm but installs nothing into your project — it is a set of files and a copier. Run it with **Bun**:

```bash
bunx @burakboduroglu/skadi install /path/to/pocketbase
```

That writes `pb_migrations/`, `pb_hooks/` and `pb_public/subs/`. It never reads or writes `pb_data/`, and it refuses to run against a directory holding neither a `pocketbase` binary nor a `pb_data`, so a mistyped path cannot scatter files somewhere unrelated.

Or keep it around:

```bash
bun add -g @burakboduroglu/skadi
skadi install /path/to/pocketbase
```

Then restart PocketBase so the migrations run. **If it was already running, stop it before copying and start it afterwards** — PocketBase watches `pb_hooks` and restarts itself when those files change, which races a service manager trying to do the same and can hang the stop until it times out.

The page is then served at `/subs/`. Two config snippets are yours to place, and the tool prints both:

```bash
skadi caddy    # required: keeps the summary endpoint off the internet
```

And, **only if you want a dashboard**:

```bash
skadi glance --url https://your.host/subs/            # English widget
skadi glance --url https://your.host/subs/ --lang tr  # Turkish
```

Not using Glance changes nothing about the install. Note that it makes `skadi caddy` *more* important, not less: the summary endpoint exists either way, and if nothing of yours is reading it, an exposed one is pure downside.

## How it works

```
browser ──▶ /subs/            static page, superuser login, token in localStorage
        └─▶ /api/collections/subscriptions   superuser-only CRUD
        └─▶ /api/subs/rates                  superuser-only, FX for the totals

dashboard ─▶ 127.0.0.1:8090/api/subs/summary  no auth, unreachable from outside
```

`subscriptions` holds the contracts, `cards` the payment methods you pick from instead of retyping, and `fx_rates` a single row of cached quotes that is updated in place and swept to one row on every refresh.

`GET /api/subs/summary` is the only unauthenticated route. It takes no token because the dashboard talks to PocketBase directly rather than through your proxy — which means the proxy line that 404s it removes the only path in from outside. **Drop that line and the endpoint is public.** It is the one piece of this that fails open, so it is called out here rather than buried.

## Security model

Two independent layers, either sufficient on its own:

1. **PocketBase rules.** Both collections have no list, view, create, update or delete rule, which in PocketBase means superuser only. Anonymous and ordinary user tokens get 403 with no proxy involved.
2. **Whatever you put in front.** The page at `/subs/` is a login form anyone can reach until you gate it. Cloudflare Access, basic auth, a VPN — Skadi does not care, but it does not ship one.

The page authenticates as a **superuser** and keeps that token in `localStorage`. That is a deliberate trade for a single-operator tool, and it is why every field rendered into the list is escaped: a name can arrive from a Google Play listing rather than from your keyboard.

## No telemetry

There is no analytics, no crash reporting, no update check, no account, and no vendor. The server makes exactly two kinds of outbound request, both of which you can name in advance:

- a quote from Yahoo Finance, at most once every six hours;
- a fetch of the link you just pasted, to read its title and icon, once per save.

Nothing about your subscriptions leaves the machine you installed it on.

## What it deliberately does not do

Saying this plainly is cheaper than you finding out:

- **No reminders.** Upcoming charges are visible on the dashboard and nowhere else. No email, no push, no calendar feed.
- **No campaign expiry tracking.** Cashback is a number you maintain.
- **No scheduled job.** Rates refresh when something asks for them; the dashboard's polling is what keeps them warm.
- **No multi-user.** One superuser, one set of subscriptions.
- **No import.** You type them in once.

## Stack

**PocketBase** for storage, auth, HTTP and backups. **JavaScript** in PocketBase's own hook runtime for the two endpoints, and one dependency-free HTML page for the UI — no framework, no bundler, no CSS library, no i18n runtime. **Bun** as the package manager. Glance is supported, not required, and nothing in the install depends on it.

The name is Skaði, the Norse goddess of winter and the mountains, who took a settlement in compensation and chose by looking only at the feet. It seemed apt for something that makes you look at what you are actually paying.

## Contributing

Bug reports, logo-resolution failures and translation fixes are welcome; the
things under *What it deliberately does not do* are not. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the shape of a change, and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for how we behave here.

Security problems go through
[a private advisory](https://github.com/burakboduroglu/skadi/security/advisories/new),
never a public issue — [SECURITY.md](SECURITY.md) explains what Skadi assumes
about its environment, including the two assumptions that fail open.

## License

MIT — see [LICENSE](LICENSE).
