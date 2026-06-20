# Deployment

## TL;DR

- **Web → Vercel.** Served from a global CDN, so it loads instantly with no
  cold-start spin-down. This is the public site at **myblunders.com**.
- **iOS analysis → Render** (or any always-on Node host). The native build runs
  Stockfish server-side and points at it via `NEXT_PUBLIC_API_BASE`. The web app
  needs none of this — it analyzes in the browser with WASM (see the README
  architecture table).

Because web analysis moved to the client, the web tier is just static pages +
the thin `/api/lichess/pgn` proxy, which is a perfect fit for Vercel's
serverless model. The Stockfish routes (`/api/lichess/import`, `/api/import-pgn`,
`/api/analyze`, `/api/debug/stockfish`) still build on Vercel but won't run there
(no `stockfish` binary) — that's fine, the web never calls them.

## Deploy the web to Vercel

1. Go to <https://vercel.com> and sign in **with GitHub**.
2. **Add New… → Project** → import `samiabdulnour/my-blunders`.
3. Vercel auto-detects **Next.js** — leave the build settings at their defaults.
4. **Environment variables:** leave `NEXT_PUBLIC_API_BASE` **unset**. The web
   build must use same-origin `/api/...`; setting it would point the web app at
   the Render backend by mistake. (That variable is only for the iOS build.)
5. **Deploy.** You'll get a `https://<project>.vercel.app` URL — open it and
   confirm the site loads instantly.

Every push to `main` now auto-deploys to production; PRs get preview URLs.

## Point myblunders.com at Vercel

1. In the Vercel project: **Settings → Domains → Add** `myblunders.com`
   (add `www.myblunders.com` too; Vercel will offer to redirect one to the other).
2. Vercel shows the exact DNS records. At your **domain registrar's DNS panel**
   (wherever you bought myblunders.com), add:

   | Type  | Name / Host | Value                  |
   | ----- | ----------- | ---------------------- |
   | A     | `@`         | `76.76.21.21`          |
   | CNAME | `www`       | `cname.vercel-dns.com` |

   (Use the values Vercel displays if they differ — those win.)
3. Save. DNS usually propagates within minutes (can take up to 48h). Vercel
   issues HTTPS automatically once the records resolve.

> Tip: if your registrar lets you delegate nameservers to Vercel, that also
> works and lets Vercel manage records for you — but the A/CNAME approach above
> keeps DNS at your registrar and is the simplest one-time setup.

## Keeping (or pausing) Render

The iOS app isn't shipped yet, so the Render service is only needed once you
build/ship iOS. You can keep it running as the iOS API base, or pause it to save
cost and bring it back when iOS is ready. The web site on Vercel is fully
independent of it.
