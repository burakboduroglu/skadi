# Security Policy

## Supported versions

Only the latest published version is supported. Skadi is distributed on npm as
`@burakboduroglu/skadi` and installs files into a PocketBase directory; there are
no maintenance branches.

| Version        | Status    |
| -------------- | --------- |
| latest on npm  | Supported |
| anything older | Reinstall |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through
[GitHub Security Advisories](https://github.com/burakboduroglu/skadi/security/advisories/new),
or by email to **info@burakboduroglu.com.tr**.

Include what an attacker can reach, the steps to reproduce, and the PocketBase
version. I will confirm receipt, and I would rather hear about something small
than not hear about it.

## What Skadi assumes about its environment

Two of these are load-bearing, and misreading them is the most likely way to get
hurt:

1. **`GET /api/subs/summary` takes no authentication.** It is meant to be read by
   a dashboard on the same host over loopback. What keeps it private is that your
   reverse proxy refuses it — `skadi caddy` prints the line. Drop that line and
   the endpoint, and everything it summarises, is public.
2. **The page holds a superuser token.** `/subs/` logs in as a PocketBase
   superuser and keeps the token in `localStorage`. That token is not scoped to
   the subscription collections; it is full access to the instance. Put an auth
   layer in front of `/subs` and treat the browser you use it from as trusted.
3. **The collections themselves are superuser-only.** They ship with null API
   rules, so an anonymous or ordinary-user token is refused before any proxy is
   involved. This is the layer that still holds if the proxy is misconfigured.

## Outbound requests

Skadi has no telemetry and no update check. The server makes two kinds of
outbound request, both triggered by you:

- a rate quote from Yahoo Finance, at most once every six hours;
- a fetch of a link you paste, to read its title and icon, once per save.

Both are unauthenticated GETs. Neither carries anything about your data.
