#!/usr/bin/env python3
"""Build the TrueType faces the PDF poster embeds, from the OTFs the UI loads.

jsPDF can only embed TrueType outlines, so the CFF curves are converted to
quadratics. The glyphs are otherwise left exactly as drawn.

The one addition is a second, TABULAR set of figures. The poster's move-number
column has to line up, and Gruezi's default figures are proportional (a "1" is
440 units against a "0" at 660), so the column comes out ragged. The family
ships tabular cuts as `.tf` glyphs behind the `tnum` feature, and they're drawn
for exactly this: Bold's `one.tf` is 600 wide with a 120 left bearing, i.e. the
narrow 1 already centred in the tabular box. PDF text can't ask for an OpenType
feature at draw time, so the `.tf` glyphs are given their own cmap entries in
the private use area (U+E030…U+E039 for 0…9) and the poster addresses them
directly where a column needs them. Everything else keeps the proportional
figures, which is what the InDesign layout this poster follows does too — its
body text sets plain digits and only the move column sets `.tf`.

A few `.tf` glyphs miss the family's 600-unit tabular width (Bold's `two`,
`four` and `eight`; most of Regular's), so any stray is re-centred at 600 — the
width the rest of the set, and that layout, use.

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
#: Where the tabular figures are published. Keep in step with `TAB_ZERO` in
#: `lib/opening-pdf.ts`, which is the only thing that asks for them.
TABULAR_BASE = 0xE030
#: The family's tabular advance — what most `.tf` glyphs already use, and what
#: the InDesign layout this poster follows sets its figures at.
TABULAR_WIDTH = 600


def convert(src, dst, tolerance=1.0):
    f = TTFont(src)
    upem, gs, order = f['head'].unitsPerEm, f.getGlyphSet(), f.getGlyphOrder()
    hmtx, cmap = f['hmtx'], f.getBestCmap()

    # Publish each digit's tabular cut at its private-use code point, and note
    # how far the outline must move to sit centred in the tabular advance.
    shift, extra = {}, {}
    for i, d in enumerate(DIGITS):
        if ord(d) not in cmap:
            continue
        tab = cmap[ord(d)] + '.tf'
        if tab not in hmtx.metrics:
            continue
        extra[TABULAR_BASE + i] = tab
        shift[tab] = (TABULAR_WIDTH - hmtx[tab][0]) / 2.0
    for table in f['cmap'].tables:
        if table.isUnicode():
            table.cmap.update(extra)

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
    for g in shift:                       # tabular advance + matching side bearing
        hmtx[g] = (TABULAR_WIDTH, getattr(glyphs[g], 'xMin', 0))
    f['maxp'].recalc(f)
    f.save(dst)
    return sorted({hmtx[g][0] for g in shift}), len(extra)


if __name__ == '__main__':
    for src in FONTS:
        dst = src.replace('.otf', '.ttf')
        widths, n = convert(src, dst)
        print(f'{dst}  {n} tabular figures at U+{TABULAR_BASE:04X}…, widths {widths}')
