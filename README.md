# my-blunders

Train on puzzles generated from your own Lichess mistakes.

## Features

- Import the last 50 of your Lichess games
- Stockfish finds your mistakes and generates puzzles from them — **in your
  browser** on the web (see [Architecture](#architecture))
- Filter puzzles by type (all / blunders / unseen) or by opening (ECO code)
- Tracks solved/failed state across sessions in localStorage

## Architecture

Detecting a blunder needs no engine — that comes from the `[%eval]` annotations
Lichess ships in the PGN. Stockfish is only consulted to find the *best-move
answer* at each critical position. Where that runs differs by platform:

| Platform | Game fetch | Analysis | Backend load |
| --- | --- | --- | --- |
| **Web** | `/api/lichess/pgn` proxy | **client-side WASM** (`public/stockfish/`) | trivial — just proxies PGN |
| **iOS** (Capacitor) | `/api/lichess/import` on Render | **server-side** native Stockfish | runs the engine per request |

Running analysis on the client means each user's own device does the work, so
the web backend stays a thin, cheap, horizontally-scalable proxy instead of a
CPU-bound engine host. The runtime fork lives in `lib/platform.ts` →
`lib/useImporter.ts`; the engine itself is abstracted behind the `ChessEngine`
interface in `lib/engine/uci.ts`, with two implementations:

- `lib/stockfish.ts` — `nodeEngine`, spawns the native binary (server / iOS)
- `lib/engine/wasm-engine.ts` — `getWasmEngine()`, a Web Worker (web)

> The iOS app stays on server-side analysis on purpose: Stockfish is GPLv3, and
> shipping the engine binary inside an App Store app is legally fraught. Keeping
> it server-side means the native app never *distributes* the engine. See
> [Licensing](#licensing).

## Prerequisites

- Node.js 20+
- Stockfish on your `PATH` — **only needed for the server-side analysis routes**
  (`/api/lichess/import`, `/api/import-pgn`, `/api/analyze`), which power the iOS
  build. Normal web use analyzes in the browser and needs no local binary.
  - macOS: `brew install stockfish`
  - Debian/Ubuntu: `sudo apt install stockfish`
  - Windows: download from <https://stockfishchess.org/download/> and add it to `PATH`

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, enter your Lichess username, and click **Fetch last 50 games**.

## Scripts

```bash
npm run dev         # dev server
npm run build       # production build
npm run typecheck   # TypeScript check
```

## Stack

Next.js 15 · React 19 · TypeScript · chess.js · Stockfish (native + WASM)

## Licensing

This project bundles the **Stockfish** chess engine compiled to WebAssembly for
the web build. Stockfish is licensed under the **GNU General Public License v3**.
Serving it to the browser is "conveying" under the GPL; the license text, source
offer, and version details are in [`public/stockfish/README.md`](public/stockfish/README.md).
The engine binaries are redistributed unmodified from the
[`stockfish`](https://www.npmjs.com/package/stockfish) npm package.
