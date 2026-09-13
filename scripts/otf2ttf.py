#!/usr/bin/env python3
"""Build the TrueType faces the PDF poster embeds, from the OTFs the UI loads.

jsPDF can only embed TrueType outlines, so the CFF curves are converted to
quadratics. Otherwise a faithful conversion — the glyphs are left exactly as
drawn.

(Gruezi's figures are proportional, and its `tnum` glyphs carry the same widths,
so the family has no true tabular cut. Don't try to fake one by widening the
digits to a common advance and centring them: a "1" is 420 units against a "0"
at 660, so centring strands it with ~7pt of air before the following period at
24pt. The poster instead right-aligns its move-number column, which lines the
figures up without touching the typeface.)

Usage: python3 scripts/otf2ttf.py   (needs `pip3 install --user fonttools cu2qu`)
"""
from fontTools.ttLib import TTFont, newTable
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen

FONTS = [
    'public/fonts/RL-Gruezi-C-Bold.otf',
    'public/fonts/RL-Gruezi-C-Regular.otf',
]


def convert(src, dst, tolerance=1.0):
    f = TTFont(src)
    upem, gs, order = f['head'].unitsPerEm, f.getGlyphSet(), f.getGlyphOrder()

    glyphs = {}
    for name in order:
        pen = TTGlyphPen(None)
        gs[name].draw(Cu2QuPen(pen, tolerance * upem / 1000.0))
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
    f['maxp'].recalc(f)
    f.save(dst)
    return len(glyphs)


if __name__ == '__main__':
    for src in FONTS:
        dst = src.replace('.otf', '.ttf')
        n = convert(src, dst)
        print(f'{dst}  ({n} glyphs)')
