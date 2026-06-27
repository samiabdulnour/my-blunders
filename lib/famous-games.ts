/**
 * A small library of famous, instructive games for the Coordinates trainer's
 * "play the game" mode: you replay the moves on the board for both sides, which
 * trains board vision and pattern memory on canonical games.
 *
 * Moves are space-separated SAN from the start. Every game is validated against
 * chess.js at build time (scripts/validate-games) — an illegal move would break
 * the replay, so the list only ships fully-legal games.
 */
export interface FamousGame {
  id: string;
  white: string;
  black: string;
  event: string;
  year: number;
  result: string;
  /** Space-separated SAN, e.g. "e4 e5 Nf3 …". */
  san: string;
}

export const FAMOUS_GAMES: FamousGame[] = [
  {
    id: 'opera',
    white: 'Paul Morphy',
    black: 'Duke of Brunswick & Count Isouard',
    event: 'Paris Opera',
    year: 1858,
    result: '1-0',
    san: 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#',
  },
  {
    id: 'immortal',
    white: 'Adolf Anderssen',
    black: 'Lionel Kieseritzky',
    event: 'London (Immortal Game)',
    year: 1851,
    result: '1-0',
    san: 'e4 e5 f4 exf4 Bc4 Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d3 Nh5 Nh4 Qg5 Nf5 c6 g4 Nf6 Rg1 cxb5 h4 Qg6 h5 Qg5 Qf3 Ng8 Bxf4 Qf6 Nc3 Bc5 Nd5 Qxb2 Bd6 Bxg1 e5 Qxa1+ Ke2 Na6 Nxg7+ Kd8 Qf6+ Nxf6 Be7#',
  },
  {
    id: 'evergreen',
    white: 'Adolf Anderssen',
    black: 'Jean Dufresne',
    event: 'Berlin (Evergreen Game)',
    year: 1852,
    result: '1-0',
    san: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#',
  },
  {
    id: 'legal',
    white: 'De Légal',
    black: 'Saint Brie',
    event: "Café de la Régence, Paris",
    year: 1750,
    result: '1-0',
    san: 'e4 e5 Bc4 d6 Nf3 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#',
  },
  {
    id: 'scholars',
    white: 'Example',
    black: 'Example',
    event: "Scholar's Mate",
    year: 0,
    result: '1-0',
    san: 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#',
  },
  {
    id: 'century',
    white: 'Donald Byrne',
    black: 'Robert Fischer',
    event: 'New York (Game of the Century)',
    year: 1956,
    result: '0-1',
    san: 'Nf3 Nf6 c4 g6 Nc3 Bg7 d4 O-O Bf4 d5 Qb3 dxc4 Qxc4 c6 e4 Nbd7 Rd1 Nb6 Qc5 Bg4 Bg5 Na4 Qa3 Nxc3 bxc3 Nxe4 Bxe7 Qb6 Bc4 Nxc3 Bc5 Rfe8+ Kf1 Be6 Bxb6 Bxc4+ Kg1 Ne2+ Kf1 Nxd4+ Kg1 Ne2+ Kf1 Nc3+ Kg1 axb6 Qb4 Ra4 Qxb6 Nxd1 h3 Rxa2 Kh2 Nxf2 Re1 Rxe1 Qd8+ Bf8 Nxe1 Bd5 Nf3 Ne4 Qb8 b5 h4 h5 Ne5 Kg7 Kg1 Bc5+ Kf1 Ng3+ Ke1 Bb4+ Kd1 Bb3+ Kc1 Ne2+ Kb1 Nc3+ Kc1 Rc2#',
  },
  {
    id: 'fischer-spassky-1972-g6',
    white: 'Robert Fischer',
    black: 'Boris Spassky',
    event: 'World Championship, Game 6',
    year: 1972,
    result: '1-0',
    san: 'c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4 c5 Qa3 Rc8 Bb5 a6 dxc5 bxc5 O-O Ra7 Be2 Nd7 Nd4 Qf8 Nxe6 fxe6 e4 d4 f4 Qe7 e5 Rb8 Bc4 Kh8 Qh3 Nf8 b3 a5 f5 exf5 Rxf5 Nh7 Rcf1 Qd8 Qg3 Re7 h4 Rbb7 e6 Rbc7 Qe5 Qe8 a4 Qd8 R1f2 Qe8 R2f3 Qd8 Bd3 Qe8 Qe4 Nf6 Rxf6 gxf6 Rxf6 Kg8 Bc4 Kh8 Qf4',
  },
];
