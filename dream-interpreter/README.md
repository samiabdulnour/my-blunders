# ☾ Dreamweaver — a Jungian Dream Interpreter

Write down a dream. Dreamweaver detects its **motifs**, maps them to Jungian
**archetypes**, and **amplifies** them with parallels from ancient mythology —
Greek, Norse, Egyptian, Mesopotamian, Hindu, alchemical — the way Jung himself
recommended reading dreams: by holding the image next to the myths where the
same image has always lived.

> "Who looks outside, dreams; who looks inside, awakes." — C. G. Jung

## What it does (v0)

- **Interpretation engine** — client-side, no server: detects ~60 dream motifs
  (being chased, teeth falling out, snakes, floods, labyrinths, the stranger…),
  scores the archetypal currents (Shadow, Anima/Animus, Self, Great Mother,
  Hero, Trickster, Death & Rebirth, the Descent…), assembles a narrative
  reading, and offers reflective questions in the tradition of active
  imagination.
- **Symbol dictionary** — a browsable, searchable dictionary of dream symbols,
  each with a Jungian reading and mythological amplifications with named
  cultures and sources. This is the heart of the project and it wants to grow.
- **Archetype catalog** — the theory pages: each archetype explained with how
  it shows up in dreams.
- **AI deep-dive (optional)** — a full interpretive reading of your specific
  dream written by Claude (Anthropic API, bring-your-own-key). The key lives
  only in your browser's localStorage; there is no backend at all.

**Privacy:** dreams are analyzed entirely in the browser. Nothing leaves your
machine unless you explicitly invoke the AI deep-dive, which calls the
Anthropic API directly with your own key.

## Run it locally

It's a zero-dependency static site. Because it uses ES modules you need any
static file server (opening `index.html` via `file://` won't work):

```bash
cd dream-interpreter
python3 -m http.server 8080
# → http://localhost:8080
```

Deploying is equally boring: GitHub Pages, Netlify, anything that serves files.

## The scholarship scaffolding

This project is grounded in the primary literature, not in pop dream
dictionaries — Jung: *"It is plain foolishness to believe in ready-made
systematic guides to dream interpretation."* The `docs/` directory is the
foundation everything else is being rebuilt on:

- **[docs/METHODOLOGY.md](docs/METHODOLOGY.md)** — how Jung actually read
  dreams, with CW paragraph citations and verified quotations: amplification
  (not free association), compensation, the dream's dramatic structure,
  objective vs subjective level, series over single dreams, active
  imagination — and why fixed symbol meanings are explicitly rejected.
- **[docs/TAXONOMY.md](docs/TAXONOMY.md)** — the primordial-motif taxonomy:
  13 overlapping motif families (typical dream situations, the Great Mother,
  the night sea journey, katabasis, the alchemical operations, trickster,
  threshold & guardian…) with cross-cultural instantiations as parallels
  for amplification.
- **[docs/SCHEMA.md](docs/SCHEMA.md)** — the v1 entry data model, designed
  so a singular "meaning" field cannot exist: mandatory opposed valences,
  context modulators, amplifications with divergence notes, questions
  instead of conclusions.
- **[docs/SOURCES.md](docs/SOURCES.md)** — the tiered source corpus with
  links and licensing: public-domain Jung (Gutenberg), the Collected Works
  by CW ¶, the post-Jungians (von Franz, Neumann, Edinger, Hillman, Hall),
  ARAS & The Book of Symbols, Thompson's Motif-Index / MOMFER, ETCSL,
  Perseus, sacred-texts, DreamBank.

The current `js/data/symbols.js` is the v0 retrieval layer; entries are
being migrated to the v1 schema. Contributions should follow
`SCHEMA.md` + `SOURCES.md` (citation discipline, licensing red lines).

## Project shape

```
dream-interpreter/
├── index.html          # app shell (tabs: Interpret / Dictionary / Archetypes / About)
├── css/style.css       # night-sky theme
└── js/
    ├── data/
    │   ├── symbols.js     # ★ the symbol dictionary — add entries here
    │   └── archetypes.js  # the archetype definitions
    ├── engine.js       # motif detection + archetype scoring + narrative
    ├── ai.js           # optional Claude deep-dive (BYO API key)
    └── app.js          # UI wiring
```

## Contributing a symbol

Add an entry to `js/data/symbols.js`:

```js
{
  id: "bridge",
  name: "Bridge",
  category: "places",             // see CATEGORIES in the same file
  keywords: ["bridge", "crossing"], // matched as whole words/phrases in dream text
  archetypes: { deathRebirth: 1, self: 1 }, // weights feeding the archetype scores
  meaning: "The Jungian reading…",
  mythology: [
    { culture: "Norse", text: "Bifröst, the rainbow bridge…" },
  ],
}
```

Good entries cite real mythological parallels (culture + story), keep the
Jungian reading honest (no fortune-telling), and choose keywords conservatively
so they don't false-positive on ordinary language.

## Roadmap

- [ ] Voice input — *tell* the dream instead of typing (Web Speech API)
- [ ] Dream journal — save dreams locally (IndexedDB), spot recurring motifs over time
- [ ] Series analysis — Jung read dreams in series; recurring-symbol statistics across a journal
- [ ] Multilingual keyword matching (Czech, German, …)
- [ ] Richer dictionary: alchemy operations, colors, numbers as symbols
- [ ] Capacitor wrapper → iOS/Android app store builds (same path as the parent repo's chess app)
- [ ] Optional accounts/sync once there's a backend worth having

## A note on interpretation

Jung insisted the dreamer is the final authority on the dream. Everything this
app produces is *amplification* — material to test against your own felt sense,
not a verdict, not a prediction, and not a substitute for therapy.

## License

MIT — same as the repository.
