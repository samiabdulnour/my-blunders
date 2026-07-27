// The Jungian archetypes recognized by the interpretation engine.
// Each archetype accumulates weight when linked symbols appear in a dream.

export const ARCHETYPES = {
  self: {
    name: "The Self",
    epithet: "wholeness · the centre of the psyche",
    description:
      "The Self is the archetype of wholeness and the regulating centre of the psyche — what Jung called the God-image within. It appears in dreams as mandalas, circles, sacred centres, radiant children, royal figures, or precious objects that must be found. Dreams touched by the Self often mark turning points in individuation: the lifelong process of becoming who you actually are.",
    inDream:
      "Your dream gestures toward integration — parts of you that were separate may be seeking a centre. Pay attention to what stands at the middle of the dream's geography.",
    questions: [
      "What in your waking life feels like it is asking to be unified or made whole?",
      "If the dream had a centre — a place everything else arranged itself around — what stood there?",
    ],
  },
  shadow: {
    name: "The Shadow",
    epithet: "the rejected & unlived life",
    description:
      "The Shadow holds everything the ego refuses to acknowledge — shameful impulses, disowned talents, unlived potentials. In dreams it arrives as pursuers, dark figures, criminals, monsters, or same-sex strangers who repel or frighten us. Jung insisted the Shadow is 90% pure gold: what we flee in dreams is usually energy we have exiled from ourselves.",
    inDream:
      "Something disowned is asking to be met. The frightening figure is rarely an enemy — more often a rejected part of you demanding admission.",
    questions: [
      "What quality in other people irritates you most right now? Could the dream figure be carrying it for you?",
      "If you stopped running in the dream and turned around, what do you imagine the pursuer would say?",
    ],
  },
  anima: {
    name: "Anima / Animus",
    epithet: "the inner other · soul-image",
    description:
      "The contrasexual soul-image: the inner feminine in a man (anima), the inner masculine in a woman (animus) — or more broadly, the inner Other that mediates between ego and the deep unconscious. It appears as a mysterious, alluring, or guiding figure of the opposite sex: the stranger you cannot forget, the guide, the beloved, the witch, the magus.",
    inDream:
      "A soul-figure is active. Such figures rarely represent actual people; they personify the bridge to your own unconscious life — moods, images, longings, and creativity.",
    questions: [
      "What did this figure know, or carry, that you feel you lack?",
      "Where in your life is a relationship carrying meaning that really belongs to your own inner development?",
    ],
  },
  persona: {
    name: "The Persona",
    epithet: "the mask we show the world",
    description:
      "The Persona is the social mask — the compromise between who we are and what the world expects. Dreams about clothes, uniforms, nakedness in public, losing teeth, or being on stage often negotiate the persona: how much of the mask is protective, and how much has grown into the face.",
    inDream:
      "The dream is examining the gap between your inner reality and your public presentation. Exposure dreams are rarely about shame itself — they ask whether the mask still fits.",
    questions: [
      "Where do you feel the difference between who you are and who you must appear to be?",
      "What would actually happen if the people in the dream saw you without the mask?",
    ],
  },
  greatMother: {
    name: "The Great Mother",
    epithet: "nourishment, origin & devouring",
    description:
      "The Great Mother is dual: the nourishing source (earth, sea, womb, garden, home) and the devouring, engulfing force (the witch, the flood, the smothering house). She appears wherever the dream deals with origin, dependency, containment, and the pull back toward the unconscious.",
    inDream:
      "The dream is negotiating nourishment and engulfment — what feeds you, and what swallows you. Ask which face of the Mother is turned toward you.",
    questions: [
      "What currently nourishes you — and could the same thing be swallowing you?",
      "What would growing beyond a comfortable containment cost you?",
    ],
  },
  wiseOld: {
    name: "The Wise Old Man / Woman",
    epithet: "senex · sophia · the spirit of meaning",
    description:
      "The archetype of spirit and meaning: the sage, hermit, teacher, wizard, crone, or unexpectedly wise stranger. This figure appears when the ego is at the end of its resources and a wider knowledge is needed. Jung called it the 'archetype of the spirit' — it gifts the dreamer insight, a magical object, or a decisive word.",
    inDream:
      "Guidance is constellated. The dream suggests the answer you seek is not more effort but a different kind of knowing.",
    questions: [
      "What advice did (or would) the wise figure give — and what stops you from already knowing it?",
      "Where are you exhausting yourself with willpower when what's needed is insight?",
    ],
  },
  child: {
    name: "The Divine Child",
    epithet: "new beginnings · futurity",
    description:
      "The Child archetype embodies emerging potential — the future personality in seed form. Dream babies, miraculous children, or vulnerable young animals often carry it. It is both vulnerable (easily neglected) and invincible (it survives abandonment in every myth). A child in a dream frequently marks something newly born in the psyche that needs protection.",
    inDream:
      "Something new is being born in you — a project, a capacity, an attitude. Its appearance as a child signals both promise and the need for care.",
    questions: [
      "What new thing in your life is fragile right now and needs protecting?",
      "In the dream, was the child thriving or neglected — and what does that mirror?",
    ],
  },
  hero: {
    name: "The Hero",
    epithet: "the ego's journey against the dragon",
    description:
      "The Hero dramatizes the ego's struggle for consciousness: leaving home, facing the monster, winning the treasure, returning transformed. Battles, quests, rescues, and ordeals in dreams echo this pattern. But Jung warned the hero must eventually die — the willful ego attitude has to be sacrificed for something larger.",
    inDream:
      "You are in a struggle for consciousness — something must be confronted rather than avoided. Note whether the dream rewards fighting, or asks for a different response entirely.",
    questions: [
      "What dragon are you currently facing — and what treasure does it guard?",
      "Is the heroic effort in your life still serving you, or has it become the problem?",
    ],
  },
  trickster: {
    name: "The Trickster",
    epithet: "the sacred disruptor",
    description:
      "The Trickster — fox, coyote, jester, thief, shapeshifter — overturns order, embarrasses the ego, and smuggles in renewal through chaos. Dreams where everything absurdly goes wrong, where you are cheated, or where a mischievous figure derails your plans often carry trickster energy: the psyche's protest against an attitude that has become too rigid.",
    inDream:
      "The dream's chaos may be corrective. Where life has become too controlled or too self-serious, the Trickster loosens the soil.",
    questions: [
      "What part of your life has become too rigid, too planned, too correct?",
      "What did the disruption in the dream make possible that order never would?",
    ],
  },
  deathRebirth: {
    name: "Death & Rebirth",
    epithet: "transformation · the great transition",
    description:
      "Dreams of death, dying, killing, funerals, or dead relatives almost never predict literal death. They mark transformation: an attitude, identity, or life-phase is ending so another can begin. Alchemical and mythic imagery — burning, drowning, burial, dismemberment, then renewal — belongs here.",
    inDream:
      "Something in you is ending — and the dream frames it as necessary. Grief for the old form and space for the new one can coexist.",
    questions: [
      "What phase of life, identity, or self-image is currently dying?",
      "If the death in the dream was symbolic, what is trying to be born in its place?",
    ],
  },
  descent: {
    name: "The Descent",
    epithet: "nekyia · the night sea journey",
    description:
      "The Descent — into caves, basements, underwater, the underworld — is the mythic pattern Jung called the night sea journey: consciousness sinking into the unconscious to retrieve what was lost. Every culture tells it: Inanna into the underworld, Orpheus, Jonah in the whale, Persephone. Going down is not defeat; it is how depth is gained.",
    inDream:
      "You are being invited downward — into feeling, memory, or the unknown parts of yourself. The treasure in these journeys is always found at the bottom.",
    questions: [
      "What are you being asked to go down into that you have been avoiding?",
      "What did you find, or glimpse, in the lowest place of the dream?",
    ],
  },
};
