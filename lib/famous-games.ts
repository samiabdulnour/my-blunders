/**
 * A library of famous, instructive games for the Coordinates trainer's "play the
 * game" mode: you replay the moves on the board for both sides, which trains
 * board vision and pattern memory on canonical games.
 *
 * Moves are space-separated SAN from the start. Every game is validated against
 * chess.js (scripts/validate-games) — an illegal move would break the replay, so
 * the list only ships fully-legal games.
 */
export interface FamousGame {
  id: string;
  /** Display title for the picker, e.g. "Opera Game". */
  title: string;
  white: string;
  black: string;
  year: number;
  result: string;
  /** A sentence or two of historical background, shown alongside the board. */
  context: string;
  /** Space-separated SAN, e.g. "e4 e5 Nf3 …". */
  san: string;
}

export const FAMOUS_GAMES: FamousGame[] = [
  {
    id: 'opera',
    title: 'The Opera Game',
    white: 'Paul Morphy',
    black: 'Duke of Brunswick & Count Isouard',
    year: 1858,
    result: '1-0',
    context:
      'Morphy played this in a private box at the Paris Opera, reportedly while watching the performance. It is the textbook example of rapid development and open lines — every piece joins a hunt that ends in a model back-rank mate.',
    san: 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#',
  },
  {
    id: 'immortal',
    title: 'The Immortal Game',
    white: 'Adolf Anderssen',
    black: 'Lionel Kieseritzky',
    year: 1851,
    result: '1-0',
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
    context:
      'Anderssen again, against his student Dufresne. The cascading sacrifices that finish with a queen offer and a minor-piece mate were called "evergreen" by Wilhelm Steinitz — a brilliancy that never fades.',
    san: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#',
  },
  {
    id: 'reti-tartakower',
    title: 'Réti – Tartakower',
    white: 'Richard Réti',
    black: 'Savielly Tartakower',
    year: 1910,
    result: '1-0',
    context:
      'A nine-move Caro-Kann miniature from Vienna that ends with a queen sacrifice drawing the king into a minor-piece mating net — one of the most quoted short games in chess.',
    san: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Qd3 e5 dxe5 Qa5+ Bd2 Qxe5 O-O-O Nxe4 Qd8+ Kxd8 Bg5+ Kc7 Bd8#',
  },
  {
    id: 'legal',
    title: "Légal's Mate",
    white: 'De Légal',
    black: 'Saint Brie',
    year: 1750,
    result: '1-0',
    context:
      'The oldest game here. Légal sacrifices his queen to mate with three minor pieces — the origin of the "Légal trap" that still catches players who carelessly pin the f3-knight with a bishop.',
    san: 'e4 e5 Bc4 d6 Nf3 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#',
  },
  {
    id: 'scholars',
    title: "Scholar's Mate",
    white: 'White',
    black: 'Black',
    year: 0,
    result: '1-0',
    context:
      'Not a real game but the most famous beginner trap: a four-move checkmate on f7. Every player should know how to deliver it once — and, more importantly, how to refute it.',
    san: 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#',
  },
  {
    id: 'century',
    title: 'The Game of the Century',
    white: 'Donald Byrne',
    black: 'Robert Fischer',
    year: 1956,
    result: '0-1',
    context:
      '13-year-old Bobby Fischer announced himself with a queen sacrifice and a grinding "windmill" against Donald Byrne. Hans Kmoch dubbed it the Game of the Century in his report.',
    san: 'Nf3 Nf6 c4 g6 Nc3 Bg7 d4 O-O Bf4 d5 Qb3 dxc4 Qxc4 c6 e4 Nbd7 Rd1 Nb6 Qc5 Bg4 Bg5 Na4 Qa3 Nxc3 bxc3 Nxe4 Bxe7 Qb6 Bc4 Nxc3 Bc5 Rfe8+ Kf1 Be6 Bxb6 Bxc4+ Kg1 Ne2+ Kf1 Nxd4+ Kg1 Ne2+ Kf1 Nc3+ Kg1 axb6 Qb4 Ra4 Qxb6 Nxd1 h3 Rxa2 Kh2 Nxf2 Re1 Rxe1 Qd8+ Bf8 Nxe1 Bd5 Nf3 Ne4 Qb8 b5 h4 h5 Ne5 Kg7 Kg1 Bc5+ Kf1 Ng3+ Ke1 Bb4+ Kd1 Bb3+ Kc1 Ne2+ Kb1 Nc3+ Kc1 Rc2#',
  },
  {
    id: 'kasparov-topalov',
    title: "Kasparov's Immortal",
    white: 'Garry Kasparov',
    black: 'Veselin Topalov',
    year: 1999,
    result: '1-0',
    context:
      'Wijk aan Zee, 1999. Kasparov sacrificed a rook to drag Topalov’s king from one side of the board to the other in a calculation marathon often called the greatest game of all time.',
    san: 'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5 Nge2 Nbd7 Bh6 Bxh6 Qxh6 Bb7 a3 e5 O-O-O Qe7 Kb1 a6 Nc1 O-O-O Nb3 exd4 Rxd4 c5 Rd1 Nb6 g3 Kb8 Na5 Ba8 Bh3 d5 Qf4+ Ka7 Rhe1 d4 Nd5 Nbxd5 exd5 Qd6 Rxd4 cxd4 Re7+ Kb6 Qxd4+ Kxa5 b4+ Ka4 Qc3 Qxd5 Ra7 Bb7 Rxb7 Qc4 Qxf6 Kxa3 Qxa6+ Kxb4 c3+ Kxc3 Qa1+ Kd2 Qb2+ Kd1 Bf1 Rd2 Rd7 Rxd7 Bxc4 bxc4 Qxh8 Rd3 Qa8 c3 Qa4+ Ke1 f4 f5 Kc1 Rd2 Qa7',
  },
];
