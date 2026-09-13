# my-blunders

Train on puzzles generated from your own Lichess and chess.com mistakes.

## Features

- Import your recent Lichess or chess.com games — 20 per batch, with "Import
  more" to page further back — or upload a PGN file
- Stockfish finds your mistakes and generates puzzles from them — **on your own
  device**, on every platform (see [Architecture](#architecture))
- Filter puzzles by status (new / retry / all), opening (ECO code), game speed,
  or game phase
- Opening Clinic, Assisted Play and a coordinates trainer alongside the puzzle
  solver
- Tracks solved/failed state across sessions in localStorage

## Architecture

Detecting a blunder needs no engine — that comes from the `[%eval]` annotations
Lichess ships in the PGN. Stockfish is only consulted to find the *best-move
answer* at each critical position, and that always runs **on the user's own
device**. The only thing that differs by platform is where the PGN comes from:

| Platform | Game fetch | Analysis | Backend |
| --- | --- | --- | --- |
| **Web** | `/api/lichess/pgn` · `/api/chesscom/pgn` proxy | **client-side WASM** (`public/stockfish/`) | thin — just proxies PGN |
| **iOS** (Capacitor) | straight from Lichess / chess.com over Capacitor's native HTTP | **on-device WASM**, the same engine | none — the app is self-contained |

Analyzing on the client means each user's own device does the work, so the web
tier stays a thin, cheap, horizontally-scalable proxy instead of a CPU-bound
engine host, and the iOS app needs no server of ours at all. The runtime fork
lives in `lib/platform.ts` → `lib/useImporter.ts`; the engine itself is
abstracted behind the `ChessEngine` interface in `lib/engine/uci.ts`, with two
implementations:

- `lib/engine/wasm-engine.ts` — `getWasmEngine()`, a Web Worker. **This is what
  both surfaces actually run.**
- `lib/stockfish.ts` — `nodeEngine`, spawns a native binary. Reachable only
  through the server-side routes (`/api/lichess/import`, `/api/import-pgn`,
  `/api/analyze`), which no client calls any more — they are kept for local
  experimentation and are unused in production.

> Because the iOS app bundles the GPL-3.0 WASM engine, it *conveys* Stockfish
> under the GPL. The in-app **About** page carries the required licence notice
> and written source offer — keep that page in any redesign. See
> [Licensing](#licensing).

## Prerequisites

- Node.js 20+
- Stockfish on your `PATH` — **optional**, and only for the unused server-side
  analysis routes (`/api/lichess/import`, `/api/import-pgn`, `/api/analyze`).
  Both the web app and the iOS app analyze on-device with the bundled WASM
  engine, so ordinary development and normal use need no local binary.
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

Copyright © 2026 Sami Abdulnour <hi@samiabdulnour.com>

**GNU General Public License v3 or later.** See [`LICENSE`](LICENSE) for the full
terms. You may use, study, share and modify this software; if you distribute it,
or a modified version, you must pass on the same freedoms and make the source
available under the same licence.

This project bundles the **Stockfish** chess engine compiled to WebAssembly for
the web build. Stockfish is licensed under the **GNU General Public License v3**.
Serving it to the browser is "conveying" under the GPL; the license text, source
offer, and version details are in [`public/stockfish/README.md`](public/stockfish/README.md).
The engine binaries are redistributed unmodified from the
[`stockfish`](https://www.npmjs.com/package/stockfish) npm package.

For licensing enquiries, contact <hi@samiabdulnour.com>.
