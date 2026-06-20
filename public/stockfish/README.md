# Stockfish (WASM) — third-party engine

These files are the chess engine the **web** app runs in the browser to analyze
your games and find the best move for each puzzle. The analysis happens entirely
on your device; the server only proxies game downloads from Lichess.

## What's here

| File | Purpose |
| --- | --- |
| `stockfish-18-lite-single.js` | Web Worker entry / loader |
| `stockfish-18-lite-single.wasm` | The compiled engine (~7.3 MB) |
| `COPYING.txt` | The full GNU GPL v3 license text |

This is the **lite, single-threaded** build, chosen because it requires no
`SharedArrayBuffer` and therefore no cross-origin-isolation (COOP/COEP) headers,
so it runs in a normal browser tab with no special server configuration.

## Source & version

Copied verbatim from the [`stockfish`](https://www.npmjs.com/package/stockfish)
npm package, version **18.0.8** (`bin/` directory). To update, reinstall that
package and re-copy the two `stockfish-18-lite-single.*` files.

- Stockfish.js (WASM build): <https://github.com/nmrugg/stockfish.js>
- Stockfish (upstream engine): <https://github.com/official-stockfish/Stockfish>

## License & source offer (important)

Stockfish and this WASM build are licensed under the **GNU General Public
License, version 3** (see `COPYING.txt`). Serving these files to your browser is
"conveying" the program under the GPL.

The complete corresponding source for the engine is the upstream repositories
linked above (and is also published with each `stockfish.js` release). No
modifications were made to these binaries — they are redistributed as obtained
from the npm package.

> Note: the GPL is straightforward to satisfy for the **web** distribution
> (include this notice + the license, offer the source — done). It is *not* the
> same story for an App Store iOS app, which is why the native build keeps its
> analysis on the server instead of shipping this engine. See the repo README.
