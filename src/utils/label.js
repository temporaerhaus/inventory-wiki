// What of an item's description fits on its label. The labels are printed by
// the label terminal (see the label-terminal repository, src/renderer.js),
// which lays them out like LabelComponent does; keep the three in step.

export const mm2pt = (mm) => mm / 25.4 * 72;

// the text column of the two label sizes: font size, width and lines of the
// description below the inventory number and the title
export const LAYOUTS = {
  small: { fontSize: 6, maxWidth: mm2pt(50 - 10 - 7.5 - 3), maxLines: 2, titleFontSize: 6 },
  large: { fontSize: 8, maxWidth: mm2pt(90 - 18 - 13.45 - 2), maxLines: 3, titleFontSize: 9 },
};
export const layoutOf = (small) => small ? LAYOUTS.small : LAYOUTS.large;

// the description as printed: the serial number and, for loans, the owner first
export function labelDescription({ inventoryId = '', description = '', serial = '', owner = '' } = {}) {
  let text = description || '';
  if (String(inventoryId).startsWith('L-') && owner) {
    text = `Eigentümer*in: ${owner}\n${text}`;
  }
  if (serial) {
    text = `S/N: ${serial}\n${text}`;
  }
  return text;
}

// The labels are set in Roboto Mono, where every glyph, the ellipsis and
// umlauts included, is 1229/2048 em wide; so this is what measuring the text
// in a pdf (which is what the label terminal does) comes to.
const ADVANCE = 1229 / 2048;
export const monoWidth = (text, fontSize) => [...text].length * fontSize * ADVANCE;

// The longest start of text that fits into maxWidth, with an ellipsis if it is
// cut. The same search as in the label terminal (Brent's method over the
// length), so that it comes to the same result.
export function truncateText(text, { maxWidth, fontSize }, width = monoWidth) {
  const { length } = text;
  let b = length;
  const trunc = (len) => {
    len = Math.max(Math.round(len, 0), 1);
    return len < length ? `${text.slice(0, len - 1)}…` : text;
  };
  const f = (len) => width(trunc(len), fontSize) - maxWidth;
  let bx = f(b);
  if (bx > 0) {
    let a = 0, ax = f(0);
    if (ax >= 0) {
      return '…';
    }
    if (Math.abs(ax) < Math.abs(bx)) {
      [a, ax, b, bx] = [b, bx, a, ax];
    }
    const xTol = 1;
    let c = a, cx = ax, mflag = true, d, maxIter = 20;
    while (maxIter-- && Math.abs(b - a) > xTol) {
      const acx = ax - cx;
      const bcx = bx - cx;
      const abx = ax - bx;
      let s = Math.abs(acx) > Number.EPSILON && Math.abs(bcx) > Number.EPSILON ?
        a * bx * cx / (abx * acx) + b * ax * cx / (-abx * bcx) + c * ax * bx / (acx * bcx) :
        b - bx * (b - a) / (bx - ax);
      if (s < (3 * a + b) / 4 || s > b || (
        mflag ?
          (Math.abs(s - b) >= Math.abs(b - c) / 2 || Math.abs(b - c) < Math.abs(2 * Number.EPSILON * Math.abs(b))) :
          (Math.abs(s - b) >= Math.abs(c - d) / 2 || Math.abs(c - d) < Math.abs(2 * Number.EPSILON * Math.abs(b)))
      )) {
        s = (a + b) / 2;
        mflag = true;
      } else {
        mflag = false;
      }

      const sx = f(s);
      [d, c, cx] = [c, b, bx];
      if (ax * sx < 0) {
        [b, bx] = [s, sx];
      } else {
        [a, ax] = [s, sx];
      }

      if (Math.abs(ax) < Math.abs(bx)) {
        [a, ax, b, bx] = [b, bx, a, ax];
      }
    }
    return trunc(ax < bx ? a : b);
  }
  return text;
}

// The lines of text on the label: a line too long goes on in the next one,
// empty lines are left out, and what is beyond the last line is cut off.
// printed: how much of text made it onto the label, everything from there on
// did not.
export function fitDescription(text, { fontSize, maxWidth, maxLines }, width = monoWidth) {
  const lines = [];
  const stack = [];
  let start = 0;
  for (const line of text.split('\n')) {
    stack.push({ line, start });
    start += line.length + 1;
  }

  let printed = 0;
  while (stack.length > 0 && lines.length < maxLines) {
    const { line, start } = stack.shift();
    const fitted = truncateText(line, { fontSize, maxWidth }, width);
    const pos = fitted.indexOf('…');
    if (pos >= 0) {
      lines.push(fitted.slice(0, pos));
      stack.unshift({ line: line.slice(pos), start: start + pos });
      printed = start + pos;
    } else {
      if (fitted.length > 0) {
        lines.push(fitted);
      }
      printed = start + line.length;
    }
  }
  if (stack.length === 0) {
    printed = text.length;
  }

  return { text: lines.filter(e => e).slice(0, maxLines + 1).join('\n'), lines, printed };
}

export const shortenDescription = (text, layout, width = monoWidth) => fitDescription(text, layout, width).text;
