#!/usr/bin/env node
// Skadi's installer. It copies files into a PocketBase directory and prints the
// two config snippets that cannot be copied for you. It never touches pb_data,
// never starts or stops anything, and never talks to the network.

import { readFile, mkdir, cp, access } from "node:fs/promises"
import { constants } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"))

const exists = async (p) => access(p, constants.F_OK).then(() => true, () => false)

const HELP = `
skadi ${pkg.version} — self-hosted subscription tracking on PocketBase

  skadi install <pocketbase-dir>   copy migrations, hooks and the page into place
  skadi glance [--url <form-url>] [--lang en|tr]
                                   optional: print a Glance widget for glance.yml
  skadi caddy                      print the reverse-proxy line that keeps the
                                   summary endpoint off the public internet

Options
  --force      install even if the target does not look like a PocketBase directory
  -h, --help   this
  -v, --version

The install step only writes pb_migrations/, pb_hooks/ and pb_public/subs/.
Your data lives in pb_data/ and is never read or written.
`

// A PocketBase directory is recognised by the binary or by pb_data beside it.
// Getting this wrong would scatter files into an unrelated folder, so the check
// is a refusal rather than a warning.
async function assertPocketBase(dir, force) {
  if (force) return
  const looksRight =
    (await exists(join(dir, "pocketbase"))) ||
    (await exists(join(dir, "pocketbase.exe"))) ||
    (await exists(join(dir, "pb_data")))
  if (!looksRight) {
    console.error(
      `Refusing to install: ${dir} holds no pocketbase binary and no pb_data.\n` +
      `Point at the directory the PocketBase executable lives in, or pass --force.`
    )
    process.exit(1)
  }
}

async function install(dir, force) {
  if (!dir) { console.error("Usage: skadi install <pocketbase-dir>"); process.exit(1) }
  const target = resolve(dir)
  if (!(await exists(target))) { console.error(`No such directory: ${target}`); process.exit(1) }
  await assertPocketBase(target, force)

  const parts = [
    ["pb_migrations", "pb_migrations"],
    ["pb_hooks", "pb_hooks"],
    [join("pb_public", "subs"), join("pb_public", "subs")]
  ]
  for (const [from, to] of parts) {
    const dest = join(target, to)
    await mkdir(dirname(dest), { recursive: true })
    await cp(join(ROOT, from), dest, { recursive: true })
    console.log(`  wrote ${to}/`)
  }

  console.log(`
Installed into ${target}

Next, and none of it is automatic:
  1. Restart PocketBase so the migrations run. If it was already running, stop
     it before copying and start it after: PocketBase watches pb_hooks and
     restarts itself, which races a service manager doing the same.
  2. Serve the page. It is at /subs/ once PocketBase is serving pb_public.
  3. Put an auth layer in front of /subs and
     /api/collections/subscriptions. The collections are superuser-only on
     their own; the page is a login form anyone could reach.
  4. Block /api/subs/summary from the internet — 'skadi caddy' prints the line.
     This matters whether or not you use a dashboard: the endpoint exists
     either way, and an exposed one you never read is pure downside.

Optional, if you want a dashboard:
  5. 'skadi glance --url https://your.host/subs/' prints a Glance widget.
     Running something else? /api/subs/summary is plain JSON. Running nothing
     is fine too — the page stands on its own.
`)
}

async function glance(url, wlang) {
  const yml = await readFile(join(ROOT, "glance", `widget.${wlang}.yml`), "utf8")
  if (!url) {
    process.stdout.write(yml)
    console.error("\n(no --url given: replace __SKADI_URL__ with your form's address)")
    return
  }
  // The header explains the placeholder, so it stops making sense the moment
  // the placeholder is filled in - drop it rather than substitute inside it.
  const body = yml.split("\n").filter(l => !l.startsWith("#")).join("\n")
  process.stdout.write(body.replace(/__SKADI_URL__/g, url).replace(/^\n+/, ""))
}

function caddy() {
  console.log(`
Inside the site block that proxies PocketBase, above reverse_proxy:

	# Private route: the dashboard reads this on loopback, nobody else may.
	respond /api/subs/summary 404

The summary endpoint takes no token. What keeps it private is that the
dashboard reaches PocketBase directly, without passing through the proxy, so
this line removes the only path in from outside. Drop the line and the endpoint
is public.
`)
}

const [cmd, ...rest] = process.argv.slice(2)
const force = rest.includes("--force")
const urlAt = rest.indexOf("--url")
const url = urlAt === -1 ? null : rest[urlAt + 1]
const langAt = rest.indexOf("--lang")
const wlang = langAt === -1 ? "en" : (rest[langAt + 1] === "tr" ? "tr" : "en")

switch (cmd) {
  case "install": await install(rest.find(a => !a.startsWith("-")), force); break
  case "glance": await glance(url, wlang); break
  case "caddy": caddy(); break
  case "-v": case "--version": console.log(pkg.version); break
  case "-h": case "--help": case undefined: console.log(HELP); break
  default: console.error(`Unknown command: ${cmd}\n${HELP}`); process.exit(1)
}
