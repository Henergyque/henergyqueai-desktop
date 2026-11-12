// Icône finale : grille 32, papillon exact du logo, sol dessiné symétrique.
const sharp = require("sharp");
const path = require("node:path");
const out = process.argv[2] || path.join(__dirname, "..", "build", "icon.png");
const N = 32, margin = 1, size = 29, R = 6, AXIS = 15; // tuile x 1..29, axe sur 15 comme le papillon
const C = {
  ink: [59, 38, 32], top: [251, 245, 233], bottom: [244, 234, 214],
  g1: [143, 174, 107], g2: [104, 138, 76], g3: [72, 102, 56], pink: [222, 130, 160], petal: [250, 214, 226],
};
const fly = require(path.join(__dirname, "butterfly-grid.json")).map((r) => r.slice(0, 23)).slice(1, 17);
const px = Buffer.alloc(N * N * 4);
const set = (x, y, [r, g, b]) => { const i = (y * N + x) * 4; px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = 255; };
const inside = (x, y) => {
  const lx = x - margin, ly = y - margin;
  if (lx < 0 || ly < 0 || lx >= size || ly >= size) return false;
  const cx = Math.min(Math.max(lx, R), size - 1 - R), cy = Math.min(Math.max(ly, R), size - 1 - R);
  return (lx - cx) ** 2 + (ly - cy) ** 2 <= R * R + R;
};
const edge = (x, y) => !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  if (!inside(x, y)) continue;
  if (edge(x, y)) { set(x, y, C.ink); continue; }
  let color = y < 17 ? C.top : C.bottom;
  if (y >= 28) color = C.g3;
  else if (y >= 26) color = C.g2;
  else if (y === 25) color = C.g1;
  set(x, y, color);
}
// Touffes d'herbe et fleurs, en miroir autour de l'axe central (x 15,5).
const left = [[3, 24, "g1"], [4, 24, "g2"], [7, 24, "g1"], [10, 24, "g2"], [12, 24, "g1"], [13, 23, "g1"], [5, 23, "g1"]];
const flowers = [[6, 22], [11, 22]];
for (const [x, y, c] of left) { set(x, y, C[c]); set(2 * AXIS - x, y, C[c]); }
for (const [x, y] of flowers) for (const X of [x, 2 * AXIS - x]) {
  set(X, y, C.pink); set(X, y + 1, C.g2); set(X, y + 2, C.g2);
  set(X - 1, y, C.petal); set(X + 1, y, C.petal); set(X, y - 1, C.petal);
}
// Papillon : 23 de large, centré (axe sur la colonne 15 → départ en 4), au-dessus du sol.
const ox = 4, oy = 4;
fly.forEach((row, r) => row.forEach((c, x) => c && set(ox + x, oy + r, c.split(",").map(Number))));
sharp(px, { raw: { width: N, height: N, channels: 4 } }).resize(1024, 1024, { kernel: "nearest" }).png().toFile(out).then(() => console.log(out));
