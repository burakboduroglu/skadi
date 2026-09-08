# Contributing

Thanks for looking at this repository.

Skadi is a small, finished tool rather than a platform, and it is deliberately
narrow: it tracks subscriptions on a PocketBase instance you already run. That
shapes what fits here.

- **Welcome:** bug reports, a link that resolves to the wrong logo or none at
  all, a currency or locale that formats badly, security issues, install
  problems on a PocketBase version I have not tried, documentation that is wrong
  or unclear, translation fixes.
- **Case by case:** a new field, a new dashboard target, another FX source. Open
  an issue first and say what it makes possible that is not possible now.
- **Not accepted:** reminders, notifications, campaign-expiry tracking,
  multi-user support, and imports. These are listed under *What it deliberately
  does not do* in the README because leaving them out is the design, not an
  oversight.

## Getting started

There is no build step and no dependency to install. The whole thing is three
migrations, two hook files, and one HTML page.

```bash
git clone https://github.com/burakboduroglu/skadi.git
cd skadi
```

To try a change, install it into a throwaway PocketBase:

```bash
mkdir /tmp/pb && cd /tmp/pb
# download a pocketbase binary for your platform, then:
node ~/path/to/skadi/bin/skadi.js install .
./pocketbase superuser create demo@local.test <a-password>
./pocketbase serve --http=127.0.0.1:8099
```

The page is at `http://127.0.0.1:8099/subs/`. Migrations run on start, so a
schema change means restarting.

**Stop PocketBase before copying hook files into a running instance.**
PocketBase watches `pb_hooks` and restarts itself when those files change, which
races a service manager doing the same and can hang the stop until it times out.

## The shape of a change

- **Commits follow [Conventional Commits](https://www.conventionalcommits.org):**
  `feat:`, `fix:`, `docs:`, `refactor:`, `style:`, `chore:`. Imperative mood,
  subject under ~72 characters, reasoning in the body when the change is not
  self-evident. No emoji.
- **English** in code, comments, commit messages and documentation. The UI
  itself ships in Turkish and English; both dictionaries live at the top of
  `pb_public/subs/index.html` and a new string belongs in both.
- **No dependencies.** Not in the page, not in the hooks, not in the CLI. If a
  change needs a library, it probably belongs outside this project.
- **Escape anything rendered into `innerHTML`.** A subscription name can arrive
  from a Google Play listing rather than from a keyboard, and the page holds a
  superuser token.

## Reporting a bug

Include the PocketBase version, how you installed Skadi, and what
`GET /api/subs/summary` returns — it carries `fx_currencies`, `fx_stale` and
`unconverted`, which answer most "the total looks wrong" reports on their own.

Never open a public issue for a security problem; see [SECURITY.md](SECURITY.md).
