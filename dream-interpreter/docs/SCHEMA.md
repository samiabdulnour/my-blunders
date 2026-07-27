# The Dictionary Entry Schema (v1 target)

The v0 dictionary (`js/data/symbols.js`) is a keyword-matcher — useful
plumbing, but not the goal. This document specifies the v1 data model,
designed so that **a singular "meaning" field literally cannot exist**.
Every schema decision below traces to a principle in the scholarship
(see `METHODOLOGY.md` and `SOURCES.md`).

## Three record types

Following the lesson of Thompson's Motif-Index vs the ATU type index
(elements and configurations are different layers), plus figures:

| Type | What it models | Examples |
|---|---|---|
| **IMAGE-MOTIF** | The smallest recurring image | serpent, key, flood, mirror, teeth |
| **NARRATIVE-PATTERN** | A configuration of motifs with stages | katabasis, night sea journey, dragon fight, sacred marriage |
| **FIGURE** | A personified archetypal figure | Great Mother, Trickster, Wise Old Man, Divine Child |

## Core fields (all types)

| Field | Content | Rationale |
|---|---|---|
| `id` | Stable alphanumeric ID (Thompson-style) | Citability and cross-references |
| `image_phenomenology` | The image *as image*: what it looks like, does, how it behaves. **No interpretation permitted in this field.** | Hillman: "stick with the image" — an image is already its own statement. Hall/Van de Castle shows description can precede theory |
| `families[]` | Multi-parent membership in the taxonomy families (`TAXONOMY.md`) | Real motifs are polycentric; single-parent trees force false disambiguation |
| `valences[]` | **Structured polarity block — validation requires at least two opposed entries.** Each: `{pole, imagery, psychological_reading, exemplum}`. Serpent: healing/poison, wisdom/regression | Jung: every archetype is bipolar (CW 7 ¶182: "symbols… often characterize a pair of opposites"); Neumann's four-pole schema; Edinger's lesser/greater coniunctio. Making this field plural and required is the single strongest schema-level guarantee of open interpretation |
| `context_modulators[]` | Enumerated dimensions that change the reading: state (water: ice / flood / spring / stagnant), action (chasing vs accompanying), relation to dreamer, feeling-tone, scale | Neumann: the identical symbol migrates between poles by state and function |
| `amplifications[]` | Cultural instantiations: `{tradition, source_citation, precis, divergence_note}`. The divergence note records where the parallel does **not** fit | Jung's amplification method — parallels, not equivalences. Forcing a divergence note per parallel prevents amplification collapsing into equation |
| `questions_to_the_dreamer[]` | The entry ends in questions, not conclusions: the compensation question ("what conscious attitude might this balance?" — CW 16 ¶330), an association prompt, a feeling-tone prompt | Jung: interpretation is hypothesis (CW 16 ¶322); von Franz: it must "click" for the dreamer |
| `personal_association_notice` | Fixed boilerplate rank-ordering the authorities: dreamer's associations > dream context > cultural amplification > archetypal parallel | CW 18 ¶248: "Never apply any theory, but always ask the patient how *he* feels about his dream-images" |
| `misuse_warnings[]` | Known reductive readings to avoid ("teeth = death" as fixed equation…) | Anti-dream-dictionary inoculation (Man and His Symbols, Part 1) |
| `see_also[]` + `neighbors[]` | Explicit cross-refs **plus** curated *unexpected* adjacencies | Warburg's "law of the good neighbour": adjacency as interpretation engine |
| `dream_situation_links[]` | Which Family-0 typical dream situations commonly carry this image | Bridges the lay entry point to the depth material |
| `sources[]` | CW paragraph numbers; Neumann / Edinger / von Franz / Eliade page cites; primary-text links (Perseus / Gutenberg / ETCSL / Wikisource), split into *quoted (public domain)* vs *cited (in copyright)* | Scholarly apparatus; licensing discipline (see `SOURCES.md`) |

## Type-specific fields

**IMAGE-MOTIF** adds:
- `hvdc_facets` — object/setting/character class per the Hall/Van de Castle
  coding system, for empirical querying orthogonal to Jungian tagging
- `elemental_operation_tags[]` — Edinger's controlled vocabulary:
  `solutio, calcinatio, coagulatio, sublimatio, mortificatio, separatio, coniunctio`
- `modern_instantiations[]` — elevators, phones, exams, airports:
  archetypes wear contemporary dress

**NARRATIVE-PATTERN** adds:
- `stage_sequence[]` — ordered stages, mappable to the Campbell /
  Frobenius / Neumann stage vocabularies
- `configuration_start` / `configuration_end` — von Franz's dramatis-
  personae counts (the "3 becomes 4" move)
- `variant_outcomes[]` — Orpheus fails, Inanna pays ransom, Izanagi
  flees: the pattern's endings differ, and so do their psychologies

**FIGURE** adds:
- `neumann_axes` — placement on elementary/transformative ×
  positive/negative (the Great Mother four-pole diagram, generalized
  to all figures)
- `shadow_of` / `shadow_form` — every luminous figure links its dark
  form, and vice versa
- `relation_to_dreamer_prompts[]` — the figure means differently as
  pursuer, guide, patient, bride

## Rendering rules (product level — these enforce openness in the UI)

1. **Never render a "meaning" heading.** Render *Valences*, *Contexts*,
   *Parallels*, *Questions*.
2. **Always display at least two opposed valences above the fold** — the
   reader meets the tension before any elaboration.
3. Every entry page surfaces 2–3 Warburg-style **unexpected neighbors**.
4. **The dreamer-association prompt precedes the scholarly material** in
   any dream-lookup flow.
5. Prose is written in the ARAS essay genre: **circumambulation of the
   image, not definition** — Jung's own term for the method,
   *circumambulatio*, is the correct verb for what an entry does.

## What this means for the engine

Keyword detection remains only the *retrieval* layer — it finds which
entries might be in play. The *reading* layer must then:

1. Ask for the dreamer's personal associations **first** (rank-order of
   authorities, above).
2. Present valences as open tension, selected/weighted by
   `context_modulators` actually present in the dream text (the state of
   the water, the direction of movement, the feeling named).
3. Apply the dramatic-structure frame (exposition → development →
   peripeteia → lysis, CW 8 ¶¶561–564) to the dream as a whole, not
   symbol-by-symbol.
4. Ask the compensation question of the whole dream.
5. Treat a single dream as low-confidence by design: the method's
   error-correction is the **series** (CW 16 ¶322) — which is why the
   dream journal on the roadmap is not a nice-to-have but the method
   itself.
