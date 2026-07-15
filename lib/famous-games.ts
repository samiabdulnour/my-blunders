/**
 * A library of famous, instructive games for the Coordinates trainer's "play the
 * game" mode: you replay the moves on the board for both sides, which trains
 * board vision and pattern memory on canonical games.
 *
 * Moves are space-separated SAN from the start. Every game is validated against
 * chess.js (scripts/validate-games.mjs) — an illegal move would break the replay,
 * so the list only ships fully-legal games.
 */
export type Era =
  | 'Romantic era (before 1900)'
  | 'Classical & hypermodern (1900–1945)'
  | 'Soviet era (1945–1985)'
  | 'Modern & computer age (since 1985)';

export interface FamousGame {
  id: string;
  /** Display title for the picker, e.g. "Opera Game". */
  title: string;
  white: string;
  black: string;
  year: number;
  result: string;
  /** Era bucket used to group the picker into optgroups. */
  era: Era;
  /** A sentence or two of historical background, shown alongside the board. */
  context: string;
  /** Space-separated SAN, e.g. "e4 e5 Nf3 …". */
  san: string;
}

const ROMANTIC: Era = 'Romantic era (before 1900)';
const CLASSICAL: Era = 'Classical & hypermodern (1900–1945)';
const SOVIET: Era = 'Soviet era (1945–1985)';
const MODERN: Era = 'Modern & computer age (since 1985)';

