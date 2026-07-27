// The dream symbol dictionary.
//
// Each entry: id, name, category, keywords (matched against the dream text,
// multi-word phrases allowed), archetypes (map of archetype id -> weight),
// meaning (Jungian reading), mythology (amplification parallels).
//
// This dictionary is the heart of the app — contributions welcome.

export const CATEGORIES = {
  water: "Water & the Deep",
  animals: "Animals",
  nature: "Nature & Elements",
  places: "Places & Structures",
  figures: "Figures & People",
  body: "The Body",
  objects: "Objects",
  events: "Actions & Events",
  celestial: "Sky & Cosmos",
};

export const SYMBOLS = [
  // ── Water & the Deep ────────────────────────────────────────────────
  {
    id: "water",
    name: "Water",
    category: "water",
    keywords: ["water", "waters"],
    archetypes: { greatMother: 2, descent: 1, self: 1 },
    meaning:
      "Water is the most common dream image of the unconscious itself — the element consciousness floats upon. Its condition matters: clear or murky, calm or raging, shallow or bottomless mirrors your current relation to your own depths.",
    mythology: [
      { culture: "Babylonian", text: "Creation begins in Tiamat's primordial salt waters — the world is made from the body of the deep." },
      { culture: "Biblical", text: "The spirit moves over the face of the waters before anything is formed — water as pre-creation potential." },
    ],
  },
  {
    id: "ocean",
    name: "Ocean / Sea",
    category: "water",
    keywords: ["ocean", "sea", "seas", "tide", "waves", "wave"],
    archetypes: { greatMother: 2, descent: 2, self: 1 },
    meaning:
      "The ocean is the collective unconscious in its vastness — mother of life, indifferent to the individual. Standing at its shore is standing at the edge of everything you don't yet know about yourself. Storms at sea suggest emotional forces beyond the ego's control.",
    mythology: [
      { culture: "Greek", text: "Oceanus encircles the world; Aphrodite is born from sea-foam — love itself rises out of the deep." },
      { culture: "Norse", text: "Jörmungandr, the world-serpent, sleeps in the ocean encircling Midgard — the containing, threatening deep at the edge of the known world." },
    ],
  },
  {
    id: "river",
    name: "River",
    category: "water",
    keywords: ["river", "stream", "current", "riverbank"],
    archetypes: { deathRebirth: 2, descent: 1 },
    meaning:
      "The river is life's directed flow — time, fate, and the course of libido (psychic energy). Crossing a river marks a transition between life-phases; swimming against the current suggests resisting your own nature.",
    mythology: [
      { culture: "Greek", text: "The Styx divides the living from the dead; crossing it is the irreversible transition." },
      { culture: "Hindu", text: "The Ganges purifies and carries the dead to liberation — the river as both passage and grace." },
    ],
  },
  {
    id: "flood",
    name: "Flood",
    category: "water",
    keywords: ["flood", "flooding", "flooded", "tsunami", "tidal wave", "deluge"],
    archetypes: { greatMother: 2, deathRebirth: 2, shadow: 1 },
    meaning:
      "A flood is the unconscious overwhelming the ego's ordered world — emotion, change, or repressed life rising faster than you can contain it. Mythically, floods end an era so a new one can begin; the question is what survives in your ark.",
    mythology: [
      { culture: "Mesopotamian", text: "Utnapishtim survives the deluge in Gilgamesh — the flood destroys a world that had grown corrupt." },
      { culture: "Biblical", text: "Noah's flood: total dissolution as the precondition of covenant and renewal." },
    ],
  },
  {
    id: "drowning",
    name: "Drowning",
    category: "water",
    keywords: ["drowning", "drown", "drowned", "sinking", "underwater", "under water", "submerged"],
    archetypes: { descent: 2, deathRebirth: 2, greatMother: 1 },
    meaning:
      "Drowning dramatizes the ego losing its footing in the unconscious — overwhelmed by feeling, a relationship, or a life situation. Yet in myth, being swallowed by the waters is often the beginning of initiation, not the end of the story.",
    mythology: [
      { culture: "Biblical", text: "Jonah swallowed by the great fish: three days in the belly of the deep precede the true vocation." },
      { culture: "Sumerian", text: "Inanna descends through the gates and hangs lifeless — before rising with authority over both worlds." },
    ],
  },
  {
    id: "ice",
    name: "Ice & Snow",
    category: "water",
    keywords: ["ice", "snow", "frozen", "freezing", "glacier", "blizzard"],
    archetypes: { shadow: 1, deathRebirth: 1 },
    meaning:
      "Frozen water is feeling arrested — emotion preserved but inaccessible. A landscape of ice often depicts a life or relationship where warmth has been withdrawn. Thawing in a dream is one of the most hopeful images the psyche produces.",
    mythology: [
      { culture: "Norse", text: "Creation begins when the ice of Niflheim meets the fire of Muspelheim — life requires the frozen to melt." },
    ],
  },

  // ── Animals ─────────────────────────────────────────────────────────
  {
    id: "snake",
    name: "Snake / Serpent",
    category: "animals",
    keywords: ["snake", "snakes", "serpent", "serpents", "cobra", "viper", "python"],
    archetypes: { deathRebirth: 2, shadow: 2, self: 1 },
    meaning:
      "The serpent is the oldest and most ambivalent dream symbol: instinctual life, healing, sexuality, transformation (it sheds its skin), and the cold, pre-human layer of the psyche. Fear of the dream-snake often measures fear of one's own instinctual depths.",
    mythology: [
      { culture: "Greek", text: "Asclepius heals with the serpent-entwined staff — the same energy that poisons, cures." },
      { culture: "Alchemical", text: "The Ouroboros devours its own tail: the cycle of dissolution and renewal, prima materia of transformation." },
      { culture: "Hindu", text: "Kundalini — serpent-power coiled at the base of the spine, the body's own dormant divinity." },
    ],
  },
  {
    id: "dog",
    name: "Dog",
    category: "animals",
    keywords: ["dog", "dogs", "puppy", "hound"],
    archetypes: { shadow: 1, descent: 1 },
    meaning:
      "The dog is instinct that has made friends with consciousness — loyalty, guardianship, and the helpful animal soul. A threatening dog suggests instinct turned against you through neglect; a guiding dog is one of the psyche's classic psychopomps.",
    mythology: [
      { culture: "Greek", text: "Cerberus guards the threshold of the underworld — the instinctual gatekeeper of the deep." },
      { culture: "Egyptian", text: "Anubis, the jackal-headed, guides souls through the land of the dead and weighs the heart." },
    ],
  },
  {
    id: "cat",
    name: "Cat",
    category: "animals",
    keywords: ["cat", "cats", "kitten"],
    archetypes: { anima: 2, shadow: 1 },
    meaning:
      "The cat carries the independent, feminine, half-wild soul — affectionate on its own terms, never fully domesticated. In dreams it often points to a part of you that refuses to be controlled or explained.",
    mythology: [
      { culture: "Egyptian", text: "Bastet — protector, pleasure, and ferocity in one feline goddess." },
      { culture: "Norse", text: "Freyja's chariot is drawn by cats: sensual sovereignty in the service of the goddess." },
    ],
  },
  {
    id: "wolf",
    name: "Wolf",
    category: "animals",
    keywords: ["wolf", "wolves"],
    archetypes: { shadow: 2, trickster: 1 },
    meaning:
      "The wolf is untamed instinct at the edge of the civilized world — hunger, wildness, and pack-loyalty the ego fears. A wolf at the door in a dream often marks appetites or angers that will not stay repressed much longer.",
    mythology: [
      { culture: "Norse", text: "Fenrir, bound by the gods out of fear, breaks free at Ragnarök — the repressed devours what repressed it." },
      { culture: "Roman", text: "The she-wolf suckles Romulus and Remus — the wild as unexpected mother of civilization." },
    ],
  },
  {
    id: "bear",
    name: "Bear",
    category: "animals",
    keywords: ["bear", "bears"],
    archetypes: { greatMother: 2, shadow: 1 },
    meaning:
      "The bear is primal maternal power — protective and terrifying in equal measure — and the hibernating cycle of withdrawal and return. Meeting a bear can mark a confrontation with overwhelming feeling, especially rage or fierce protectiveness.",
    mythology: [
      { culture: "Greek", text: "Artemis's bear-maidens at Brauron; Callisto transformed into a bear and set among the stars." },
      { culture: "Circumpolar", text: "Bear-cult ceremonies across the north honor the animal that dies and returns — nature's own death-rebirth teacher." },
    ],
  },
  {
    id: "horse",
    name: "Horse",
    category: "animals",
    keywords: ["horse", "horses", "stallion", "mare", "riding"],
    archetypes: { hero: 1, greatMother: 1 },
    meaning:
      "The horse is vital energy — libido — as it carries the rider: the body, instinct, and momentum of life under (or out of) the ego's guidance. A runaway horse suggests life-energy beyond control; a dying horse, exhausted vitality.",
    mythology: [
      { culture: "Greek", text: "Pegasus springs from Medusa's severed neck — winged inspiration born from confronting the terrible." },
      { culture: "Norse", text: "Sleipnir, Odin's eight-legged horse, carries the god between the worlds." },
    ],
  },
  {
    id: "bird",
    name: "Bird",
    category: "animals",
    keywords: ["bird", "birds", "eagle", "owl", "raven", "crow", "dove", "swan"],
    archetypes: { self: 1, wiseOld: 1, anima: 1 },
    meaning:
      "Birds are thoughts, spirit, and the soul's capacity to rise above the literal. Their species colors the message: the owl sees in the dark (wisdom in the unconscious), the raven mediates death and prophecy, the dove peace and eros, the eagle far-sight and dominion.",
    mythology: [
      { culture: "Norse", text: "Huginn and Muninn — Thought and Memory — fly the world and return to whisper in Odin's ear." },
      { culture: "Egyptian", text: "The Ba-bird: the soul itself, portrayed with wings, free to leave and return to the body." },
    ],
  },
  {
    id: "spider",
    name: "Spider",
    category: "animals",
    keywords: ["spider", "spiders", "web", "cobweb", "spiderweb"],
    archetypes: { greatMother: 2, shadow: 1 },
    meaning:
      "The spider spins the web of fate and entanglement — often the devouring aspect of the mother-imago or a situation in which you feel caught. Yet she is also the great weaver: patience, craft, and the making of intricate designs.",
    mythology: [
      { culture: "Greek", text: "Arachne, who wove truth too boldly, transformed into the eternal weaver." },
      { culture: "Native American", text: "Grandmother Spider steals the sun and brings light — the weaver as culture-bringer." },
    ],
  },
  {
    id: "dragon",
    name: "Dragon / Monster",
    category: "animals",
    keywords: ["dragon", "monster", "monsters", "beast", "creature", "demon"],
    archetypes: { hero: 2, shadow: 2, greatMother: 1 },
    meaning:
      "The dragon is the guardian of the treasure — the terrifying form the unconscious takes when it holds something the ego needs. In Jung's reading, the hero's dragon-fight is the struggle with the regressive pull of the unconscious; the hoard it guards is your own unlived life.",
    mythology: [
      { culture: "Norse/Germanic", text: "Sigurd slays Fafnir and, tasting the dragon's blood, suddenly understands the language of birds — new perception is the real treasure." },
      { culture: "Babylonian", text: "Marduk defeats Tiamat and builds the cosmos from her body — order is made out of chaos, not against it." },
    ],
  },
  {
    id: "fish",
    name: "Fish",
    category: "animals",
    keywords: ["fish", "fishes", "salmon", "whale"],
    archetypes: { self: 2, descent: 1 },
    meaning:
      "Fish are living contents of the unconscious — glimpses of what moves beneath the surface. Catching a fish is retrieving something from the depths; a great fish or whale can be the Self announcing itself from below.",
    mythology: [
      { culture: "Celtic", text: "The Salmon of Wisdom: whoever tastes it gains all knowledge — insight fished from the well of the deep." },
      { culture: "Christian", text: "The fish as sign of Christ — the Self-symbol drawn from the waters of the collective." },
    ],
  },

  // ── Nature & Elements ───────────────────────────────────────────────
  {
    id: "fire",
    name: "Fire",
    category: "nature",
    keywords: ["fire", "flames", "flame", "burning", "burned", "burnt", "blaze", "wildfire"],
    archetypes: { deathRebirth: 2, shadow: 1, hero: 1 },
    meaning:
      "Fire is transformation at its most intense — passion, rage, purification, destruction and illumination in one element. What burns in the dream is being transformed; whether the fire warms or destroys mirrors your relation to your own intensity.",
    mythology: [
      { culture: "Greek", text: "Prometheus steals fire for humanity and pays in eternal torment — consciousness is bought at a price." },
      { culture: "Alchemical", text: "Calcinatio: the burning away of the inessential, first operation of the great work." },
    ],
  },
  {
    id: "forest",
    name: "Forest / Woods",
    category: "nature",
    keywords: ["forest", "woods", "jungle", "thicket", "grove"],
    archetypes: { descent: 2, shadow: 1, greatMother: 1 },
    meaning:
      "The forest is the unconscious as territory — untamed, trackless, alive. Fairy tales begin when someone enters the woods, because that is where the known self ends. Being lost in the forest is the classic image of a life that has wandered off its conscious map.",
    mythology: [
      { culture: "Medieval", text: "Dante wakes 'in a dark wood, the straight way lost' — the midlife descent begins in the trees." },
      { culture: "European folk", text: "Every fairy-tale forest hides both the witch's hut and the treasure — danger and initiation share one address." },
    ],
  },
  {
    id: "mountain",
    name: "Mountain",
    category: "nature",
    keywords: ["mountain", "mountains", "peak", "summit", "cliff", "climbing"],
    archetypes: { self: 2, hero: 1, wiseOld: 1 },
    meaning:
      "The mountain is the goal seen from afar — the higher standpoint, the place of vision and revelation. Climbing dramatizes individuation's effort; the summit is the Self's perspective, from which the maze of the valley becomes a map.",
    mythology: [
      { culture: "Greek", text: "Olympus — the gods dwell on the height that humans see but rarely climb." },
      { culture: "Biblical", text: "Moses receives the law on Sinai; revelation happens on mountains, not in market squares." },
    ],
  },
  {
    id: "tree",
    name: "Tree",
    category: "nature",
    keywords: ["tree", "trees", "oak", "roots", "branches"],
    archetypes: { self: 2, greatMother: 1 },
    meaning:
      "The tree is the Self in vegetable form: rooted in the dark (the unconscious), crowned in the light (consciousness), growing through decades of seasons. Its condition in a dream — flourishing, withered, cut down, blooming — is a portrait of your own growth.",
    mythology: [
      { culture: "Norse", text: "Yggdrasil, the world-tree, joins the nine worlds; Odin hangs on it nine nights to win the runes." },
      { culture: "Buddhist", text: "The Buddha awakens under the Bodhi tree — enlightenment happens at the trunk of the world." },
    ],
  },
  {
    id: "storm",
    name: "Storm",
    category: "nature",
    keywords: ["storm", "thunder", "lightning", "hurricane", "tornado", "tempest", "gale"],
    archetypes: { shadow: 1, deathRebirth: 1, hero: 1 },
    meaning:
      "The storm is affect — emotion of divine voltage discharging through the dream's sky. Lightning in particular is sudden insight or sudden destruction: the flash that changes the landscape in an instant.",
    mythology: [
      { culture: "Greek", text: "Zeus's thunderbolt: the authority of sudden, absolute decision." },
      { culture: "Norse", text: "Thor's hammer both destroys giants and hallows weddings — raw power in service of order." },
    ],
  },
  {
    id: "desert",
    name: "Desert / Wasteland",
    category: "nature",
    keywords: ["desert", "wasteland", "barren", "drought", "wilderness"],
    archetypes: { descent: 1, deathRebirth: 1, wiseOld: 1 },
    meaning:
      "The desert is life stripped to essentials — spiritual dryness, but also the traditional place of vision. When the dream turns desert, ask what has stopped flowing in your life, and remember that every tradition sends its prophets to the wilderness on purpose.",
    mythology: [
      { culture: "Biblical", text: "Forty years in the wilderness, forty days of temptation — the desert is where identity is forged." },
      { culture: "Arthurian", text: "The Wasteland blooms only when the right question is finally asked — 'Whom does the Grail serve?'" },
    ],
  },
  {
    id: "garden",
    name: "Garden",
    category: "nature",
    keywords: ["garden", "orchard", "flowers", "blooming", "meadow"],
    archetypes: { self: 1, greatMother: 1, anima: 1 },
    meaning:
      "The garden is nature in dialogue with consciousness — the psyche as cultivated ground. What grows there, and what state it is in, reflects your inner cultivation. A walled garden is also the classic image of the soul's protected, intimate centre.",
    mythology: [
      { culture: "Biblical", text: "Eden — wholeness before the split of consciousness; every garden dream carries a little of its memory." },
      { culture: "Greek", text: "The Garden of the Hesperides: golden apples at the world's western edge, guarded, hard-won." },
    ],
  },

  // ── Places & Structures ─────────────────────────────────────────────
  {
    id: "house",
    name: "House",
    category: "places",
    keywords: ["house", "home", "apartment", "mansion", "rooms", "room"],
    archetypes: { self: 2, persona: 1 },
    meaning:
      "The house is the psyche's self-portrait: its floors are layers of consciousness, its rooms capacities and memories. Discovering new rooms is discovering unlived potential; the state of the house — grand, crumbling, familiar, strange — maps your current selfhood.",
    mythology: [
      { culture: "Jung's own dream", text: "Jung's multi-storey house dream — salon above, medieval floors below, a prehistoric cave at bottom — gave him the very idea of the collective unconscious." },
    ],
  },
  {
    id: "basement",
    name: "Basement / Cellar",
    category: "places",
    keywords: ["basement", "cellar", "underground", "crypt", "catacomb"],
    archetypes: { descent: 2, shadow: 2 },
    meaning:
      "The basement is the personal unconscious under the house of the ego — where the household stores what it doesn't want upstairs. Fear on the cellar stairs is fear of your own stored material; what you find down there wants to be brought into the light.",
    mythology: [
      { culture: "Greek", text: "Hades' realm lies directly below the living world — the dead (the repressed) continue their existence under the floorboards." },
    ],
  },
  {
    id: "attic",
    name: "Attic",
    category: "places",
    keywords: ["attic", "loft", "upstairs"],
    archetypes: { wiseOld: 1, persona: 1, self: 1 },
    meaning:
      "The attic holds inherited things — ideas, memories, family attitudes stored overhead. Dreams of attics often deal with the mental and spiritual inheritance you carry: treasures and clutter from previous generations of your own life.",
    mythology: [
      { culture: "Folk motif", text: "The forgotten chest in the attic that holds the grandmother's dowry — inheritance waiting to be reclaimed." },
    ],
  },
  {
    id: "door",
    name: "Door / Gate",
    category: "places",
    keywords: ["door", "doors", "gate", "gates", "doorway", "threshold", "entrance"],
    archetypes: { descent: 1, self: 1, hero: 1 },
    meaning:
      "The door is possibility and threshold — an opening between states of being. Locked doors mark potentials not yet accessible; a door you've never noticed in a familiar place is the psyche's invitation to a new capacity.",
    mythology: [
      { culture: "Roman", text: "Janus, two-faced god of doorways, looks backward and forward at once — every threshold is also a January." },
      { culture: "Sumerian", text: "Inanna passes seven gates into the underworld, surrendering something at each — thresholds take their toll." },
    ],
  },
  {
    id: "stairs",
    name: "Stairs",
    category: "places",
    keywords: ["stairs", "staircase", "stairway", "steps", "ladder", "escalator", "elevator", "lift"],
    archetypes: { descent: 1, self: 1 },
    meaning:
      "Stairs connect the psyche's levels — going up toward consciousness and spirit, down toward instinct and the unconscious. Endless or broken stairs suggest a transition that isn't completing; the direction you travel is the dream's compass.",
    mythology: [
      { culture: "Biblical", text: "Jacob's ladder — traffic between heaven and earth moves in both directions." },
      { culture: "Egyptian", text: "The step pyramid: a stairway built for the soul's ascent." },
    ],
  },
  {
    id: "bridge",
    name: "Bridge",
    category: "places",
    keywords: ["bridge", "crossing", "footbridge"],
    archetypes: { deathRebirth: 1, self: 1, hero: 1 },
    meaning:
      "The bridge spans what cannot otherwise be crossed — a transition between life-stages, attitudes, or worlds. A fragile or collapsing bridge measures your trust in the transition you are attempting.",
    mythology: [
      { culture: "Norse", text: "Bifröst, the rainbow bridge between the worlds of gods and humans — beautiful, and destined to break at the great crisis." },
      { culture: "Persian", text: "The Chinvat bridge widens for the just and narrows to a blade for the unjust — the crossing tests the soul." },
    ],
  },
  {
    id: "labyrinth",
    name: "Labyrinth / Maze",
    category: "places",
    keywords: ["labyrinth", "maze", "lost", "corridors", "endless hallway", "hallways"],
    archetypes: { descent: 2, hero: 1, self: 1 },
    meaning:
      "The labyrinth is the winding way to the centre — individuation's actual geometry, which is never a straight line. Being lost in mazes or endless corridors suggests circling something central you haven't yet faced; the thread that leads out is usually a feeling, not a thought.",
    mythology: [
      { culture: "Greek", text: "Theseus needs Ariadne's thread to face the Minotaur — no one finds the centre, or the way back, without the feminine thread of feeling." },
    ],
  },
  {
    id: "church",
    name: "Temple / Church",
    category: "places",
    keywords: ["church", "temple", "cathedral", "chapel", "shrine", "altar", "mosque", "synagogue"],
    archetypes: { self: 2, wiseOld: 1 },
    meaning:
      "Sacred buildings are the architecture of the Self — the psyche's dedicated space for what transcends the ego. Their condition in dreams (ruined, locked, luminous, repurposed) reflects your living relationship to meaning itself.",
    mythology: [
      { culture: "Greek", text: "The temple at Delphi bore the command 'Know thyself' — the sacred site and self-knowledge share an address." },
    ],
  },
  {
    id: "school",
    name: "School / Exam",
    category: "places",
    keywords: ["school", "classroom", "exam", "test", "examination", "unprepared", "graduation", "university", "college"],
    archetypes: { persona: 2, shadow: 1 },
    meaning:
      "The recurring exam dream — unprepared, late, the room unfindable — rarely concerns school. It replays situations where you feel tested and judged, or where an old standard of worth still grades you. Ask who is actually holding the red pen in your life now.",
    mythology: [
      { culture: "Egyptian", text: "The weighing of the heart against Ma'at's feather — the archetypal final exam, where the measure is truth, not performance." },
    ],
  },
  {
    id: "tower",
    name: "Tower",
    category: "places",
    keywords: ["tower", "towers", "skyscraper", "lighthouse"],
    archetypes: { persona: 1, self: 1, hero: 1 },
    meaning:
      "The tower is elevation and isolation at once — achievement, perspective, retreat from life, or spiritual pride. Jung built his own tower at Bollingen as a symbol of the Self in stone; a collapsing tower warns of a standpoint built too high above the ground of instinct.",
    mythology: [
      { culture: "Biblical", text: "Babel — the tower of inflation, unbuilt by the confusion it created." },
      { culture: "Tarot/European", text: "The lightning-struck Tower: the necessary collapse of a false structure." },
    ],
  },
  {
    id: "cave",
    name: "Cave",
    category: "places",
    keywords: ["cave", "cavern", "grotto", "tunnel", "tunnels"],
    archetypes: { descent: 2, greatMother: 2, wiseOld: 1 },
    meaning:
      "The cave is the womb of the earth — place of incubation, initiation, and encounters with what lives in the dark. Treasure, monsters, and rebirth share this address in every mythology; entering the cave is entering your own interior.",
    mythology: [
      { culture: "Greek", text: "Zeus is hidden and raised in a Cretan cave; Plato's cave holds humanity itself until one prisoner turns around." },
      { culture: "World myth", text: "Initiation rites across cultures bury the novice in a cave or pit — you must be swallowed by the earth to be reborn from it." },
    ],
  },
  {
    id: "ruin",
    name: "Ruins",
    category: "places",
    keywords: ["ruins", "ruin", "abandoned", "derelict", "crumbling", "demolished"],
    archetypes: { deathRebirth: 1, shadow: 1, wiseOld: 1 },
    meaning:
      "Ruins are the past still standing in the psyche — former identities, relationships, or ambitions whose walls remain. Exploring ruins can be an archaeology of your own history; what you find intact among them is what still lives.",
    mythology: [
      { culture: "Romantic", text: "The ruin as memento and threshold — ivy-grown abbeys where the numinous outlived the institution." },
    ],
  },

  // ── Figures & People ────────────────────────────────────────────────
  {
    id: "stranger",
    name: "The Stranger",
    category: "figures",
    keywords: ["stranger", "unknown man", "unknown woman", "figure", "shadowy figure", "dark figure", "hooded", "intruder", "someone i didn't know", "someone i did not know"],
    archetypes: { shadow: 2, anima: 1 },
    meaning:
      "Unknown figures are the psyche's unclaimed contents wearing faces. A same-sex stranger typically carries the Shadow; an opposite-sex stranger, the anima/animus. The feeling-tone — menace, fascination, familiarity — tells you how far the content is from being accepted.",
    mythology: [
      { culture: "Greek", text: "Gods walk the earth disguised as strangers; those who receive them well (Baucis and Philemon) are transformed — hospitality to the unknown is rewarded." },
    ],
  },
  {
    id: "mother",
    name: "Mother",
    category: "figures",
    keywords: ["mother", "mom", "mum", "grandmother", "grandma"],
    archetypes: { greatMother: 3, anima: 1 },
    meaning:
      "The dream-mother is rarely (only) your actual mother: she is the origin, the container, the first world. Dreams of her negotiate dependency, nourishment, and the pull backward toward safety — as well as your inheritance of her patterns, embraced or fought.",
    mythology: [
      { culture: "Greek", text: "Demeter's grief empties the world when Persephone descends — the mother-bond as a force of nature." },
      { culture: "Hindu", text: "Kali — mother, destroyer, and liberator in one figure; the full spectrum of the Great Mother made visible." },
    ],
  },
  {
    id: "father",
    name: "Father",
    category: "figures",
    keywords: ["father", "dad", "grandfather", "grandpa"],
    archetypes: { wiseOld: 2, persona: 1, hero: 1 },
    meaning:
      "The dream-father carries authority, law, order, and the spirit-principle — your relation to structure, judgment, and legitimacy. Conflict with him often dramatizes the struggle to author your own life; his blessing, when it comes, is the dream's deepest permission.",
    mythology: [
      { culture: "Greek", text: "Kronos devours his children; Zeus overthrows him — every generation's authority is both foundation and obstacle." },
    ],
  },
  {
    id: "child_fig",
    name: "Child / Baby",
    category: "figures",
    keywords: ["child", "children", "baby", "babies", "infant", "newborn", "toddler", "pregnant", "pregnancy", "gave birth", "giving birth"],
    archetypes: { child: 3, self: 1 },
    meaning:
      "The dream-child is new life in the psyche — a beginning, a talent, a self in seed. Pregnancy and birth dreams mark something gestating in you regardless of biology. A neglected or endangered dream-child asks urgently: what new thing in your life is not being cared for?",
    mythology: [
      { culture: "World myth", text: "The divine child — Moses in the basket, the infant Zeus hidden from Kronos — is always endangered and always survives." },
    ],
  },
  {
    id: "dead",
    name: "The Dead / Deceased",
    category: "figures",
    keywords: ["dead person", "deceased", "dead relative", "ghost", "ghosts", "someone who died", "who passed away", "funeral", "grave", "graveyard", "cemetery", "coffin"],
    archetypes: { deathRebirth: 2, wiseOld: 1, shadow: 1 },
    meaning:
      "Visits from the dead are conversations with what they represent in you — their qualities, their unfinished business, your unfinished grief. Such dreams often continue a relationship inwardly, integrating what the person carried for you while they lived.",
    mythology: [
      { culture: "Greek", text: "Odysseus pours blood for the shades so they may speak — the dead have counsel, but reaching it costs vitality." },
      { culture: "Mexican", text: "Día de los Muertos — the dead return as honored guests; the relationship continues, transformed." },
    ],
  },
  {
    id: "twin",
    name: "Twin / Double",
    category: "figures",
    keywords: ["twin", "double", "doppelganger", "my double", "someone who looked like me", "another me", "clone"],
    archetypes: { shadow: 2, self: 1 },
    meaning:
      "Meeting your double is meeting yourself objectified — often the Shadow in its most literal costume, or the other life you might have lived. The uncanny feeling such dreams carry marks how close the content is: it is not like you, it is you.",
    mythology: [
      { culture: "Egyptian", text: "The Ka — every person's double, born alongside them, tended after death." },
      { culture: "Roman", text: "The genius: the companion-spirit of a man, honored on his birthday — the other self as guardian." },
    ],
  },
  {
    id: "king",
    name: "King / Queen",
    category: "figures",
    keywords: ["king", "queen", "prince", "princess", "royal", "crown", "throne", "emperor"],
    archetypes: { self: 2, persona: 1, wiseOld: 1 },
    meaning:
      "Royal figures are the ruling principle of the psyche — the dominant attitude wearing its crown. An aging, sick, or dying king (alchemy's favorite image) means the reigning attitude is exhausted and must be renewed; a coronation marks a new centre taking the throne.",
    mythology: [
      { culture: "Arthurian", text: "The Fisher King's wound blights the whole land — when the ruling principle ails, everything ails." },
      { culture: "Alchemical", text: "The old king dissolved in the bath, reborn young — renewal of the dominant of consciousness." },
    ],
  },
  {
    id: "witchwizard",
    name: "Witch / Wizard",
    category: "figures",
    keywords: ["witch", "wizard", "sorcerer", "sorceress", "magician", "mage", "magic", "spell", "enchanted"],
    archetypes: { wiseOld: 2, shadow: 1, greatMother: 1, trickster: 1 },
    meaning:
      "Magical figures personify psychic power beyond the ego's understanding — transformative knowledge in benign or devouring form. The witch is often the dark side of the mother-imago; the wizard, spirit-power that can guide or manipulate. What matters is the bargain they offer.",
    mythology: [
      { culture: "Slavic", text: "Baba Yaga — devourer and initiatrix; those who answer her honestly leave her hut with fire." },
      { culture: "Welsh", text: "Ceridwen's cauldron of inspiration: three drops of transformation, pursued through shape after shape." },
    ],
  },

  // ── The Body ────────────────────────────────────────────────────────
  {
    id: "teeth",
    name: "Teeth Falling Out",
    category: "body",
    keywords: ["teeth", "tooth", "teeth falling", "teeth fell", "losing teeth", "lost a tooth", "crumbling teeth"],
    archetypes: { persona: 2, deathRebirth: 1 },
    meaning:
      "One of the most universal dreams. Teeth are how we bite into life and how we look when we smile — potency and presentation at once. Losing them clusters around times of losing grip, aging, transition, or fear that one's power and image are crumbling.",
    mythology: [
      { culture: "Greek", text: "Cadmus sows dragon's teeth and armed men spring up — teeth as seeds of primal power." },
      { culture: "Folk tradition", text: "Across cultures, tooth dreams were read as omens of change in the family — the body's calendar of transitions." },
    ],
  },
  {
    id: "naked",
    name: "Naked in Public",
    category: "body",
    keywords: ["naked", "nude", "no clothes", "without clothes", "undressed", "exposed"],
    archetypes: { persona: 3, shadow: 1 },
    meaning:
      "The nakedness dream strips the persona: you stand in your unedited truth before the collective. The crowd's reaction matters — often, tellingly, no one in the dream even notices, suggesting the exposure you fear is mostly self-judgment.",
    mythology: [
      { culture: "Biblical", text: "Adam and Eve, eyes opened, sew fig leaves — shame at exposure is the first fruit of self-consciousness." },
      { culture: "Sumerian", text: "Inanna is stripped of a garment at each of the seven gates — the descent demands nakedness; power returns to the one who endures it." },
    ],
  },
  {
    id: "blood",
    name: "Blood",
    category: "body",
    keywords: ["blood", "bleeding", "bled", "wound", "wounded", "injury", "injured"],
    archetypes: { deathRebirth: 2, hero: 1, shadow: 1 },
    meaning:
      "Blood is life-force made visible — vitality, sacrifice, kinship, and cost. Bleeding in a dream suggests psychic energy draining through some wound: name the wound and you name where life is leaking. Old wounds reopening point to unhealed history.",
    mythology: [
      { culture: "Norse", text: "Kvasir's blood becomes the mead of poetry — from sacrifice, inspiration." },
      { culture: "Greek", text: "The Grail and the wounded king: blood as the mystery of life poured out and (perhaps) renewed." },
    ],
  },
  {
    id: "eyes",
    name: "Eyes / Blindness",
    category: "body",
    keywords: ["eyes", "blind", "blindness", "couldn't see", "could not see", "vision blurred", "blurry vision", "seeing"],
    archetypes: { wiseOld: 2, self: 1 },
    meaning:
      "Eyes are consciousness itself. Dream-blindness suggests something you cannot — or will not — see; extraordinary vision, a knowing beyond the ordinary. A watching eye can be the Self's regard: the feeling of being seen by something greater within you.",
    mythology: [
      { culture: "Norse", text: "Odin trades an eye for a drink from the well of wisdom — one kind of sight is bought with another." },
      { culture: "Greek", text: "Tiresias, blinded, receives prophecy — the inner eye opens when the outer closes." },
    ],
  },
  {
    id: "voice",
    name: "Voice / Being Unable to Speak or Scream",
    category: "body",
    keywords: ["couldn't scream", "could not scream", "couldn't speak", "could not speak", "voiceless", "no voice", "tried to scream", "mute", "whisper"],
    archetypes: { shadow: 2, persona: 1 },
    meaning:
      "The scream that won't come is agency blocked at the throat — truth, protest, or need that cannot get out in waking life either. Ask where you are currently silent when everything in you wants to speak.",
    mythology: [
      { culture: "Greek", text: "Echo, cursed to repeat others' words, loses her own voice — the fate of a self that only mirrors." },
      { culture: "Danish/Andersen", text: "The Little Mermaid trades her voice for legs — what was given up to walk in the other world?" },
    ],
  },

  // ── Objects ─────────────────────────────────────────────────────────
  {
    id: "key",
    name: "Key",
    category: "objects",
    keywords: ["key", "keys", "unlock", "unlocked", "locked"],
    archetypes: { self: 2, wiseOld: 1 },
    meaning:
      "The key is access — the specific attitude, insight, or memory that opens what has been closed. Finding a key obligates you to find its door. Losing keys suggests losing access to some room of your own life.",
    mythology: [
      { culture: "Greek", text: "Hecate, keeper of keys, stands at the crossroads between the worlds — access to the hidden requires her." },
      { culture: "Folk", text: "Bluebeard's key that cannot be wiped clean — some doors, once opened, change the opener." },
    ],
  },
  {
    id: "mirror",
    name: "Mirror",
    category: "objects",
    keywords: ["mirror", "mirrors", "reflection", "reflected"],
    archetypes: { shadow: 2, self: 1, persona: 1 },
    meaning:
      "The mirror shows the self to the self — but which self? A reflection that differs from you (older, other, absent, monstrous) is the dream making a precise statement about the gap between identity and reality. Mirrors are doors if you look long enough.",
    mythology: [
      { culture: "Greek", text: "Narcissus and the pool; Perseus who can face the Gorgon only in the mirror-shield — some truths are viewable only indirectly." },
      { culture: "Japanese", text: "The mirror that lured Amaterasu from her cave — her own radiance, shown back, restored light to the world." },
    ],
  },
  {
    id: "treasure",
    name: "Treasure / Gold",
    category: "objects",
    keywords: ["treasure", "gold", "golden", "jewels", "jewel", "diamond", "diamonds", "pearl", "coins", "riches"],
    archetypes: { self: 3, hero: 1 },
    meaning:
      "Treasure is the Self's value in imaginal currency — 'the treasure hard to attain,' Jung's shorthand for the goal of individuation. Where it lies (underwater, in a cave, guarded) says what stands between you and your own worth.",
    mythology: [
      { culture: "Alchemical", text: "The philosopher's gold — not metal but the incorruptible self, made from the despised prima materia." },
      { culture: "Germanic", text: "The Rhinegold: treasure wrongly seized curses its holder — value taken without transformation destroys." },
    ],
  },
  {
    id: "sword",
    name: "Sword / Weapon",
    category: "objects",
    keywords: ["sword", "knife", "blade", "dagger", "weapon", "gun", "axe", "spear"],
    archetypes: { hero: 2, shadow: 1, wiseOld: 1 },
    meaning:
      "The blade is discrimination — the power to cut, decide, separate true from false. A weapon in your hand asks whether you can assert and defend; one raised against you often personifies your own turned-inward aggression or a cutting judgment you live under.",
    mythology: [
      { culture: "Arthurian", text: "Excalibur from the stone: rightful power that can only be claimed, never seized." },
      { culture: "Greek", text: "The sword of Damocles — power's edge hangs over the one who envies it." },
    ],
  },
  {
    id: "book",
    name: "Book / Letter",
    category: "objects",
    keywords: ["book", "books", "letter", "message", "note", "library", "scroll", "reading"],
    archetypes: { wiseOld: 2, self: 1 },
    meaning:
      "Books and letters are messages from the objective psyche — knowledge trying to reach the ego. An unreadable book or an unopened letter is meaning you sense but cannot yet decode. Libraries are the collective inheritance of the mind; note which shelf the dream takes you to.",
    mythology: [
      { culture: "Egyptian", text: "Thoth's Book of knowledge, hidden in nested boxes underwater, brings sorrow to those who steal rather than earn it." },
      { culture: "Norse", text: "The runes, won by Odin's ordeal on the tree — reading was a gift purchased with suffering." },
    ],
  },
  {
    id: "phone",
    name: "Phone / Failed Communication",
    category: "objects",
    keywords: ["phone", "telephone", "call", "calling", "couldn't dial", "phone wouldn't work", "no signal", "texting", "text message"],
    archetypes: { anima: 1, shadow: 1 },
    meaning:
      "The malfunctioning dream-phone — wrong numbers, dead lines, buttons that won't press — is failed connection: with another person, or between ego and some inner voice trying to get through. Ask who you cannot reach, and who cannot reach you.",
    mythology: [
      { culture: "Greek", text: "Hermes, the messenger, moves between all worlds — when the messenger fails in a dream, the worlds have stopped speaking." },
    ],
  },
  {
    id: "vehicle",
    name: "Car / Vehicle",
    category: "objects",
    keywords: ["car", "driving", "drove", "vehicle", "bus", "truck", "brakes", "steering", "crash", "crashed", "accident"],
    archetypes: { hero: 1, persona: 1 },
    meaning:
      "The vehicle is how you move through life — your drive, direction, and control. Failed brakes, a back-seat driver, or being unable to reach the pedals all diagnose your current agency with uncomfortable precision. Who is driving is the dream's real question.",
    mythology: [
      { culture: "Greek", text: "Phaethon takes the sun-chariot he cannot control — borrowed power without capacity ends in flames." },
      { culture: "Hindu", text: "The Gita's chariot: the body as vehicle, the senses as horses, and the question of who holds the reins." },
    ],
  },
  {
    id: "train",
    name: "Train / Missing It",
    category: "objects",
    keywords: ["train", "missed the train", "station", "platform", "railway", "subway", "metro", "airport", "missed the flight", "missed my flight", "plane", "airplane", "flight"],
    archetypes: { persona: 1, hero: 1 },
    meaning:
      "The train runs on collective tracks and collective schedules — the path society lays down. Missing it is the anxiety of falling out of step with expected timelines; boarding the wrong one, a life running on tracks you never chose.",
    mythology: [
      { culture: "Modern folklore", text: "The missed-departure dream is our era's version of the closing gate motif — the kairos moment that must be seized or waited for again." },
    ],
  },

  // ── Actions & Events ────────────────────────────────────────────────
  {
    id: "falling",
    name: "Falling",
    category: "events",
    keywords: ["falling", "fell", "fall", "plummet", "dropped from", "falling down"],
    archetypes: { descent: 2, persona: 1, shadow: 1 },
    meaning:
      "Falling is the loss of standpoint — ground, status, control, or certainty giving way. It often follows periods of inflation or overextension: what stands too high gets pulled down toward the ground of reality. Note whether the dream lets you land.",
    mythology: [
      { culture: "Greek", text: "Icarus — flight beyond human measure, and gravity's ancient correction of hubris." },
      { culture: "Biblical", text: "The fall from Eden: the primordial loss of unconscious paradise that begins every human story." },
    ],
  },
  {
    id: "flying",
    name: "Flying",
    category: "events",
    keywords: ["flying", "flew", "levitating", "levitate", "floating", "soaring", "hovering"],
    archetypes: { hero: 1, self: 1, trickster: 1 },
    meaning:
      "Flight is liberation from the literal — transcendence, wide perspective, and escape in one image. The joy of flying dreams marks real inner freedom; but flight that avoids landing can be dissociation dressed as transcendence. What are you above, and should you be?",
    mythology: [
      { culture: "Greek", text: "Daedalus flies the middle path and survives; his son does not — the dream tradition's oldest flight-safety briefing." },
      { culture: "Shamanic", text: "The shaman's magical flight — the soul travels to retrieve what was lost; flying as the oldest spiritual technology." },
    ],
  },
  {
    id: "chase",
    name: "Being Chased",
    category: "events",
    keywords: ["chased", "chasing", "chase", "pursued", "pursuing", "running from", "running away", "ran away", "fleeing", "escape", "escaping", "hunted", "following me", "followed me"],
    archetypes: { shadow: 3, hero: 1 },
    meaning:
      "The chase dream is the psyche's most reliable Shadow signature: what you run from is what you've refused to face, and it gains power from the running. Jung's practical counsel survives in dreamwork to this day — turn around and ask the pursuer what it wants.",
    mythology: [
      { culture: "Greek", text: "The Erinyes pursue Orestes until the debt is faced and transformed — pursuers stop when the reckoning happens." },
      { culture: "Greek", text: "Apollo chases Daphne, who escapes only by ceasing to be herself — flight from the pursuer can cost the runner her own form." },
    ],
  },
  {
    id: "death_event",
    name: "Dying / Death",
    category: "events",
    keywords: ["died", "dying", "death", "killed", "kill", "murder", "murdered", "i was dead"],
    archetypes: { deathRebirth: 3, shadow: 1 },
    meaning:
      "Dream-death is transformation's strongest image — an identity, attitude, or era ending. Dreaming of your own death often precedes major inner change; killing in a dream can be the (necessary or violent) suppression of some part of yourself. Ask what is ending, and what it makes room for.",
    mythology: [
      { culture: "Egyptian", text: "Osiris dismembered and reassembled — the god must die to become lord of the renewed life." },
      { culture: "Christian", text: "Death and resurrection as the central mystery: the grain that must fall into the ground." },
    ],
  },
  {
    id: "paralysis",
    name: "Paralysis / Unable to Move",
    category: "events",
    keywords: ["paralyzed", "paralysed", "couldn't move", "could not move", "frozen in place", "unable to move", "stuck", "trapped", "couldn't run", "could not run", "legs wouldn't move", "slow motion"],
    archetypes: { shadow: 2, descent: 1 },
    meaning:
      "Dream-paralysis — legs like lead, running through syrup — is conflict between impulses of equal force: part of you must act, part refuses. It maps waking situations where you feel powerless or where opposing obligations cancel each other into stillness.",
    mythology: [
      { culture: "Greek", text: "Medusa's gaze turns the living to stone — confrontation with the overwhelming freezes; only the mirror (reflection) restores movement." },
    ],
  },
  {
    id: "wedding",
    name: "Wedding / Marriage",
    category: "events",
    keywords: ["wedding", "marriage", "married", "marry", "bride", "groom", "engagement"],
    archetypes: { anima: 2, self: 2 },
    meaning:
      "The dream-wedding is the coniunctio — alchemy's sacred marriage of opposites. Beyond literal relationships, it images inner union: masculine and feminine, thinking and feeling, conscious and unconscious joining. Trouble at the dream-wedding shows which opposites still refuse each other.",
    mythology: [
      { culture: "Alchemical", text: "The chymical wedding of Sol and Luna — the union of opposites as the goal of the whole work." },
      { culture: "Greek", text: "Eros and Psyche: the soul's marriage survives only after impossible tasks and a descent to the underworld." },
    ],
  },
  {
    id: "search",
    name: "Searching / Losing Something",
    category: "events",
    keywords: ["searching", "looking for", "couldn't find", "could not find", "lost my", "missing", "misplaced", "searched"],
    archetypes: { self: 2, descent: 1 },
    meaning:
      "Endless searching — for a room, a person, an object you can't quite name — is the individuation urge in narrative form: something essential is missing and the psyche knows it. What you seek in such dreams is usually a quality, not a thing.",
    mythology: [
      { culture: "Egyptian", text: "Isis searches the world for the scattered pieces of Osiris — the archetypal search that re-members what was dismembered." },
      { culture: "Arthurian", text: "The Grail quest: the search itself reorders the seekers' lives; finding is almost beside the point." },
    ],
  },
  {
    id: "war",
    name: "War / Battle",
    category: "events",
    keywords: ["war", "battle", "fighting", "fight", "fought", "army", "soldiers", "attack", "attacked", "invasion", "bomb", "explosion"],
    archetypes: { hero: 2, shadow: 2 },
    meaning:
      "Inner war projected onto the dream-screen: sides of the personality in open conflict, a decision tearing you in two, or aggression seeking form. Which side you fight for — and whether the dream offers any image of peace — maps the state of the conflict.",
    mythology: [
      { culture: "Hindu", text: "The Gita opens on a battlefield between kin — the inner war made epic, with the divine as charioteer." },
      { culture: "Norse", text: "Ragnarök: the necessary catastrophe from which a green world rises — some conflicts must complete to renew." },
    ],
  },
  {
    id: "late",
    name: "Being Late",
    category: "events",
    keywords: ["late", "running late", "too late", "hurry", "hurrying", "rushing", "deadline"],
    archetypes: { persona: 2 },
    meaning:
      "The lateness dream measures the gap between your inner tempo and the schedule you believe you must keep. Chronic lateness dreams ask a pointed question: whose timetable are you failing — yours, or one you never actually agreed to?",
    mythology: [
      { culture: "Greek", text: "Kairos, the god of the opportune moment, has a forelock to grasp and a shaved back of the head — but the psyche's clock is not the town clock." },
    ],
  },

  // ── Sky & Cosmos ────────────────────────────────────────────────────
  {
    id: "sun",
    name: "Sun",
    category: "celestial",
    keywords: ["sun", "sunlight", "sunrise", "sunset", "dawn", "eclipse"],
    archetypes: { self: 2, hero: 1, deathRebirth: 1 },
    meaning:
      "The sun is consciousness itself — the ego's light and the Self's radiance. Sunrise marks new awareness dawning; sunset or eclipse, a necessary dimming (the night sea journey begins at dusk). A black or darkened sun is alchemy's sol niger: the crisis before renewal.",
    mythology: [
      { culture: "Egyptian", text: "Ra sails the underworld each night and battles the serpent Apep to rise again — consciousness is renewed only by nightly descent." },
    ],
  },
  {
    id: "moon",
    name: "Moon",
    category: "celestial",
    keywords: ["moon", "moonlight", "full moon", "lunar", "crescent"],
    archetypes: { anima: 2, greatMother: 1 },
    meaning:
      "The moon is the other light — feeling, rhythm, reflection, the knowledge that waxes and wanes. It rules the tidal, cyclical side of the psyche that solar willpower ignores. Moonlit dream-landscapes signal you are seeing by the psyche's own illumination.",
    mythology: [
      { culture: "Greek", text: "Selene, Artemis, Hecate — the moon's three faces: radiant, huntress, keeper of the dark crossroads." },
    ],
  },
  {
    id: "stars",
    name: "Stars",
    category: "celestial",
    keywords: ["stars", "star", "constellation", "night sky", "starry", "comet", "meteor"],
    archetypes: { self: 2, wiseOld: 1 },
    meaning:
      "Stars are distant certainties — guiding values, destiny, and the sense of an order larger than personal life. A falling star collapses that distance for one instant. To navigate by a star in a dream is to have found (or be seeking) your orienting value.",
    mythology: [
      { culture: "Greek", text: "Heroes are set among the stars — catasterism: a mortal life made into a permanent pattern of meaning." },
    ],
  },
  {
    id: "darkness",
    name: "Darkness / Night",
    category: "celestial",
    keywords: ["darkness", "dark", "night", "pitch black", "shadows", "blackness", "midnight"],
    archetypes: { shadow: 2, descent: 2, greatMother: 1 },
    meaning:
      "Darkness is the unknown as atmosphere — the unconscious not as a place but as a condition of seeing. Fear of dream-darkness is fear of what you cannot yet make out in yourself; eyes adjusting to the dark is one of the psyche's quiet images of growth.",
    mythology: [
      { culture: "Greek", text: "Nyx, Night, older than the Olympians — even Zeus stands in awe of her; the dark precedes and outranks the light." },
      { culture: "Mystical", text: "The 'dark night of the soul' — the necessary darkness in which an old way of seeing dies." },
    ],
  },
  {
    id: "mandala",
    name: "Circle / Mandala",
    category: "celestial",
    keywords: ["circle", "circles", "sphere", "ring", "mandala", "spiral", "wheel"],
    archetypes: { self: 3 },
    meaning:
      "The circle is the Self's signature — wholeness, the squared circle, the protected centre. Jung found spontaneous mandalas arising in dreams precisely at times of chaos, as the psyche's self-healing attempt to hold a centre. Note what stood at the middle.",
    mythology: [
      { culture: "Tibetan", text: "The mandala as meditation palace: the cosmos ordered around a sacred centre, built and dissolved." },
      { culture: "Alchemical", text: "The squaring of the circle — uniting the four elements into the one — as image of the completed work." },
    ],
  },
];
