// UI wiring: tabs, interpretation flow, dictionary browsing, AI deep-dive.

import { SYMBOLS, CATEGORIES } from "./data/symbols.js";
import { ARCHETYPES } from "./data/archetypes.js";
import { analyzeDream } from "./engine.js";
import { interpretWithClaude, getStoredKey, storeKey } from "./ai.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const SAMPLE_DREAM =
  "I am walking through a dark forest at night. I hear water — a river somewhere below. " +
  "Suddenly I realize I am being chased, though when I turn around I only see a tall shadowy figure between the trees. " +
  "I run until I reach an old house I somehow know is my grandmother's, and in the basement I find a door I have never seen before. " +
  "Behind it is a small room with a golden key lying on a table, and a snake coiled quietly around the table leg, watching me.";

// ── Tabs ──────────────────────────────────────────────────────────────
$$(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab").forEach((b) => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", String(b === btn));
    });
    $$(".tab-panel").forEach((p) =>
      p.classList.toggle("active", p.id === `tab-${btn.dataset.tab}`)
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

// ── Interpretation ────────────────────────────────────────────────────
let lastResult = null;
let lastDreamText = "";

$("#sample-btn").addEventListener("click", () => {
  $("#dream-input").value = SAMPLE_DREAM;
  runAnalysis();
});

$("#analyze-btn").addEventListener("click", runAnalysis);

function runAnalysis() {
  const text = $("#dream-input").value.trim();
  if (!text) {
    $("#dream-input").focus();
    return;
  }
  lastDreamText = text;
  lastResult = analyzeDream(text);
  renderResults(lastResult);
}

function renderResults(result) {
  const hasFindings = result.symbols.length > 0;
  $("#results").classList.toggle("hidden", !hasFindings);
  $("#no-results").classList.toggle("hidden", hasFindings);
  if (!hasFindings) return;

  $("#narrative").textContent = result.narrative;

  $("#archetype-results").innerHTML = result.dominant
    .map(({ archetype, score }) => {
      const max = result.dominant[0].score;
      const pct = Math.max(12, Math.round((score / max) * 100));
      return `
        <div class="archetype-card">
          <div class="archetype-head">
            <h3>${archetype.name}</h3>
            <span class="epithet">${archetype.epithet}</span>
          </div>
          <div class="meter"><div class="meter-fill" style="width:${pct}%"></div></div>
          <p>${archetype.inDream}</p>
        </div>`;
    })
    .join("");

  $("#symbol-results").innerHTML = result.symbols
    .map(
      ({ symbol }) => `
      <details class="symbol-card">
        <summary>
          <span class="symbol-name">${symbol.name}</span>
          <span class="symbol-cat">${CATEGORIES[symbol.category]}</span>
        </summary>
        <div class="symbol-body">
          <p>${symbol.meaning}</p>
          <div class="myths">
            ${symbol.mythology
              .map(
                (m) =>
                  `<p class="myth"><span class="culture">${m.culture}</span> ${m.text}</p>`
              )
              .join("")}
          </div>
        </div>
      </details>`
    )
    .join("");

  $("#questions").innerHTML = result.questions
    .map((q) => `<li>${q}</li>`)
    .join("");

  $("#ai-output").classList.add("hidden");
  $("#ai-status").classList.add("hidden");
  $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── AI deep-dive ──────────────────────────────────────────────────────
$("#api-key").value = getStoredKey();

$("#ai-btn").addEventListener("click", async () => {
  const key = $("#api-key").value.trim();
  const status = $("#ai-status");
  const output = $("#ai-output");

  if (!key) {
    status.textContent = "Enter your Anthropic API key first.";
    status.classList.remove("hidden");
    return;
  }
  if (!lastResult) return;

  storeKey(key);
  status.textContent = "Claude is contemplating your dream… (this can take a minute)";
  status.classList.remove("hidden");
  output.classList.add("hidden");
  $("#ai-btn").disabled = true;

  try {
    const text = await interpretWithClaude(key, lastDreamText, lastResult);
    output.innerHTML = renderMarkdown(text);
    output.classList.remove("hidden");
    status.classList.add("hidden");
  } catch (err) {
    status.textContent = `⚠ ${err.message}`;
  } finally {
    $("#ai-btn").disabled = false;
  }
});

// Minimal markdown renderer (headings, bold, italics, lists, paragraphs)
// — enough for Claude's structured output without pulling a dependency.
function renderMarkdown(md) {
  const escapeHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");

  const lines = escapeHtml(md).split("\n");
  const out = [];
  let inList = false;
  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.*)/);
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (h) out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

// ── Dictionary ────────────────────────────────────────────────────────
let activeCategory = "all";

function renderCategoryChips() {
  const chips = [
    `<button class="chip ${activeCategory === "all" ? "active" : ""}" data-cat="all">All</button>`,
    ...Object.entries(CATEGORIES).map(
      ([id, name]) =>
        `<button class="chip ${activeCategory === id ? "active" : ""}" data-cat="${id}">${name}</button>`
    ),
  ];
  $("#dict-categories").innerHTML = chips.join("");
  $$("#dict-categories .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      activeCategory = chip.dataset.cat;
      renderCategoryChips();
      renderDictionary();
    })
  );
}

function renderDictionary() {
  const query = $("#dict-search").value.trim().toLowerCase();
  const matches = SYMBOLS.filter((s) => {
    const inCat = activeCategory === "all" || s.category === activeCategory;
    const inQuery =
      !query ||
      s.name.toLowerCase().includes(query) ||
      s.keywords.some((k) => k.includes(query)) ||
      s.meaning.toLowerCase().includes(query);
    return inCat && inQuery;
  });

  $("#dict-grid").innerHTML =
    matches.length === 0
      ? `<p class="empty">No symbols match “${query}” — yet. Contributions welcome!</p>`
      : matches
          .map(
            (s) => `
      <details class="symbol-card">
        <summary>
          <span class="symbol-name">${s.name}</span>
          <span class="symbol-cat">${CATEGORIES[s.category]}</span>
        </summary>
        <div class="symbol-body">
          <p>${s.meaning}</p>
          <p class="linked">Archetypes: ${Object.keys(s.archetypes)
            .map((a) => ARCHETYPES[a]?.name)
            .filter(Boolean)
            .join(" · ")}</p>
          <div class="myths">
            ${s.mythology
              .map(
                (m) =>
                  `<p class="myth"><span class="culture">${m.culture}</span> ${m.text}</p>`
              )
              .join("")}
          </div>
        </div>
      </details>`
          )
          .join("");
}

$("#dict-search").addEventListener("input", renderDictionary);
renderCategoryChips();
renderDictionary();

// ── Archetype catalog ─────────────────────────────────────────────────
$("#archetype-catalog").innerHTML = Object.values(ARCHETYPES)
  .map(
    (a) => `
    <div class="panel archetype-full">
      <h2>${a.name}</h2>
      <p class="epithet">${a.epithet}</p>
      <p>${a.description}</p>
      <ul class="questions">
        ${(a.questions || []).map((q) => `<li>${q}</li>`).join("")}
      </ul>
    </div>`
  )
  .join("");
