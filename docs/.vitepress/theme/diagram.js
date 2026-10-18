// Shapes for the SVG diagrams. Each diagram builds a list of them per layout and
// DiagramSvg.vue draws the list; colors come from the classes in custom.css.

// Width of one JetBrains Mono character at 12px, rounded up so chips never clip.
const CHAR = 7.4;
export const chipWidth = (text) => Math.round(text.length * CHAR + 22);

export const rect = (x, y, w, h, cls, rx = 12) => ({ type: 'rect', x, y, w, h, cls, rx });
export const text = (x, y, cls, content, anchor = 'start') => ({ type: 'text', x, y, cls, content, anchor });
export const line = (x1, y1, x2, y2, cls = 'ln') => ({ type: 'line', x1, y1, x2, y2, cls });
export const path = (d, cls = 'ln') => ({ type: 'path', d, cls });

// An arrowhead whose tip is at (x, y), pointing right, left, down or up.
export function head(x, y, dir, cls = 'ah') {
  const [a, b] = { r: [[-9, -5], [-9, 5]], l: [[9, -5], [9, 5]], d: [[-5, -9], [5, -9]], u: [[-5, 9], [5, 9]] }[dir];
  return { type: 'polygon', cls, points: `${x},${y} ${x + a[0]},${y + a[1]} ${x + b[0]},${y + b[1]}` };
}

// A vertical or horizontal arrow from (x1, y1) to the tip at (x2, y2).
export function arrow(x1, y1, x2, y2, cls = '') {
  const dir = x1 === x2 ? (y2 > y1 ? 'd' : 'u') : (x2 > x1 ? 'r' : 'l');
  return [line(x1, y1, x2, y2, `ln ${cls}`), head(x2, y2, dir, `ah ${cls}`)];
}
