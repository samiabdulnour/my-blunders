import type { Puzzle } from './types';

/**
 * Curated "famous blunders" puzzle set.
 *
 * Shipped for the guest path: when a visitor enters the app without a Lichess
 * username (the "skip / explore" option on the onboarding screen), we load
 * these instead of leaving them with an empty board. Each one is the critical
 * position from a celebrated game where one side found — or could have found —
 * a crushing move. The solver plays the hero's side and has to find it.
 *
 * Every `setupMoves` + `bestMove` + `mistakeMove` sequence in here is replayed
 * through chess.js and checked for legality before shipping (see the project
 * notes). The `bestMove`/`mistakeMove` strings are chess.js's own canonical
 * SAN so they compare exactly against the move the user makes on the board.
 *
 * The eval numbers are illustrative, not Stockfish output: `+M` (encoded as a
 * large sentinel so the result panel renders "+M") marks a forced mate the
 * hero can reach, and `evalAfter` is roughly where the position slips if the
 * star move is missed. They exist to make the result panel read sensibly, not
 * to claim engine precision.
 */

/** Sentinel eval that the result panel renders as "+M" / "−M" (|v| > 50). */
const MATE = 99;

export const FAMOUS_PUZZLES: Puzzle[] = [
  {
    id: 'famous_opera_1858',
    gameId: 'famous-opera-1858',
    site: 'https://en.wikipedia.org/wiki/Opera_Game',
    player: 'Paul Morphy',
    opponent: 'Duke of Brunswick & Count Isouard',
    eco: 'C41',
    date: '1858',
    abdulsColor: 'white',
    setupMoves: [
      'e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5', 'Bxf3', 'Qxf3', 'dxe5',
      'Bc4', 'Nf6', 'Qb3', 'Qe7', 'Nc3', 'c6', 'Bg5', 'b5', 'Nxb5', 'cxb5',
      'Bxb5+', 'Nbd7', 'O-O-O', 'Rd8', 'Rxd7', 'Rxd7', 'Rd1', 'Qe6', 'Bxd7+', 'Nxd7',
    ],
    bestMove: 'Qb8+',
    mistakeMove: 'Qxe6+',
    evalBefore: MATE,
    evalAfter: 2.0,
    drop: 7.0,
    type: 'blunder',
  },
  {
    id: 'famous_reti_tartakower_1910',
    gameId: 'famous-reti-tartakower-1910',
    site: 'https://en.wikipedia.org/wiki/Richard_R%C3%A9ti',
    player: 'Richard Réti',
    opponent: 'Savielly Tartakower',
    eco: 'B15',
    date: '1910',
    abdulsColor: 'white',
    setupMoves: [
      'e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nf6', 'Qd3', 'e5',
      'dxe5', 'Qa5+', 'Bd2', 'Qxe5', 'O-O-O', 'Nxe4',
    ],
    bestMove: 'Qd8+',
    mistakeMove: 'Qxe4',
    evalBefore: MATE,
    evalAfter: 1.5,
    drop: 7.5,
    type: 'blunder',
  },
  {
    id: 'famous_lasker_thomas_1912',
    gameId: 'famous-lasker-thomas-1912',
    site: 'https://en.wikipedia.org/wiki/Edward_Lasker',
    player: 'Edward Lasker',
    opponent: 'George Thomas',
    eco: 'A84',
    date: '1912',
    abdulsColor: 'white',
    setupMoves: [
      'd4', 'e6', 'Nf3', 'f5', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'Bxf6', 'Bxf6',
      'e4', 'fxe4', 'Nxe4', 'b6', 'Ne5', 'O-O', 'Bd3', 'Bb7', 'Qh5', 'Qe7',
    ],
    bestMove: 'Qxh7+',
    mistakeMove: 'Nxf6+',
    evalBefore: MATE,
    evalAfter: 1.0,
    drop: 8.0,
    type: 'blunder',
  },
  {
    id: 'famous_legal_1750',
    gameId: 'famous-legal-1750',
    site: 'https://en.wikipedia.org/wiki/L%C3%A9gal_Trap',
    player: 'Sire de Légal',
    opponent: 'Saint Brie',
    eco: 'C50',
    date: '1750',
    abdulsColor: 'white',
    setupMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'd6', 'Nc3', 'Bg4'],
    bestMove: 'Nxe5',
    mistakeMove: 'h3',
    evalBefore: 4.0,
    evalAfter: 0.3,
    drop: 3.7,
    type: 'blunder',
  },
  {
    id: 'famous_canal_peruvian_1934',
    gameId: 'famous-canal-1934',
    site: 'https://en.wikipedia.org/wiki/Esteban_Canal',
    player: 'Esteban Canal',
    opponent: 'Amateur',
    eco: 'B15',
    date: '1934',
    abdulsColor: 'white',
    setupMoves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nd7', 'Qe2', 'Ngf6'],
    bestMove: 'Nd6#',
    mistakeMove: 'Nxf6+',
    evalBefore: MATE,
    evalAfter: 2.5,
    drop: 6.0,
    type: 'blunder',
  },
  {
    id: 'famous_byrne_fischer_1956',
    gameId: 'famous-byrne-fischer-1956',
    site: 'https://en.wikipedia.org/wiki/The_Game_of_the_Century_(chess)',
    player: 'Bobby Fischer',
    opponent: 'Donald Byrne',
    eco: 'D92',
    date: '1956',
    abdulsColor: 'black',
    setupMoves: [
      'Nf3', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'd4', 'O-O', 'Bf4', 'd5',
      'Qb3', 'dxc4', 'Qxc4', 'c6', 'e4', 'Nbd7', 'Rd1', 'Nb6', 'Qc5', 'Bg4',
      'Bg5', 'Na4', 'Qa3', 'Nxc3', 'bxc3', 'Nxe4', 'Bxe7', 'Qb6', 'Bc4', 'Nxc3',
      'Bc5', 'Rfe8+', 'Kf1',
    ],
    bestMove: 'Be6',
    mistakeMove: 'Nxd1',
    evalBefore: -3.5,
    evalAfter: -1.0,
    drop: 2.5,
    type: 'blunder',
  },
  {
    id: 'famous_immortal_1851',
    gameId: 'famous-immortal-1851',
    site: 'https://en.wikipedia.org/wiki/Immortal_Game',
    player: 'Adolf Anderssen',
    opponent: 'Lionel Kieseritzky',
    eco: 'C33',
    date: '1851',
    abdulsColor: 'white',
    setupMoves: [
      'e4', 'e5', 'f4', 'exf4', 'Bc4', 'Qh4+', 'Kf1', 'b5', 'Bxb5', 'Nf6',
      'Nf3', 'Qh6', 'd3', 'Nh5', 'Nh4', 'Qg5', 'Nf5', 'c6', 'g4', 'Nf6',
      'Rg1', 'cxb5', 'h4', 'Qg6', 'h5', 'Qg5', 'Qf3', 'Ng8', 'Bxf4', 'Qf6',
      'Nc3', 'Bc5', 'Nd5', 'Qxb2', 'Bd6', 'Bxg1', 'e5', 'Qxa1+', 'Ke2', 'Na6',
      'Nxg7+', 'Kd8', 'Qf6+', 'Nxf6',
    ],
    bestMove: 'Be7#',
    mistakeMove: 'exf6',
    evalBefore: MATE,
    evalAfter: 3.0,
    drop: 6.0,
    type: 'blunder',
  },
];
