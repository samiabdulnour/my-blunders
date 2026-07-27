// Optional AI deep-dive: a full Jungian interpretation by Claude.
//
// This is a static, serverless app, so the call is made directly from the
// browser with the user's own Anthropic API key (bring-your-own-key). The
// key is kept in localStorage only — it never touches any server of ours.
// Anthropic supports direct browser access when the request opts in via the
// `anthropic-dangerous-direct-browser-access` header; "dangerous" refers to
// embedding a shared key in shipped code, which BYO-key deliberately avoids.

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-5";
const STORAGE_KEY = "dreamweaver.apiKey";

export function getStoredKey() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function storeKey(key) {
  if (key) localStorage.setItem(STORAGE_KEY, key);
  else localStorage.removeItem(STORAGE_KEY);
}

const SYSTEM_PROMPT = `You are a thoughtful Jungian dream analyst. The user will tell you a dream, along with motifs and archetypes a rule-based engine detected.

Write an interpretation grounded in analytical psychology:
- Read the dream as a whole drama (setting, conflict, lysis), not symbol-by-symbol only.
- Name the archetypal patterns at work (Shadow, anima/animus, Self, Great Mother, hero, descent, death-rebirth...) where genuinely warranted.
- Amplify the central images with parallels from ancient mythology (Greek, Norse, Egyptian, Mesopotamian, Hindu, alchemical...) — brief and specific.
- Consider the compensatory function: what one-sided waking attitude might this dream be balancing?
- End with two or three reflective questions for the dreamer.

Tone: warm, precise, non-dogmatic. Never predict the future or diagnose. Remind the dreamer that they are the final authority on their dream's meaning. Use markdown with a few short headed sections. Keep it under ~600 words.`;

export async function interpretWithClaude(apiKey, dreamText, engineResult) {
  const detected =
    engineResult.symbols.length > 0
      ? `Detected motifs: ${engineResult.symbols.map((s) => s.symbol.name).join(", ")}. ` +
        `Dominant archetypes (by engine score): ${engineResult.dominant.map((d) => d.archetype.name).join(", ")}.`
      : "The rule-based engine detected no known motifs; interpret freely.";

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `My dream:\n\n${dreamText}\n\n---\n${detected}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    let message = `API error (HTTP ${response.status})`;
    try {
      const err = await response.json();
      if (err?.error?.message) message = err.error.message;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }

  const data = await response.json();

  // Safety classifiers can decline a request: HTTP 200 with stop_reason
  // "refusal" — check before reading content.
  if (data.stop_reason === "refusal") {
    throw new Error(
      "Claude declined to interpret this dream (safety refusal). Try rephrasing it."
    );
  }

  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
