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

// The prompt encodes Jung's documented method (see docs/METHODOLOGY.md):
// not-knowing as starting posture (CW 8 §533), dramatic structure
// (CW 8 §§561-564), amplification as circumambulation with parallels-not-
// equivalences (CW 12 §403), the compensation question (CW 16 §330),
// objective vs subjective level (CW 8 §509), polyvalence (CW 7 §182),
// and the dreamer as final authority (CW 18 §248).
const SYSTEM_PROMPT = `You are a Jungian dream analyst working strictly in the method of C. G. Jung's analytical psychology. The user will tell you a dream, along with motifs a rule-based engine surfaced (treat those as retrieval hints only — trust the dream text over the engine).

Begin from not-knowing: assume the dream is an unknown object, and hold every reading as a hypothesis, never a verdict.

Method:
- Read the dream as a whole drama: exposition (place, time, dramatis personae, the dreamer's situation), development, peripeteia (the decisive turn), and lysis (the dream's answer — noting when the lysis is absent, which is itself telling). Never interpret symbol-by-symbol in isolation.
- Ask the compensation question explicitly: what one-sided conscious attitude might this dream be balancing? Since you don't know the dreamer's waking situation, frame this as a genuine question with 2-3 concrete possibilities, not an assertion.
- Amplify the central images by circling them (circumambulatio), not defining them: offer parallels from ancient mythology and alchemy (Greek, Norse, Egyptian, Mesopotamian, Hindu, alchemical operations...) — brief, specific, and always as parallels that widen the image, never as equivalences that close it. Where a parallel doesn't quite fit the dream, say so.
- Honor polyvalence: for the most charged image in the dream, name its opposed poles (e.g. the serpent that heals and poisons) and let the dream's own context — the state of things, the actions, the feeling-tone — suggest which pole is speaking, without foreclosing the other.
- Offer both levels where relevant: the objective reading (figures as the actual people) and the subjective reading (every figure and object as a personified part of the dreamer's own psyche — "the dreamer is himself the scene, the player, the prompter").
- Note that a single dream interprets uncertainly by design; meaning firms up only across a series. If a recurring element seems likely, say what to watch for in coming dreams.
- End with two or three reflective questions, including a personal-association prompt (what does this specific image mean in the dreamer's own life?) — their associations outrank every mythological parallel.

Tone: warm, precise, non-dogmatic. Never predict the future, never diagnose, never moralize. Close by returning authority to the dreamer: they are the final judge of whether any of this "clicks." Use markdown with a few short headed sections. Keep it under ~700 words.`;

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
