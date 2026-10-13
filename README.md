# my-blunders

Train on puzzles generated from your own Lichess and Chess.com mistakes.

## Features

- Import your games from Lichess or Chess.com
- Stockfish finds your mistakes and turns them into puzzles, **on your own
  device**: in the browser on the web, inside the app on iOS (see
  [Architecture](#architecture))
- Filter puzzles by type (all / blunders / unseen) or by opening (ECO code)
- Map your opening repertoire as a tree, drill its weak spots, and export it as
  an A1 poster or a 4K wallpaper
- Tracks solved/failed state across sessions in localStorage

## Architecture

Detecting a blunder needs no engine — that comes from the `[%eval]` annotations
Lichess ships in the PGN. Stockfish is only consulted to find the *best-move
answer* at each critical position, and to evaluate positions in the opening
tree. On both platforms it runs **on the user's device**, as the WebAssembly
build in `public/stockfish/` inside a Web Worker. Nothing is analysed on, or
stored on, a server of ours.

| Platform | Game fetch | Analysis | Backend |
| --- | --- | --- | --- |
| **Web** (Vercel) | same-origin `/api/lichess/pgn` · `/api/chesscom/pgn` proxies | **client-side WASM** | thin proxies only (PGN, opening explorer) |
| **iOS** (Capacitor) | straight from Lichess / Chess.com over Capacitor's native HTTP | **on-device WASM**, bundled in the app | **none** |

The one runtime fork is *where games come from*: the web goes through the
proxies so the browser stays same-origin, the app has no backend and calls the
sites directly. It lives in `lib/platform.ts` (`isNativeApp()`) and is used by
`lib/useImporter.ts`, `lib/opening-import.ts` and `lib/opening-explorer.ts`.
The engine sits behind the `ChessEngine` interface in `lib/engine/uci.ts`;
`lib/engine/wasm-engine.ts` (`getWasmEngine()`) is the implementation both
platforms use.

What does leave the device, and where to: game downloads from Lichess and
Chess.com, and opening-theory lookups (a board position) to the Lichess opening
explorer at `explorer.lichess.ovh`. Neither goes to a server of ours.

> The native app ships the Stockfish WASM engine inside the app, so it
> *conveys* Stockfish under the GPL. The in-app **About** page carries the
> licence notice and the written source offer. See [Licensing](#licensing).

> **Legacy:** `app/api/lichess/import`, `app/api/import-pgn` and
> `app/api/analyze` (with `lib/stockfish.ts`, which spawns a native Stockfish
> binary) date from when the iOS app analysed server-side. No client calls them
> any more.

## Prerequisites

- Node.js 20+
- Xcode, for the iOS build (see [`docs/ios.md`](docs/ios.md)). No Stockfish
  install is needed for the web or the app: both use the bundled WASM engine.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and enter your Lichess or Chess.com username.

## Scripts

```bash
npm run dev         # dev server
npm run build       # production build
npm run typecheck   # TypeScript check
npm run ios:sync    # static build + copy into the iOS project
```

## Stack

Next.js 15 · React 19 · TypeScript · chess.js · Stockfish (WASM) · Capacitor (iOS)

## Licensing

Copyright © 2026 Sami Abdulnour <hi@samiabdulnour.com>

**GNU General Public License v3 or later.** See [`LICENSE`](LICENSE) for the full
terms. You may use, study, share and modify this software; if you distribute it,
or a modified version, you must pass on the same freedoms and make the source
available under the same licence.

This project bundles the **Stockfish** chess engine compiled to WebAssembly, in
the web build and inside the iOS app. Stockfish is licensed under the **GNU
General Public License v3**. Serving it to the browser, and shipping it in the
app, are both "conveying" under the GPL; the license text, source offer, and
version details are in [`public/stockfish/README.md`](public/stockfish/README.md),
and the app shows them on its About page.
The engine binaries are redistributed unmodified from the
[`stockfish`](https://www.npmjs.com/package/stockfish) npm package.

For licensing enquiries, contact <hi@samiabdulnour.com>.
