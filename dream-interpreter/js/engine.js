// The interpretation engine: detects symbols in dream text, scores
// archetypes, and assembles a structured Jungian reading.

import { SYMBOLS } from "./data/symbols.js";
import { ARCHETYPES } from "./data/archetypes.js";

// Escape a keyword for use inside a RegExp.
function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match a keyword as whole words (multi-word phrases allowed).
function keywordRegex(keyword) {
  return new RegExp(`\\b${esc(keyword).replace(/\s+/g, "\\s+")}\\b`, "i");
}

export function analyzeDream(text) {
  const found = [];

  for (const symbol of SYMBOLS) {
    const hits = symbol.keywords.filter((kw) => keywordRegex(kw).test(text));
    if (hits.length > 0) {
      found.push({ symbol, matchedKeywords: hits });
    }
  }

  // Score archetypes from the matched symbols.
  const scores = {};
  for (const { symbol } of found) {
    for (const [archId, weight] of Object.entries(symbol.archetypes)) {
      scores[archId] = (scores[archId] || 0) + weight;
    }
  }

  const rankedArchetypes = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score, archetype: ARCHETYPES[id] }))
    .filter((a) => a.archetype);

  const dominant = rankedArchetypes.slice(0, 3);

  // Collect reflective questions from the dominant archetypes plus
  // per-symbol prompts, capped so the reading stays digestible.
  const questions = [];
  for (const { archetype } of dominant) {
    if (archetype.questions) questions.push(...archetype.questions.slice(0, 1));
  }

  return {
    symbols: found,
    archetypes: rankedArchetypes,
    dominant,
    questions: questions.slice(0, 4),
    narrative: buildNarrative(found, dominant),
  };
}

// Assemble a short narrative interpretation from the findings.
function buildNarrative(found, dominant) {
  if (found.length === 0) return null;

  const parts = [];
  const symbolNames = found.slice(0, 6).map((f) => f.symbol.name.toLowerCase());

  if (symbolNames.length === 1) {
    parts.push(
      `Your dream centres on one strong motif — ${symbolNames[0]}.`
    );
  } else {
    const last = symbolNames.pop();
    parts.push(
      `Your dream weaves together ${symbolNames.join(", ")} and ${last}.`
    );
  }

  if (dominant.length > 0) {
    const names = dominant.map((d) => d.archetype.name);
    if (names.length === 1) {
      parts.push(`The strongest archetypal current running through it is ${names[0]}.`);
    } else {
      const lastName = names.pop();
      parts.push(
        `The archetypal currents running strongest through it are ${names.join(", ")} and ${lastName}.`
      );
    }
    parts.push(dominant[0].archetype.inDream);
  }

  parts.push(
    "Remember Jung's caution: the dreamer is the final authority on the dream. " +
      "Treat everything below as amplification — material to test against your own felt sense, not a verdict."
  );

  return parts.join(" ");
}
