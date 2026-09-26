/**
 * A tiny canvas-backed stand-in for the slice of jsPDF that the opening-tree
 * poster renderer uses (see lib/opening-pdf.ts). Feeding the *same* draw code a
 * CanvasPdf instead of a real jsPDF document yields a faithful raster of page 1
 * — which is what the print dialog shows as a preview, since an embedded PDF
 * viewer can't be relied on to fit-to-page (iOS especially).
 *
 * Coordinates are PDF points; the canvas is scaled so the long edge is ~`targetPx`
 * and every draw call is issued in points. Only the methods the poster calls are
 * implemented. addImage() is queued and flushed at the end (images load async),
 * which also puts the pieces on top of their board squares — exactly the z-order
 * the poster wants. addPage() freezes drawing, so a multi-sheet "full" poster
 * previews as its first sheet.
 */

const A1_LONG = 2383.94;
const A1_SHORT = 1683.78;

type Style = 'F' | 'S' | 'FD' | 'DF';

/** The poster asks for tabular figures by private-use code point (U+E030…E039),
 *  which only the TTFs it embeds carry — the OTF the browser loads has the
 *  family's proportional figures and would draw those points as tofu. The
 *  preview is a thumbnail of an A1 sheet, so it just shows the plain digits. */
const plainDigits = (s: string) =>
  s.replace(/[\uE030-\uE039]/g, (c) => String(c.charCodeAt(0) - 0xe030));

interface QueuedImage {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class CanvasPdf {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pageW: number;
  private pageH: number;
  private scale: number;
  private frozen = false;
  private images: QueuedImage[] = [];

  private fillColor = '#000';
  private strokeColor = '#000';
  private textColor = '#000';
  private fontStyle = '';
  private fontFamily = 'Helvetica';
  private fontSize = 12;

  constructor(orientation: 'portrait' | 'landscape', targetPx = 1400) {
    this.pageW = orientation === 'portrait' ? A1_SHORT : A1_LONG;
    this.pageH = orientation === 'portrait' ? A1_LONG : A1_SHORT;
    this.scale = targetPx / Math.max(this.pageW, this.pageH);
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(this.pageW * this.scale);
    this.canvas.height = Math.round(this.pageH * this.scale);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.scale(this.scale, this.scale);
    this.ctx = ctx;
  }

  // jsPDF exposes page size via internal.pageSize.
  internal = {
    pageSize: {
      getWidth: () => this.pageW,
      getHeight: () => this.pageH,
    },
  };

  private applyFont() {
    this.ctx.font = `${this.fontStyle} ${this.fontSize}px ${this.fontFamily}, Helvetica, Arial, sans-serif`.trim();
  }

  setFillColor(r: number, g: number, b: number) {
    this.fillColor = `rgb(${r},${g},${b})`;
  }
  setDrawColor(r: number, g: number, b: number) {
    this.strokeColor = `rgb(${r},${g},${b})`;
  }
  setTextColor(r: number, g: number, b: number) {
    this.textColor = `rgb(${r},${g},${b})`;
  }
  setFont(family: string, style?: string) {
    // Quote the family so a name with spaces still parses in a canvas font
    // shorthand; the poster sets it to the app's own face.
    this.fontFamily = /^[\w-]+$/.test(family) ? family : `"${family}"`;
    this.fontStyle = style === 'bold' ? 'bold' : '';
  }
  setFontSize(pt: number) {
    this.fontSize = pt;
  }
  /** jsPDF char spacing, in points. The context is already scaled to page
   *  units, so the CSS length is in those same units. Ignored by browsers
   *  without `letterSpacing`, which only costs the header's slight tracking. */
  setCharSpace(pt: number) {
    const ctx = this.ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${pt}px`;
  }
  setLineWidth(w: number) {
    this.ctx.lineWidth = w;
  }
  setLineDashPattern(pattern: number[], phase = 0) {
    this.ctx.setLineDash(pattern || []);
    this.ctx.lineDashOffset = phase;
  }

  rect(x: number, y: number, w: number, h: number, style: Style = 'S') {
    if (this.frozen) return;
    if (style.includes('F') || style.includes('D')) {
      this.ctx.fillStyle = this.fillColor;
      this.ctx.fillRect(x, y, w, h);
    }
    if (style.includes('S')) {
      this.ctx.strokeStyle = this.strokeColor;
      this.ctx.strokeRect(x, y, w, h);
    }
  }

  line(x1: number, y1: number, x2: number, y2: number) {
    if (this.frozen) return;
    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, _style: Style = 'F') {
    if (this.frozen) return;
    this.ctx.fillStyle = this.fillColor;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.lineTo(x3, y3);
    this.ctx.closePath();
    this.ctx.fill();
  }

  // jsPDF: lines(segments, x, y, scale, style). The poster passes a single cubic
  // Bézier segment [c1x, c1y, c2x, c2y, ex, ey], relative to (x, y).
  lines(segments: number[][], x: number, y: number, _scale?: [number, number], _style: Style = 'S') {
    if (this.frozen) return;
    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    for (const s of segments) {
      if (s.length >= 6) this.ctx.bezierCurveTo(x + s[0], y + s[1], x + s[2], y + s[3], x + s[4], y + s[5]);
      else if (s.length >= 2) this.ctx.lineTo(x + s[0], y + s[1]);
    }
    this.ctx.stroke();
  }

  text(
    str: string,
    x: number,
    y: number,
    opts?: { align?: CanvasTextAlign; baseline?: CanvasTextBaseline }
  ) {
    if (this.frozen) return;
    this.applyFont();
    this.ctx.fillStyle = this.textColor;
    this.ctx.textAlign = opts?.align ?? 'left';
    this.ctx.textBaseline = opts?.baseline ?? 'alphabetic';
    this.ctx.fillText(plainDigits(str), x, y);
  }

  getTextWidth(str: string): number {
    this.applyFont();
    return this.ctx.measureText(plainDigits(str)).width;
  }

  splitTextToSize(str: string, maxW: number): string[] {
    this.applyFont();
    const words = str.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const trial = line ? line + ' ' + w : w;
      if (this.ctx.measureText(trial).width <= maxW || !line) {
        line = trial;
      } else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [str];
  }

  addImage(src: string, _fmt: string, x: number, y: number, w: number, h: number) {
    if (this.frozen) return;
    this.images.push({ src, x, y, w, h });
  }

  addPage() {
    // Preview is a single raster — freeze after the first sheet.
    this.frozen = true;
  }

  /** Load + draw every queued image (pieces sit on top of their squares). */
  async flushImages(): Promise<void> {
    const cache = new Map<string, HTMLImageElement>();
    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const cached = cache.get(src);
        if (cached) return resolve(cached);
        const img = new Image();
        img.onload = () => {
          cache.set(src, img);
          resolve(img);
        };
        img.onerror = () => reject(new Error('img load failed'));
        img.src = src;
      });
    for (const im of this.images) {
      try {
        const img = await load(im.src);
        this.ctx.drawImage(img, im.x, im.y, im.w, im.h);
      } catch {
        // a missing piece just isn't drawn
      }
    }
  }

  toDataURL(): string {
    return this.canvas.toDataURL('image/png');
  }
}