export const FAMOUS_GAMES: FamousGame[] = [
  // ── Romantic era ──────────────────────────────────────────────────────────
  {
    id: 'legal',
    title: "Légal's Mate",
    white: 'De Légal',
    black: 'Saint Brie',
    year: 1750,
    result: '1-0',
    era: ROMANTIC,
    context:
      'The oldest game here. Légal sacrifices his queen to mate with three minor pieces — the origin of the "Légal trap" that still catches players who carelessly pin the f3-knight with a bishop.',
    san: 'e4 e5 Bc4 d6 Nf3 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#',
  },
  {
    id: 'immortal',
    title: 'The Immortal Game',
    white: 'Adolf Anderssen',
    black: 'Lionel Kieseritzky',
    year: 1851,
    result: '1-0',
    era: ROMANTIC,
    context:
      'A casual game during the first international tournament in London. Anderssen gave up a bishop, both rooks and the queen, then mated with his three remaining minor pieces — the defining masterpiece of Romantic-era chess.',
    san: 'e4 e5 f4 exf4 Bc4 Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d3 Nh5 Nh4 Qg5 Nf5 c6 g4 Nf6 Rg1 cxb5 h4 Qg6 h5 Qg5 Qf3 Ng8 Bxf4 Qf6 Nc3 Bc5 Nd5 Qxb2 Bd6 Bxg1 e5 Qxa1+ Ke2 Na6 Nxg7+ Kd8 Qf6+ Nxf6 Be7#',
  },
  {
    id: 'evergreen',
    title: 'The Evergreen Game',
    white: 'Adolf Anderssen',
    black: 'Jean Dufresne',
    year: 1852,
    result: '1-0',
    era: ROMANTIC,
    context:
      'Anderssen again, against his student Dufresne. The cascading sacrifices that finish with a queen offer and a minor-piece mate were called "evergreen" by Wilhelm Steinitz — a brilliancy that never fades.',
    san: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#',
  },
  {
    id: 'opera',
    title: 'The Opera Game',
    white: 'Paul Morphy',
    black: 'Duke of Brunswick & Count Isouard',
    year: 1858,
    result: '1-0',
    era: ROMANTIC,
    context:
      'Morphy played this in a private box at the Paris Opera, reportedly while watching the performance. It is the textbook example of rapid development and open lines — every piece joins a hunt that ends in a model back-rank mate.',
    san: 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#',
  },
  {
    id: 'morphy-anderssen',
    title: 'Morphy – Anderssen',
    white: 'Paul Morphy',
    black: 'Adolf Anderssen',
    year: 1858,
    result: '1-0',
    era: ROMANTIC,
    context:
      'Paris 1858, from the match that crowned Morphy the strongest player in the world. In this Sicilian he chases Anderssen’s uncastled king into the open by move 12 and hunts it down — a lead in development turned lethal.',
    san: 'e4 c5 d4 cxd4 Nf3 Nc6 Nxd4 e6 Nb5 d6 Bf4 e5 Be3 f5 N1c3 f4 Nd5 fxe3 Nbc7+ Kf7 Qf3+ Nf6 Bc4 Nd4 Nxf6+ d5 Bxd5+ Kg6 Qh5+ Kxf6 fxe3 Nxc2+ Ke2',
  },
  {
    id: 'bird-morphy',
    title: 'Bird – Morphy',
    white: 'Henry Bird',
    black: 'Paul Morphy',
    year: 1858,
    result: '0-1',
    era: ROMANTIC,
    context:
      'London 1858. Facing Bird, Morphy sacrificed the exchange with 17…Rxf2 and let his queen and bishops swarm the white king. A model of the effortless attacking flow that made him famous.',
    san: 'e4 e5 Nf3 d6 d4 f5 Nc3 fxe4 Nxe4 d5 Ng3 e4 Ne5 Nf6 Bg5 Bd6 Nh5 O-O Qd2 Qe8 g4 Nxg4 Nxg4 Qxh5 Ne5 Nc6 Be2 Qh3 Nxc6 bxc6 Be3 Rb8 O-O-O Rxf2 Bxf2 Qa3 c3 Qxa2 b4 Qa1+ Kc2 Qa4+ Kb2 Bxb4 cxb4 Rxb4+ Qxb4 Qxb4+ Kc2 e3 Bxe3 Bf5+ Rd3 Qc4+ Kd2 Qa2+ Kd1 Qb1+',
  },
  {
    id: 'hamppe-meitner',
    title: 'The Vienna Immortal',
    white: 'Carl Hamppe',
    black: 'Philipp Meitner',
    year: 1872,
    result: '½–½',
    era: ROMANTIC,
    context:
      'Vienna 1872. Meitner throws piece after piece to drag the white king into the open; White must thread the one narrow path to safety, and the king hunt ends in a drawn perpetual check — a wild masterpiece where nobody loses.',
    san: 'e4 e5 Nc3 Bc5 Na4 Bxf2+ Kxf2 Qh4+ Ke3 Qf4+ Kd3 d5 Kc3 Qxe4 Kb3 Na6 a3 Qxa4+ Kxa4 Nc5+ Kb4 a5+ Kxc5 Ne7 Bb5+ Kd8 Bc6 b6+ Kb5 Nxc6 Kxc6 Bb7+ Kb5 Ba6+ Kc6 Bb7+',
  },
  {
    id: 'zukertort-blackburne',
    title: 'Zukertort – Blackburne',
    white: 'Johannes Zukertort',
    black: 'Joseph Blackburne',
    year: 1883,
    result: '1-0',
    era: ROMANTIC,
    context:
      'London 1883. Zukertort’s quiet 28.Qb4 set up one of the great combinations of the 19th century — a cascade of sacrifices ending with the queen buried deep in Black’s camp. Long celebrated as an immortal.',
    san: 'c4 e6 e3 Nf6 Nf3 b6 Be2 Bb7 O-O d5 d4 Bd6 Nc3 O-O b3 Nbd7 Bb2 Qe7 Nb5 Ne4 Nxd6 cxd6 Nd2 Ndf6 f3 Nxd2 Qxd2 dxc4 Bxc4 d5 Bd3 Rfc8 Rae1 Rc7 e4 Rac8 e5 Ne8 f4 g6 Re3 f5 exf6 Nxf6 f5 Ne4 Bxe4 dxe4 fxg6 Rc2 gxh7+ Kh8 d5+ e5 Qb4 R8c5 Rf8+ Kxh7 Qxe4+ Kg7 Bxe5+ Kxf8 Bg7+ Kg8 Qxe7',
  },
  {
    id: 'lasker-bauer',
    title: 'The Double Bishop Sacrifice',
    white: 'Emanuel Lasker',
    black: 'Johann Bauer',
    year: 1889,
    result: '1-0',
    era: ROMANTIC,
    context:
      'Amsterdam 1889. Five years before he became World Champion, Emanuel Lasker unveiled the double bishop sacrifice — 15.Bxh7+ and 17.Bxg7 — tearing open the castled king. The two-bishop demolition of a fianchetto has carried his name ever since.',
    san: 'f4 d5 e3 Nf6 b3 e6 Bb2 Be7 Bd3 b6 Nc3 Bb7 Nf3 Nbd7 O-O O-O Ne2 c5 Ng3 Qc7 Ne5 Nxe5 Bxe5 Qc6 Qe2 a6 Nh5 Nxh5 Bxh7+ Kxh7 Qxh5+ Kg8 Bxg7 Kxg7 Qg4+ Kh7 Rf3 e5 Rh3+ Qh6 Rxh6+ Kxh6 Qd7 Bf6 Qxb7 Kg7 Rf1 Rab8 Qd7 Rfd8 Qg4+ Kf8 fxe5 Bg7 e6 Rb7 Qg6 f6 Rxf6+ Bxf6 Qxf6+ Ke8 Qh8+ Ke7 Qg7+ Kxe6 Qxb7 Rd6 Qxa6 d4 exd4 cxd4 h4 d3 Qxd3',
  },
  {
    id: 'steinitz-bardeleben',
    title: 'Steinitz – von Bardeleben',
    white: 'Wilhelm Steinitz',
    black: 'Curt von Bardeleben',
    year: 1895,
    result: '1-0',
    era: ROMANTIC,
    context:
      'Hastings 1895. The first World Champion launched a dazzling king hunt; rather than resign into a forced mate, von Bardeleben simply walked out of the hall and let his clock run out, whereupon Steinitz showed the mate to the spectators.',
    san: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Nc3 d5 exd5 Nxd5 O-O Be6 Bg5 Be7 Bxd5 Bxd5 Nxd5 Qxd5 Bxe7 Nxe7 Re1 f6 Qe2 Qd7 Rac1 c6 d5 cxd5 Nd4 Kf7 Ne6 Rhc8 Qg4 g6 Ng5+ Ke8 Rxe7+ Kf8 Rf7+ Kg8 Rg7+ Kh8 Rxh7+',
  },
  {
    id: 'pillsbury-lasker',
    title: 'Pillsbury – Lasker',
    white: 'Harry Nelson Pillsbury',
    black: 'Emanuel Lasker',
    year: 1896,
    result: '0-1',
    era: ROMANTIC,
    context:
      'St. Petersburg 1895–96. World Champion Lasker answered Pillsbury’s Queen’s Gambit with the thunderbolt 17…Rxc3, then raced his queen and rooks at the white king. The two attacks collided and Lasker’s landed first, finishing with mate.',
    san: 'd4 d5 c4 e6 Nc3 Nf6 Nf3 c5 Bg5 cxd4 Qxd4 Nc6 Qh4 Be7 O-O-O Qa5 e3 Bd7 Kb1 h6 cxd5 exd5 Nd4 O-O Bxf6 Bxf6 Qh5 Nxd4 exd4 Be6 f4 Rac8 f5 Rxc3 fxe6 Ra3 exf7+ Rxf7 bxa3 Qb6+ Bb5 Qxb5+ Ka1 Rc7 Rd2 Rc4 Rhd1 Rc3 Qf5 Qc4 Kb2 Rxa3 Qe6+ Kh7 Kxa3 Qc3+ Ka4 b5+ Kxb5 Qc4+ Ka5 Bd8+ Qb6 Bxb6#',
  },

  // ── Classical & hypermodern era ───────────────────────────────────────────
  {
    id: 'rotlewi-rubinstein',
    title: "Rubinstein's Immortal",
    white: 'Georg Rotlewi',
    black: 'Akiba Rubinstein',
    year: 1907,
    result: '0-1',
    era: CLASSICAL,
    context:
      'Łódź 1907. Rubinstein answered Rotlewi\'s kingside build-up with a storm of sacrifices — queen, then both bishops and a rook — leaving the white king mated by the bare pieces. One of the most beautiful combinations ever played.',
    san: 'd4 d5 Nf3 e6 e3 c5 c4 Nc6 Nc3 Nf6 dxc5 Bxc5 a3 a6 b4 Bd6 Bb2 O-O Qd2 Qe7 Bd3 dxc4 Bxc4 b5 Bd3 Rd8 Qe2 Bb7 O-O Ne5 Nxe5 Bxe5 f4 Bc7 e4 Rac8 e5 Bb6+ Kh1 Ng4 Be4 Qh4 g3 Rxc3 gxh4 Rd2 Qxd2 Bxe4+ Qg2 Rh3',
  },
  {
    id: 'reti-tartakower',
    title: 'Réti – Tartakower',
    white: 'Richard Réti',
    black: 'Savielly Tartakower',
    year: 1910,
    result: '1-0',
    era: CLASSICAL,
    context:
      'A nine-move Caro-Kann miniature from Vienna that ends with a queen sacrifice drawing the king into a minor-piece mating net — one of the most quoted short games in chess.',
    san: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Qd3 e5 dxe5 Qa5+ Bd2 Qxe5 O-O-O Nxe4 Qd8+ Kxd8 Bg5+ Kc7 Bd8#',
  },
  {
    id: 'ed-lasker-thomas',
    title: 'Edward Lasker – Thomas',
    white: 'Edward Lasker',
    black: 'Sir George Thomas',
    year: 1912,
    result: '1-0',
    era: CLASSICAL,
    context:
      'London 1912. Edward Lasker (a distant cousin of the champion) sacrificed his queen on h7 and marched the black king from g8 all the way down to g1, finishing with the astonishing mating move 18.O-O-O# — perhaps the most famous king hunt ever played.',
    san: 'd4 e6 Nf3 f5 Nc3 Nf6 Bg5 Be7 Bxf6 Bxf6 e4 fxe4 Nxe4 b6 Ne5 O-O Bd3 Bb7 Qh5 Qe7 Qxh7+ Kxh7 Nxf6+ Kh6 Neg4+ Kg5 h4+ Kf4 g3+ Kf3 Be2+ Kg2 Rh2+ Kg1 O-O-O#',
  },
  {
    id: 'levitsky-marshall',
    title: 'The Gold Coins Game',
    white: 'Stefan Levitsky',
    black: 'Frank Marshall',
    year: 1912,
    result: '0-1',
    era: CLASSICAL,
    context:
      'Breslau 1912. Marshall finished with 23…Qg3, planting his queen where three different white pieces could capture it — yet none could, and Levitsky resigned. Legend says delighted spectators showered the board with gold coins.',
    san: 'd4 e6 e4 d5 Nc3 c5 Nf3 Nc6 exd5 exd5 Be2 Nf6 O-O Be7 Bg5 O-O dxc5 Be6 Nd4 Bxc5 Nxe6 fxe6 Bg4 Qd6 Bh3 Rae8 Qd2 Bb4 Bxf6 Rxf6 Rad1 Qc5 Qe2 Bxc3 bxc3 Qxc3 Rxd5 Nd4 Qh5 Ref8 Re5 Rh6 Qg5 Rxh3 Rc5 Qg3',
  },
  {
    id: 'capablanca-marshall',
    title: 'Capablanca – Marshall',
    white: 'José Raúl Capablanca',
    black: 'Frank Marshall',
    year: 1918,
    result: '1-0',
    era: CLASSICAL,
    context:
      'New York 1918. Marshall sprang his prepared Marshall Attack — a gambit he had reportedly saved for years — but Capablanca calmly accepted every pawn, defended with precision and refuted it over the board. The line still bears Marshall’s name.',
    san: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5 Nxe5 Nxe5 Rxe5 Nf6 Re1 Bd6 h3 Ng4 Qf3 Qh4 d4 Nxf2 Re2 Bg4 hxg4 Bh2+ Kf1 Bg3 Rxf2 Qh1+ Ke2 Bxf2 Bd2 Bh4 Qh3 Rae8+ Kd3 Qf1+ Kc2 Bf2 Qf3 Qg1 Bd5 c5 dxc5 Bxc5 b4 Bd6 a4 a5 axb5 axb4 Ra6 bxc3 Nxc3 Bb4 b6 Bxc3 Bxc3 h6 b7 Re3 Bxf7+',
  },
  {
    id: 'reti-bogoljubov',
    title: 'Réti – Bogoljubov',
    white: 'Richard Réti',
    black: 'Efim Bogoljubov',
    year: 1924,
    result: '1-0',
    era: CLASSICAL,
    context:
      'New York 1924. Réti’s hypermodern strategy squeezed Bogoljubov until his pieces ran out of squares; the elegant finish 25.Be8 wins material and threatens mate at once, leaving Black helpless.',
    san: 'Nf3 d5 c4 e6 g3 Nf6 Bg2 Bd6 O-O O-O b3 Re8 Bb2 Nbd7 d4 c6 Nbd2 Ne4 Nxe4 dxe4 Ne5 f5 f3 exf3 Bxf3 Qc7 Nxd7 Bxd7 e4 e5 c5 Bf8 Qc2 exd4 exf5 Rad8 Bh5 Re5 Bxd4 Rxf5 Rxf5 Bxf5 Qxf5 Rxd4 Rf1 Rd8 Bf7+ Kh8 Be8',
  },
  {
    id: 'alekhine-nimzowitsch',
    title: 'Alekhine – Nimzowitsch',
    white: 'Alexander Alekhine',
    black: 'Aron Nimzowitsch',
    year: 1930,
    result: '1-0',
    era: CLASSICAL,
    context:
      'San Remo 1930. Alekhine, at the height of his powers, bound Nimzowitsch hand and foot in a French Defence and won by pure zugzwang — the "boa constrictor" game from a tournament he ran away with.',
    san: 'e4 e6 d4 d5 Nc3 Bb4 e5 c5 Bd2 Ne7 Nb5 Bxd2+ Qxd2 O-O c3 b6 f4 Ba6 Nf3 Qd7 a4 Nbc6 b4 cxb4 cxb4 Bb7 Nd6 f5 a5 Nc8 Nxb7 Qxb7 a6 Qf7 Bb5 N8e7 O-O h6 Rfc1 Rfc8 Rc2 Qe8 Rac1 Rab8 Qe3 Rc7 Rc3 Qd7 R1c2 Kf8 Qc1 Rbc8 Ba4 b5 Bxb5 Ke8 Ba4 Kd8 h4 h5 Kh2 g6 g3',
  },
  {
    id: 'botvinnik-capablanca',
    title: 'Botvinnik – Capablanca',
    white: 'Mikhail Botvinnik',
    black: 'José Raúl Capablanca',
    year: 1938,
    result: '1-0',
    era: CLASSICAL,
    context:
      'AVRO 1938. Botvinnik\'s knight sacrifice on h5 and the storming e-pawn against the legendary Capablanca produced one of the most famous combinations in chess history — a future World Champion overcoming a past one.',
    san: 'd4 Nf6 c4 e6 Nc3 Bb4 e3 d5 a3 Bxc3+ bxc3 c5 cxd5 exd5 Bd3 O-O Ne2 b6 O-O Ba6 Bxa6 Nxa6 Bb2 Qd7 a4 Rfe8 Qd3 c4 Qc2 Nb8 Rae1 Nc6 Ng3 Na5 f3 Nb3 e4 Qxa4 e5 Nd7 Qf2 g6 f4 f5 exf6 Nxf6 f5 Rxe1 Rxe1 Re8 Re6 Rxe6 fxe6 Kg7 Qf4 Qe8 Qe5 Qe7 Ba3 Qxa3 Nh5+ gxh5 Qg5+ Kf8 Qxf6+ Kg8 e7 Qc1+ Kf2 Qc2+ Kg3 Qd3+ Kh4 Qe4+ Kxh5 Qe2+ Kh4 Qe4+ g4 Qe1+ Kh5',
  },

  // ── Soviet era ────────────────────────────────────────────────────────────
  {
    id: 'geller-euwe',
    title: 'Geller – Euwe',
    white: 'Efim Geller',
    black: 'Max Euwe',
    year: 1953,
    result: '0-1',
    era: SOVIET,
    context:
      'Zurich Candidates 1953. Former World Champion Euwe answered Geller’s kingside attack with a furious counter down the c-file; his rooks crashed through to the back rank first. A textbook race between opposite-wing attacks.',
    san: 'd4 Nf6 c4 e6 Nc3 Bb4 e3 c5 a3 Bxc3+ bxc3 b6 Bd3 Bb7 f3 Nc6 Ne2 O-O O-O Na5 e4 Ne8 Ng3 cxd4 cxd4 Rc8 f4 Nxc4 f5 f6 Rf4 b5 Rh4 Qb6 e5 Nxe5 fxe6 Nxd3 Qxd3 Qxe6 Qxh7+ Kf7 Bh6 Rh8 Qxh8 Rc2 Rc1 Rxg2+ Kf1 Qb3 Ke1 Qf3',
  },
  {
    id: 'century',
    title: 'The Game of the Century',
    white: 'Donald Byrne',
    black: 'Robert Fischer',
    year: 1956,
    result: '0-1',
    era: SOVIET,
    context:
      '13-year-old Bobby Fischer announced himself with a queen sacrifice and a grinding "windmill" against Donald Byrne. Hans Kmoch dubbed it the Game of the Century in his report.',
    san: 'Nf3 Nf6 c4 g6 Nc3 Bg7 d4 O-O Bf4 d5 Qb3 dxc4 Qxc4 c6 e4 Nbd7 Rd1 Nb6 Qc5 Bg4 Bg5 Na4 Qa3 Nxc3 bxc3 Nxe4 Bxe7 Qb6 Bc4 Nxc3 Bc5 Rfe8+ Kf1 Be6 Bxb6 Bxc4+ Kg1 Ne2+ Kf1 Nxd4+ Kg1 Ne2+ Kf1 Nc3+ Kg1 axb6 Qb4 Ra4 Qxb6 Nxd1 h3 Rxa2 Kh2 Nxf2 Re1 Rxe1 Qd8+ Bf8 Nxe1 Bd5 Nf3 Ne4 Qb8 b5 h4 h5 Ne5 Kg7 Kg1 Bc5+ Kf1 Ng3+ Ke1 Bb4+ Kd1 Bb3+ Kc1 Ne2+ Kb1 Nc3+ Kc1 Rc2#',
  },
  {
    id: 'spassky-bronstein',
    title: 'Spassky – Bronstein',
    white: 'Boris Spassky',
    black: 'David Bronstein',
    year: 1960,
    result: '1-0',
    era: SOVIET,
    context:
      'USSR Championship, Leningrad 1960. Spassky’s King’s Gambit blew Bronstein off the board with a piece sacrifice on f7 — the game was later re-created move for move on the board in the James Bond film "From Russia with Love".',
    san: 'e4 e5 f4 exf4 Nf3 d5 exd5 Bd6 Nc3 Ne7 d4 O-O Bd3 Nd7 O-O h6 Ne4 Nxd5 c4 Ne3 Bxe3 fxe3 c5 Be7 Bc2 Re8 Qd3 e2 Nd6 Nf8 Nxf7 exf1=Q+ Rxf1 Bf5 Qxf5 Qd7 Qf4 Bf6 N3e5 Qe7 Bb3 Bxe5 Nxe5+ Kh7 Qe4+',
  },
  {
    id: 'botvinnik-tal-1960',
    title: 'Botvinnik – Tal, Game 6',
    white: 'Mikhail Botvinnik',
    black: 'Mikhail Tal',
    year: 1960,
    result: '0-1',
    era: SOVIET,
    context:
      'World Championship 1960, Game 6. The 23-year-old Tal sacrificed a knight with 21…Nf4 in a still-murky position and out-calculated the reigning champion Botvinnik in the ensuing chaos, on his way to becoming the youngest World Champion to that point.',
    san: 'c4 Nf6 Nf3 g6 g3 Bg7 Bg2 O-O d4 d6 Nc3 Nbd7 O-O e5 e4 c6 h3 Qb6 d5 cxd5 cxd5 Nc5 Ne1 Bd7 Nd3 Nxd3 Qxd3 Rfc8 Rb1 Nh5 Be3 Qb4 Qe2 Rc4 Rfc1 Rac8 Kh2 f5 exf5 Bxf5 Ra1 Nf4 gxf4 exf4 Bd2 Qxb2 Rab1 f3 Rxb2 fxe2 Rb3 Rd4 Be1 Be5+ Kg1 Bf4 Nxe2 Rxc1 Nxd4 Rxe1+ Bf1 Be4 Ne2 Be5 f4 Bf6 Rxb7 Bxd5 Rc7 Bxa2 Rxa7 Bc4 Ra8+ Kf7 Ra7+ Ke6 Ra3 d5 Kf2 Bh4+ Kg2 Kd6 Ng3 Bxg3 Bxc4 dxc4 Kxg3 Kd5 Ra7 c3 Rc7 Kd4 Rd7+',
  },
  {
    id: 'nezhmetdinov-chernikov',
    title: 'Nezhmetdinov – Chernikov',
    white: 'Rashid Nezhmetdinov',
    black: 'Oleg Chernikov',
    year: 1962,
    result: '1-0',
    era: SOVIET,
    context:
      '1962. Nezhmetdinov — the great attacking genius the wider world barely knew — offered his queen with 12.Qxf6 and, a piece down, hunted the king with rooks and bishops. One of the most spectacular attacks ever recorded.',
    san: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 Bc4 O-O Bb3 Ng4 Qxg4 Nxd4 Qh4 Qa5 O-O Bf6 Qxf6 Ne2+ Nxe2 exf6 Nc3 Re8 Nd5 Re6 Bd4 Kg7 Rad1 d6 Rd3 Bd7 Rf3 Bb5 Bc3 Qd8 Nxf6 Be2 Nxh7+ Kg8 Rh3 Re5 f4 Bxf1 Kxf1 Rc8 Bd4 b5 Ng5 Rc7 Bxf7+ Rxf7 Rh8+ Kxh8 Nxf7+ Kh7 Nxd8 Rxe4 Nc6 Rxf4+ Ke2',
  },
  {
    id: 'byrne-fischer-usc',
    title: 'Byrne – Fischer, US Ch.',
    white: 'Robert Byrne',
    black: 'Robert Fischer',
    year: 1963,
    result: '0-1',
    era: SOVIET,
    context:
      'US Championship 1963/64. Robert Byrne looked comfortable when Fischer uncorked 21…Nxg2, sacrificing into what looked like thin air. Commentators thought Fischer was losing — Byrne resigned three moves later into a mate they hadn’t even seen.',
    san: 'd4 Nf6 c4 g6 g3 c6 Bg2 d5 cxd5 cxd5 Nc3 Bg7 e3 O-O Nge2 Nc6 O-O b6 b3 Ba6 Ba3 Re8 Qd2 e5 dxe5 Nxe5 Rfd1 Nd3 Qc2 Nxf2 Kxf2 Ng4+ Kg1 Nxe3 Qd2 Nxg2 Kxg2 d4 Nxd4 Bb7+ Kf1 Qd7',
  },
  {
    id: 'tal-larsen',
    title: 'Tal – Larsen',
    white: 'Mikhail Tal',
    black: 'Bent Larsen',
    year: 1965,
    result: '1-0',
    era: SOVIET,
    context:
      'Candidates match, Bled 1965, Game 10. With the match on the line, Tal launched a kingside storm, sacrificed on f5 and dragged Larsen’s king into a mating net — the Magician of Riga at his most ferocious.',
    san: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 e6 Nc3 d6 Be3 Nf6 f4 Be7 Qf3 O-O O-O-O Qc7 Ndb5 Qb8 g4 a6 Nd4 Nxd4 Bxd4 b5 g5 Nd7 Bd3 b4 Nd5 exd5 exd5 f5 Rde1 Rf7 h4 Bb7 Bxf5 Rxf5 Rxe7 Ne5 Qe4 Qf8 fxe5 Rf4 Qe3 Rf3 Qe2 Qxe7 Qxf3 dxe5 Re1 Rd8 Rxe5 Qd6 Qf4 Rf8 Qe4 b3 axb3 Rf1+ Kd2 Qb4+ c3 Qd6 Bc5 Qxc5 Re8+ Rf8 Qe6+ Kh8 Qf7',
  },
  {
    id: 'rossolimo-reissmann',
    title: 'Rossolimo – Reissmann',
    white: 'Nicolas Rossolimo',
    black: 'Paul Reissmann',
    year: 1967,
    result: '1-0',
    era: SOVIET,
    context:
      'Puerto Rico 1967. Rossolimo needed just six moves and a knight leap to d6 to spring a smothered-style mate in the Caro-Kann — a perfect little jewel of a miniature.',
    san: 'e4 c6 Nf3 d5 Nc3 dxe4 Nxe4 Nf6 Qe2 Nbd7 Nd6#',
  },
  {
    id: 'larsen-spassky',
    title: 'Larsen – Spassky',
    white: 'Bent Larsen',
    black: 'Boris Spassky',
    year: 1970,
    result: '0-1',
    era: SOVIET,
    context:
      'USSR vs Rest of the World, Belgrade 1970. Larsen opened 1.b3; Spassky answered with a direct assault, sacrificed a knight and mated in just 17 moves, crowned by …gxf1=Q+ — a world champion’s lightning riposte and one of the great miniatures.',
    san: 'b3 e5 Bb2 Nc6 c4 Nf6 Nf3 e4 Nd4 Bc5 Nxc6 dxc6 e3 Bf5 Qc2 Qe7 Be2 O-O-O f4 Ng4 g3 h5 h3 h4 hxg4 hxg3 Rg1 Rh1 Rxh1 g2 Rf1 Qh4+ Kd1 gxf1=Q+',
  },
  {
    id: 'fischer-spassky-1972-g6',
    title: 'Fischer – Spassky, Game 6',
    white: 'Robert Fischer',
    black: 'Boris Spassky',
    year: 1972,
    result: '1-0',
    era: SOVIET,
    context:
      'Reykjavík 1972, the Cold War "Match of the Century". Fischer — almost always a 1.e4 player — opened 1.c4 and produced a flawless positional masterpiece; Spassky reportedly joined the audience in applauding at the end.',
    san: 'c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4 c5 Qa3 Rc8 Bb5 a6 dxc5 bxc5 O-O Ra7 Be2 Nd7 Nd4 Qf8 Nxe6 fxe6 e4 d4 f4 Qe7 e5 Rb8 Bc4 Kh8 Qh3 Nf8 b3 a5 f5 exf5 Rxf5 Nh7 Rcf1 Qd8 Qg3 Re7 h4 Rbb7 e6 Rbc7 Qe5 Qe8 a4 Qd8 R1f2 Qe8 R2f3 Qd8 Bd3 Qe8 Qe4 Nf6 Rxf6 gxf6 Rxf6 Kg8 Bc4 Kh8 Qf4',
  },
  {
    id: 'bagirov-gufeld',
    title: "Gufeld's Mona Lisa",
    white: 'Vladimir Bagirov',
    black: 'Eduard Gufeld',
    year: 1973,
    result: '0-1',
    era: SOVIET,
    context:
      '1973. Gufeld called this King’s Indian his "Mona Lisa" — the masterpiece he was proudest of all his life. His dark-squared bishop and rolling kingside pawns overwhelmed White in a storm he considered the most beautiful game he ever played.',
    san: 'd4 g6 c4 Bg7 Nc3 d6 e4 Nf6 f3 O-O Be3 Nc6 Nge2 Rb8 Qd2 a6 Bh6 b5 h4 e5 Bxg7 Kxg7 h5 Kh8 Nd5 bxc4 hxg6 fxg6 Qh6 Nh5 g4 Rxb2 gxh5 g5 Rg1 g4 O-O-O Rxa2 Nef4 exf4 Nxf4 Rxf4 Qxf4 c3 Bc4 Ra3 fxg4 Nb4 Kb1 Be6 Bxe6 Nd3 Qf7 Qb8+ Bb3 Rxb3+ Kc2 Nb4+ Kxb3 Nd5+ Kc2 Qb2+ Kd3 Qb5+',
  },

  // ── Modern & computer age ─────────────────────────────────────────────────
  {
    id: 'karpov-kasparov-1985',
    title: 'Karpov – Kasparov, Game 16',
    white: 'Anatoly Karpov',
    black: 'Garry Kasparov',
    year: 1985,
    result: '0-1',
    era: MODERN,
    context:
      'World Championship 1985, Game 16. Kasparov planted a knight on d3 — the famous "octopus" whose tentacles paralysed White’s whole position. The game helped the 22-year-old dethrone Karpov and become the youngest World Champion in history.',
    san: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nb5 d6 c4 Nf6 N1c3 a6 Na3 d5 cxd5 exd5 exd5 Nb4 Be2 Bc5 O-O O-O Bf3 Bf5 Bg5 Re8 Qd2 b5 Rad1 Nd3 Nab1 h6 Bh4 b4 Na4 Bd6 Bg3 Rc8 b3 g5 Bxd6 Qxd6 g3 Nd7 Bg2 Qf6 a3 a5 axb4 axb4 Qa2 Bg6 d6 g4 Qd2 Kg7 f3 Qxd6 fxg4 Qd4+ Kh1 Nf6 Rf4 Ne4 Qxd3 Nf2+ Rxf2 Bxd3 Rfd2 Qe3 Rxd3 Rc1 Nb2 Qf2 Nd2 Rxd1+ Nxd1 Re1+',
  },
  {
    id: 'ivanchuk-yusupov',
    title: 'Ivanchuk – Yusupov',
    white: 'Vassily Ivanchuk',
    black: 'Artur Yusupov',
    year: 1991,
    result: '0-1',
    era: MODERN,
    context:
      'Brussels 1991, a Candidates tiebreak decided on the final rapid game. Both kings came under fire and Yusupov’s counterattack broke through first. It won the game prize and is regularly named among the greatest fighting games ever played.',
    san: 'c4 e5 g3 d6 Bg2 g6 d4 Nd7 Nc3 Bg7 Nf3 Ngf6 O-O O-O Qc2 Re8 Rd1 c6 b3 Qe7 Ba3 e4 Ng5 e3 f4 Nf8 b4 Bf5 Qb3 h6 Nf3 Ng4 b5 g5 bxc6 bxc6 Ne5 gxf4 Nxc6 Qg5 Bxd6 Ng6 Nd5 Qh5 h4 Nxh4 gxh4 Qxh4 Nde7+ Kh8 Nxf5 Qh2+ Kf1 Re6 Qb7 Rg6 Qxa8+ Kh7 Qg8+ Kxg8 Nce7+ Kh7 Nxg6 fxg6 Nxg7 Nf2 Bxf4 Qxf4 Ne6 Qh2 Rdb1 Nh3 Rb7+ Kh8 Rb8+ Qxb8 Bxh3 Qg3',
  },
  {
    id: 'short-timman',
    title: "Short's King Walk",
    white: 'Nigel Short',
    black: 'Jan Timman',
    year: 1991,
    result: '1-0',
    era: MODERN,
    context:
      'Tilburg 1991. With queens still on and Black’s king seemingly safe, Short walked his own king up the board — Kg1–h2–g3–f4–g5 — to set up the decisive mating threat. One of the most astonishing king marches in tournament history.',
    san: 'e4 Nf6 e5 Nd5 d4 d6 Nf3 g6 Bc4 Nb6 Bb3 Bg7 Qe2 Nc6 O-O O-O h3 a5 a4 dxe5 dxe5 Nd4 Nxd4 Qxd4 Re1 e6 Nd2 Nd5 Nf3 Qc5 Qe4 Qb4 Bc4 Nb6 b3 Nxc4 bxc4 Re8 Rd1 Qc5 Qh4 b6 Be3 Qc6 Bh6 Bh8 Rd8 Bb7 Rad1 Bg7 R8d7 Rf8 Bxg7 Kxg7 R1d4 Rae8 Qf6+ Kg8 h4 h5 Kh2 Rc8 Kg3 Rce8 Kf4 Bc8 Kg5',
  },
  {
    id: 'fischer-spassky-1992',
    title: 'Fischer – Spassky, 1992',
    white: 'Robert Fischer',
    black: 'Boris Spassky',
    year: 1992,
    result: '1-0',
    era: MODERN,
    context:
      'Sveti Stefan 1992. After twenty years away from serious chess, Fischer returned for a rematch with his old rival and won the very first game in crisp style — a clean Ruy Lopez, played as if he had never left the board.',
    san: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d6 h3 Nb8 d4 Nbd7 Nbd2 Bb7 Bc2 Re8 Nf1 Bf8 Ng3 g6 Bg5 h6 Bd2 Bg7 a4 c5 d5 c4 b4 Nh7 Be3 h5 Qd2 Rf8 Ra3 Ndf6 Rea1 Qd7 R1a2 Rfc8 Qc1 Bf8 Qa1 Qe8 Nf1 Be7 N1d2 Kg7 Nb1 Nxe4 Bxe4 f5 Bc2 Bxd5 axb5 axb5 Ra7 Kf6 Nbd2 Rxa7 Rxa7 Ra8 g4 hxg4 hxg4 Rxa7 Qxa7 f4 Bxf4 exf4 Nh4 Bf7 Qd4+ Ke6 Nf5 Bf8 Qxf4 Kd7 Nd4 Qe1+ Kg2 Bd5+ Be4 Bxe4+ Nxe4 Be7 Nxb5 Nf8 Nbxd6 Ne6 Qe5',
  },
  {
    id: 'deepblue-kasparov',
    title: 'Deep Blue – Kasparov',
    white: 'Deep Blue',
    black: 'Garry Kasparov',
    year: 1997,
    result: '1-0',
    era: MODERN,
    context:
      'New York 1997, Game 6 of the rematch. IBM’s Deep Blue sacrificed a knight on e6 in a known Caro-Kann line and the reigning World Champion cracked in just 19 moves — the first time a machine beat the best human under match conditions.',
    san: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Ng5 Ngf6 Bd3 e6 N1f3 h6 Nxe6 Qe7 O-O fxe6 Bg6+ Kd8 Bf4 b5 a4 Bb7 Re1 Nd5 Bg3 Kc8 axb5 cxb5 Qd3 Bc6 Bf5 exf5 Rxe7 Bxe7 c4',
  },
  {
    id: 'kasparov-topalov',
    title: "Kasparov's Immortal",
    white: 'Garry Kasparov',
    black: 'Veselin Topalov',
    year: 1999,
    result: '1-0',
    era: MODERN,
    context:
      'Wijk aan Zee, 1999. Kasparov sacrificed a rook to drag Topalov’s king from one side of the board to the other in a calculation marathon often called the greatest game of all time.',
    san: 'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5 Nge2 Nbd7 Bh6 Bxh6 Qxh6 Bb7 a3 e5 O-O-O Qe7 Kb1 a6 Nc1 O-O-O Nb3 exd4 Rxd4 c5 Rd1 Nb6 g3 Kb8 Na5 Ba8 Bh3 d5 Qf4+ Ka7 Rhe1 d4 Nd5 Nbxd5 exd5 Qd6 Rxd4 cxd4 Re7+ Kb6 Qxd4+ Kxa5 b4+ Ka4 Qc3 Qxd5 Ra7 Bb7 Rxb7 Qc4 Qxf6 Kxa3 Qxa6+ Kxb4 c3+ Kxc3 Qa1+ Kd2 Qb2+ Kd1 Bf1 Rd2 Rd7 Rxd7 Bxc4 bxc4 Qxh8 Rd3 Qa8 c3 Qa4+ Ke1 f4 f5 Kc1 Rd2 Qa7',
  },
  {
    id: 'kasparov-world',
    title: 'Kasparov vs The World',
    white: 'Garry Kasparov',
    black: 'The World',
    year: 1999,
    result: '1-0',
    era: MODERN,
    context:
      '1999. Kasparov played a single game against a "World Team" that voted on every move over the internet, with tens of thousands taking part. After four months and 62 moves of extraordinary depth he prevailed, in what he called the greatest game he ever played.',
    san: 'e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7 c4 Nc6 Nc3 Nf6 O-O g6 d4 cxd4 Nxd4 Bg7 Nde2 Qe6 Nd5 Qxe4 Nc7+ Kd7 Nxa8 Qxc4 Nb6+ axb6 Nc3 Ra8 a4 Ne4 Nxe4 Qxe4 Qb3 f5 Bg5 Qb4 Qf7 Be5 h3 Rxa4 Rxa4 Qxa4 Qxh7 Bxb2 Qxg6 Qe4 Qf7 Bd4 Qb3 f4 Qf7 Be5 h4 b5 h5 Qc4 Qf5+ Qe6 Qxe6+ Kxe6 g3 fxg3 fxg3 b4 Bf4 Bd4+ Kh1 b3 g4 Kd5 g5 e6 h6 Ne7 Rd1 e5 Be3 Kc4 Bxd4 exd4 Kg2 b2 Kf3 Kc3 h7 Ng6 Ke4 Kc2 Rh1 d3 Kf5 b1=Q Rxb1 Kxb1 Kxg6 d2 h8=Q d1=Q Qh7 b5 Kf6 Kb2 Qh2+ Ka1 Qf4 b4 Qxb4 Qf3+ Kg7 d5 Qd4+ Kb1 g6 Qe4 Qg1+ Kb2 Qf2+ Kc1 Kf6 d4 g7',
  },
  {
    id: 'aronian-anand',
    title: "Anand's Immortal",
    white: 'Levon Aronian',
    black: 'Viswanathan Anand',
    year: 2013,
    result: '0-1',
    era: MODERN,
    context:
      'Wijk aan Zee 2013. Anand met Aronian’s Semi-Slav with a torrent of piece sacrifices; the quiet 23…Be3 left White facing unstoppable threats from pieces that seemed to appear from nowhere. Widely hailed as one of the finest games of the modern era.',
    san: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3 Bd6 O-O O-O Qc2 Bb7 a3 Rc8 Ng5 c5 Nxh7 Ng4 f4 cxd4 exd4 Bc5 Be2 Nde5 Bxg4 Bxd4+ Kh1 Nxg4 Nxf8 f5 Ng6 Qf6 h3 Qxg6 Qe2 Qh5 Qd3 Be3',
  },
];
