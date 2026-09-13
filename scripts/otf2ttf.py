#!/usr/bin/env python3
"""Build the TrueType faces the PDF poster embeds, from the OTFs the UI loads.

jsPDF can only embed TrueType outlines, so the CFF curves are converted to
quadratics.

We also make the figures TABULAR. The poster is a table — move numbers in a
column down the margin, counts and evals under every board — and Gruezi's
figures are proportional (a "1" is 420 units against a "0" at 660), so those
columns come out ragged. The font ships a `tnum` feature, but its .tf glyphs
carry the same varying widths, so it doesn't help; and PDF embedding can't ask
for an OpenType feature at draw time anyway. So each digit is given the widest
digit's advance and its outline re-centred in it, which is what a tabular cut
is. Applies to every digit on the sheet, which is what a data poster wants.

Usage: python3 scripts/otf2ttf.py   (needs `pip3 install --user fonttools cu2qu`)
"""
from fontTools.ttLib import TTFont, newTable
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen

FONTS = [
    'public/fonts/RL-Gruezi-C-Bold.otf',
    'public/fonts/RL-Gruezi-C-Regular.otf',
]


DIGITS = '0123456789'


def convert(src, dst, tolerance=1.0):
    f = TTFont(src)
    upem, gs, order = f['head'].unitsPerEm, f.getGlyphSet(), f.getGlyphOrder()
    hmtx, cmap = f['hmtx'], f.getBestCmap()

    # Give every digit the widest digit's advance, and centre it there.
    digit_glyphs = [cmap[ord(d)] for d in DIGITS if ord(d) in cmap]
    tab_w = max(hmtx[g][0] for g in digit_glyphs) if digit_glyphs else 0
    shift = {g: (tab_w - hmtx[g][0]) / 2.0 for g in digit_glyphs}

    glyphs = {}
    for name in order:
        pen = TTGlyphPen(None)
        out = Cu2QuPen(pen, tolerance * upem / 1000.0)
        dx = shift.get(name, 0)
        gs[name].draw(TransformPen(out, (1, 0, 0, 1, dx, 0)) if dx else out)
        glyphs[name] = pen.glyph()

    glyf = newTable('glyf'); glyf.glyphOrder = order; glyf.glyphs = glyphs
    f['glyf'] = glyf
    f['loca'] = newTable('loca')
    maxp = newTable('maxp'); maxp.tableVersion = 0x00010000; maxp.numGlyphs = len(glyphs)
    for k, v in dict(maxZones=1, maxTwilightPoints=0, maxStorage=0, maxFunctionDefs=0,
                     maxInstructionDefs=0, maxStackElements=0, maxSizeOfInstructions=0,
                     maxComponentElements=0, maxComponentDepth=0, maxPoints=0,
                     maxContours=0, maxCompositePoints=0, maxCompositeContours=0).items():
        setattr(maxp, k, v)
    f['maxp'] = maxp
    for t in ('CFF ', 'VORG'):
        if t in f:
            del f[t]
    f['head'].indexToLocFormat = 0
    f.sfntVersion = '\x00\x01\x00\x00'
    for g in glyphs.values():
        g.recalcBounds(glyf)
    for g in digit_glyphs:                  # advance + side bearing follow the shift
        hmtx[g] = (tab_w, getattr(glyphs[g], 'xMin', 0))
    f['maxp'].recalc(f)
    f.save(dst)
    return tab_w


if __name__ == '__main__':
    for src in FONTS:
        dst = src.replace('.otf', '.ttf')
        w = convert(src, dst)
        print(f'{dst}  (figures set to {w} units)')
