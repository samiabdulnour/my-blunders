/**
 * Figurine notation: render SAN with piece *symbols* instead of letters, so the
 * app reads the same in any language. Colour-coded per the move's side — white
 * moves use the outline glyphs (♔♕♖♗♘), black moves the solid ones (♚♛♜♝♞) — so
 * you can tell whose move it is at a glance. Pawns have no letter in SAN, so
 * pawn moves are unchanged; files, ranks, captures (x), checks (+/#) and
 * castling (O-O) all pass through untouched.
 *
 * This is a *display* transform only — everything internal stays plain SAN for
 * chess.js. (The printed poster can't use these Unicode glyphs — jsPDF's fonts
 * lack them — so it draws the app's piece images beside the SAN instead; see
 * lib/opening-pdf.ts.)
 */
const WHITE: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
const BLACK: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' };

export function figurine(san: string | null | undefined, color: 'w' | 'b'): string {
  if (!san) return san ?? '';
  const m = color === 'w' ? WHITE : BLACK;
  // The piece letter sits at the start of the move — which may follow a move
  // number ("3.Bc4", "3…Bc5") or a space (a full line) — plus promotions "=Q".
  return san
    .replace(/(^|[\s.…])([KQRBN])/g, (_, pre: string, p: string) => pre + m[p])
    .replace(/=([KQRBN])/g, (_, p: string) => '=' + m[p]);
}
