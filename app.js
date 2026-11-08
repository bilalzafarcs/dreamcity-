/* Friend counts decide house levels, so they are fetched first; the town still opens if the database is slow or away. */
const dreamCity = () => {
'use strict';
const $ = id => document.getElementById(id);
if (!window.THREE) { document.body.insertAdjacentHTML('beforeend', '<div id="err">The 3D engine did not load. Check your connection and refresh the page.</div>'); return; }
const CFG = window.TOWN;
const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;

/* ---------- small helpers ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};
const lat = (x, y) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0; n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j;
  const u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  const a = lat(i, j), b = lat(i + 1, j), c = lat(i, j + 1), d = lat(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, o = 4) => { let s = 0, a = .5; for (let i = 0; i < o; i++) { s += a * noise(x, y); x = x * 2.03 + 7; y = y * 2.03 + 3; a *= .5; } return s; };
const ridged = (x, y) => { let s = 0, a = .5; for (let i = 0; i < 5; i++) { s += a * (1 - Math.abs(2 * noise(x, y) - 1)); x = x * 2.1 + 3; y = y * 2.1 + 11; a *= .52; } return s; };

/* ---------- geometry builder: one merged, vertex-coloured buffer per map chunk ---------- */
const colorCache = new Map();
const rgb = hex => { let c = colorCache.get(hex); if (!c) { const t = new THREE.Color(hex); c = [t.r, t.g, t.b]; colorCache.set(hex, c); } return c; };
class Geo {
  constructor() { this.cap = 3000; this.n = 0; this.p = new Float32Array(this.cap * 3); this.m = new Float32Array(this.cap * 3); this.c = new Float32Array(this.cap * 3); this.ox = 0; this.oz = 0; this.flip = 1; }
  at(x, z, flip = 1) { this.ox = x; this.oz = z; this.flip = flip; return this; }
  grow() { this.cap *= 2; for (const k of ['p', 'm', 'c']) { const a = new Float32Array(this.cap * 3); a.set(this[k]); this[k] = a; } }
  tri(a, b, c, col) {
    if (this.n + 3 > this.cap) this.grow();
    const f = this.flip, k = this.sc || 1, ky = this.sy || 1, P = [a, b, c].map(v => [v[0] * k * f + this.ox, v[1] * ky, v[2] * k * f + this.oz]);
    const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2], vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const v of P) { const i = this.n * 3; this.p[i] = v[0]; this.p[i + 1] = v[1]; this.p[i + 2] = v[2]; this.m[i] = nx; this.m[i + 1] = ny; this.m[i + 2] = nz; this.c[i] = col[0]; this.c[i + 1] = col[1]; this.c[i + 2] = col[2]; this.n++; }
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  note(cx, y0, cz, w, y1, d) { // anything at car height, in world space, for driving
    const k = this.sc || 1, ky = this.sy || 1, f = this.flip, a = y0 * ky, b = y1 * ky; if (a > 1.6 || b < .34 || (w < .05 && d < .05) || (b < .55 && Math.max(w, d) * k > 12)) return; // long low boards such as jetties are driven over
    const X = cx * k * f + this.ox, Z = cz * k * f + this.oz, hx = w * k / 2, hz = d * k / 2; this.hits.push(X - hx, X + hx, Z - hz, Z + hz);
  }
  box(cx, y0, cz, w, h, d, hex) {
    if (this.hits) this.note(cx, y0, cz, w, y0 + h, d);
    const c = rgb(hex), x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], c);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], c);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], c);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], c);
  }
  gable(cx, y0, cz, w, wall, rise, d, over, roofHex, endHex) {
    const c = rgb(roofHex), xm = cx, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const ox0 = x0 - over, ox1 = x1 + over, oz0 = z0 - over, oz1 = z1 + over, yr = y0 + wall + rise, yb = y0 + wall - over * rise / (w / 2);
    this.quad([ox0, yb, oz0], [ox0, yb, oz1], [xm, yr, oz1], [xm, yr, oz0], c);
    this.quad([ox1, yb, oz1], [ox1, yb, oz0], [xm, yr, oz0], [xm, yr, oz1], c);
    const e = rgb(endHex), yw = y0 + wall;
    this.tri([x0, yw, z1], [x1, yw, z1], [xm, yr, z1], e);
    this.tri([x1, yw, z0], [x0, yw, z0], [xm, yr, z0], e);
  }
  add(g, hex, tx = 0, ty = 0, tz = 0, sx = 1, sy = 1, sz = 1) { // merge a THREE geometry
    if (this.hits) { if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox; this.note((b.min.x + b.max.x) / 2 * sx + tx, b.min.y * sy + ty, (b.min.z + b.max.z) / 2 * sz + tz, (b.max.x - b.min.x) * sx, b.max.y * sy + ty, (b.max.z - b.min.z) * sz); }
    const nonIdx = g.index ? g.toNonIndexed() : g, a = nonIdx.attributes.position, c = rgb(hex);
    for (let i = 0; i < a.count; i += 3) {
      const v = j => [a.getX(i + j) * sx + tx, a.getY(i + j) * sy + ty, a.getZ(i + j) * sz + tz];
      this.tri(v(0), v(1), v(2), c);
    }
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p.slice(0, this.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.m.slice(0, this.n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.c.slice(0, this.n * 3), 3));
    return new THREE.Mesh(g, mat);
  }
}

/* ---------- town plan: slots are fixed forever, so residents never move ---------- */
const ROW = 34, STEP = 13, AVE = 96, SET = 11;
const riverZ = x => 84 + 15 * Math.sin(x / 62) + 6 * Math.sin(x / 23 + 1);
const STREETS = ['Edelweiss Lane', 'Marmot Way', 'Gentian Row', 'Cowbell Road', 'Larch Avenue', 'Glacier View', 'Chamois Street', 'Alpenrose Lane', 'Old Mill Road', 'Cheesemaker Row', 'Snowline Street', 'Ibex Way', 'Sawmill Lane', 'Ferry Road', 'Stonepine Row', 'Summit Street', 'Hayloft Lane', 'Bellringer Way', 'Bridge Road', 'Meadow Row', 'Spring Street', 'Toboggan Lane', 'Pasture Way', 'Lantern Row'];
const streetName = k => { const i = k >= 0 ? 2 * k : -2 * k - 1; return STREETS[i] || `Lane ${i + 1}`; };
const seenNicks = new Set();
const live = { friends: {}, votes: {}, claims: [], ...(CFG.state || {}) };
const voteOptions = CFG.buildOptions.filter(o => !(CFG.opened || []).includes(o)); // a building that is up leaves the ballot
const levelFor = n => { let l = 1; CFG.levels.forEach(([, need], i) => { if (n >= need) l = i + 1; }); return l; };
const friendsOf = key => live.friends[key] || 0;
const residents = CFG.residents.map(r => typeof r === 'string' ? { n: r } : r).concat([...live.claims].sort((a, b) => a.at - b.at).map(c => ({ ...c, claimed: true }))).map(r => ({ ...r, lvl: Math.max(r.lvl || 1, levelFor(friendsOf(r.n.toLowerCase()))) })).filter(r => { const k = r.n.trim().toLowerCase(); if (seenNicks.has(k)) return false; seenNicks.add(k); return true; });
function makeSlots(need) {
  const K = Math.ceil(Math.sqrt(need) / 1.5) + 7, I = K * 3, out = [];
  for (let k = -K; k <= K; k++) for (const side of [-1, 1]) for (let i = -I; i <= I; i++) {
    const x = i * STEP, z = k * ROW + side * SET;
    if (Math.abs(x) < 50 && Math.abs(z) < 44) continue;
    const m = ((x % AVE) + AVE + AVE / 2) % AVE - AVE / 2;
    if (Math.abs(m) < 10) continue;
    if (Math.abs(z - riverZ(x)) < 20) continue;
    out.push({ x, z, k, i, side, d: x * x + z * z * 1.25 + (Math.abs(x) > 0 ? 0 : -1) + (side > 0 ? .1 : 0) });
  }
  return out.sort((a, b) => a.d - b.d || a.x - b.x);
}
const slots = makeSlots(Math.max(residents.length, CFG.plots || 0) + 12);
// Lots are handed out in order, so nobody moves when new people join. Some wishes need a special lot.
const claimLots = new Set(live.claims.filter(c => c.lot).map(c => `${c.lot.k}:${c.lot.side}:${c.lot.i}`)); // a resident added later never lands on a plot someone claimed
const taken = new Set(), WIDE = new Set(['castle', 'football', 'shelter', 'mansion', 'huge', 'biggest', 'goldmansion']), CUSTOM = new Set(['manor', 'tall', 'five', 'tower', 'blocks', 'tank', 'market', 'tree', 'spaceship', 'donut', 'chicken', 'pizza', 'music', 'skyscraper', 'mansion', 'huge', 'biggest', 'sphere', 'goldmansion', 'lighthouse', 'pyramid', 'banana', 'bus', 'church', 'cathouse', 'burger', 'bank']);
const addr = s => { const p = s.i >= 0 ? 2 * s.i : -2 * s.i - 1; return { x: s.x, z: s.z, k: s.k, i: s.i, side: s.side, street: streetName(s.k), num: p * 2 + (s.side > 0 ? 2 : 1), flip: s.side > 0 ? -1 : 1 }; };
let nextFree = 0; // lots are handed out in order, so plain residents never need to scan the whole town
function lotFor(r) {
  if (!r.lot && !r.wish) { while (taken.has(slots[nextFree]) || mallBlock.has(slots[nextFree]) || (claimLots.size && claimLots.has(`${slots[nextFree].k}:${slots[nextFree].side}:${slots[nextFree].i}`))) nextFree++; return slots[nextFree]; }
  const free = slots.filter(s => !taken.has(s) && !mallBlock.has(s) && (r.lot || !claimLots.size || !claimLots.has(`${s.k}:${s.side}:${s.i}`)));
  if (r.lot) { const s = free.find(o => o.k === r.lot.k && o.side === r.lot.side && o.i === r.lot.i); if (s) return s; }
  if (r.wish === 'river') { // the free lot closest to the water, with its back to the river
    return free.filter(s => Math.abs(s.x) < 160).map(s => [Math.abs(s.z - riverZ(s.x)), s]).filter(([, s]) => (riverZ(s.x) - s.z) * s.side > 0).sort((a, b) => a[0] - b[0])[0][1];
  }
  if (r.wish === 'corner') return free.filter(s => Math.abs(s.x) < 150).map(s => [Math.abs(((s.x % AVE) + AVE + AVE / 2) % AVE - AVE / 2), s]).sort((a, b) => a[0] - b[0])[0][1];
  if (r.wish === 'edge') return free[Math.min(free.length - 1, Math.max(0, 420 - taken.size - 2))];
  if (WIDE.has(r.wish)) for (const s of free) { const n = free.find(o => o.k === s.k && o.side === s.side && o.i === s.i + 1); if (n) { taken.add(n); return Object.assign(s, { yard: STEP }); } }
  return free[0];
}
const CIVIC = [{ kind: 'police', k: -2, side: -1, i: -10 }, { kind: 'hospital', k: -2, side: -1, i: 9 }, { kind: 'fire', k: 4, side: -1, i: -5 }]; // all three face the camera's usual direction
for (const c of CIVIC) { c.lot = slots.find(s => s.k === c.k && s.side === c.side && s.i === c.i); taken.add(c.lot); taken.add(slots.find(s => s.k === c.k && s.side === c.side && s.i === c.i + 1)); }
const MALL = { x: 0, z: -612, W: 112, D: 52, front: -586 }; const mallBlock = new Set(slots.filter(s => Math.abs(s.x) < 92 && Math.abs(s.z) > 548 && Math.abs(s.z) < 660 && (s.z > 0 || Math.abs(s.x) < 84))); // the Dream Mall's block, beyond the last resident. Kept out of `taken` on purpose: its size decides one resident's lot
const houses = residents.map((r, idx) => {
  const s = lotFor(r); taken.add(s);
  return { id: idx + 1, nick: r.n, key: r.n.toLowerCase(), alias: (r.a || '').toLowerCase(), lvl: clamp(r.lvl || 1, 1, 3), h: hash(r.n), wish: r.wish, tint: r.tint, style: r.style, claimed: !!r.claimed, followed: !!r.f, yard: s.yard, ...addr(s) };
});
const plots = slots.slice(0, Math.max(houses.length, CFG.plots || 0)).filter(s => !taken.has(s) && !mallBlock.has(s)).map((s, idx) => ({ plot: true, id: houses.length + idx + 1, ...addr(s) }));
const lots = houses.concat(plots);
const byKey = new Map(houses.map(h => [h.key, h]));
for (const h of houses) if (h.alias && !byKey.has(h.alias)) byKey.set(h.alias, h);
const townR = Math.max(150, ...lots.map(h => Math.hypot(h.x, h.z))) + 28;

function height(x, z) {
  const r = Math.hypot(x, z * 1.05);
  const hills = smooth(townR + 30, townR + 125, r) * (fbm(x / 70, z / 70, 3) * 22);
  const a = smooth(townR + 145, townR + 480, r);
  const mountains = a * a * (35 + ridged(x / 190 + 3, z / 190 + 9) * 370 * (.55 + .45 * smooth(townR + 190, townR + 530, r)));
  let y = hills + mountains;
  const d = Math.abs(z - riverZ(x));
  const c = 1 - smooth(9, 18 + a * 60, d);
  return y * (1 - c) + -3.4 * c;
}

/* ---------- renderer and scene ---------- */
const canvas = $('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch { document.body.insertAdjacentHTML('beforeend', '<div id="err">This device could not start 3D graphics. Try another browser.</div>'); if (window.bootDone) window.bootDone(); return; }
const PHONE = innerWidth < 760 || matchMedia('(pointer: coarse)').matches;
for (const g of ['gesturestart', 'gesturechange']) document.addEventListener(g, e => e.preventDefault(), { passive: false }); // a pinch moves the camera, it never zooms the page and blurs the picture
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let maxRatio = PHONE ? 2 : 2; // phones get a lighter picture from the start, and slow devices step down further while running
renderer.setPixelRatio(Math.min(devicePixelRatio, maxRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe0ee, townR * 2.2, townR + 1600);
const camera = new THREE.PerspectiveCamera(42, 1, 1, townR + 1900);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8f8a5e, 1);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(PHONE ? 1024 : 2048, PHONE ? 1024 : 2048); sun.shadow.bias = -.0006; sun.shadow.normalBias = .4;
scene.add(hemi, sun, sun.target);
const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
const glow = new THREE.MeshBasicMaterial({ color: 0x38505c });

/* sky dome and water colours, updated with the time of day */
const skyU = { top: { value: new THREE.Color('#6fb7e4') }, low: { value: new THREE.Color('#d7ecf2') } };
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(townR + 1700, 20, 12), new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false, vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: 'uniform vec3 top, low; varying vec3 vD; void main() { gl_FragColor = vec4(mix(low, top, pow(clamp(vD.y * 1.7, 0., 1.), .62)), 1.);\n#include <colorspace_fragment>\n}' }));
skyDome.renderOrder = -10; skyDome.frustumCulled = false; scene.add(skyDome);
const waterU = { t: { value: 0 }, light: { value: 1 }, deep: { value: new THREE.Color('#2b8cb0') }, shallow: { value: new THREE.Color('#79d2cc') }, sunC: { value: new THREE.Color('#ffffff') }, fogC: { value: new THREE.Color('#d7ecf2') }, fogNear: { value: 500 }, fogFar: { value: 1500 } };
/* terrain */
(() => {
  const size = townR + 840, step = Math.max(6, size / 170), n = Math.ceil(2 * size / step), g = new Geo();
  const paint = (x, y, z, slope) => {
    const v = fbm(x / 34, z / 34, 3), snowline = 92 + 34 * noise(x / 60, z / 60);
    if (y < -1.1) return rgb(v > .5 ? '#dccb97' : '#cfbd88');
    if (y > snowline && slope < 1.25) return rgb(v > .5 ? '#ffffff' : '#e2eef8');
    if (y > 58 || slope > .95) return rgb(v > .62 ? '#9a8b86' : v > .46 ? '#857982' : '#716a76');
    if (y > 30) return rgb(v > .5 ? '#67935a' : '#578353');
    const m = fbm(x / 120 + 7, z / 120 + 3, 2) * .5 + v * .5;
    return rgb(m > .6 ? '#a3c95f' : m > .53 ? '#92c057' : m > .46 ? '#82b551' : m > .39 ? '#74a94e' : '#689d4c');
  };
  const H = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) H[j * (n + 1) + i] = height(-size + i * step, -size + j * step);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -size + i * step, z = -size + j * step, X = x + step, Z = z + step;
    const a = H[j * (n + 1) + i], b = H[j * (n + 1) + i + 1], c = H[(j + 1) * (n + 1) + i], d = H[(j + 1) * (n + 1) + i + 1];
    const col1 = paint(x + step / 3, (a + b + c) / 3, z + step / 3, Math.max(Math.abs(a - b), Math.abs(a - c)) / step);
    const col2 = paint(X - step / 3, (b + c + d) / 3, Z - step / 3, Math.max(Math.abs(d - b), Math.abs(d - c)) / step);
    g.tri([x, a, z], [x, c, Z], [X, b, z], col1);
    g.tri([X, b, z], [x, c, Z], [X, d, Z], col2);
  }
  const m = g.mesh(solid); m.receiveShadow = true; scene.add(m);
  const w = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, size * 2), new THREE.ShaderMaterial({ uniforms: waterU, vertexShader: 'varying vec3 vP; void main() { vec4 p = modelMatrix * vec4(position, 1.); vP = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }',
    fragmentShader: `uniform float t, light, fogNear, fogFar; uniform vec3 deep, shallow, sunC, fogC; varying vec3 vP;
      void main() { float rz = 84. + 15. * sin(vP.x / 62.) + 6. * sin(vP.x / 23. + 1.), d = abs(vP.z - rz);
        vec3 c = mix(deep, shallow, smoothstep(5., 19., d)) * light;
        float near = 1. - smoothstep(120., 520., distance(vP, cameraPosition)), n = sin(vP.x * .55 + t * .8 + 2. * sin(vP.z * .9)) * sin(vP.z * 2.6 - t * .6 + 1.4 * sin(vP.x * .3));
        c += smoothstep(.78, .99, n) * sunC * .2 * light * near;
        gl_FragColor = vec4(mix(c, fogC, smoothstep(fogNear, fogFar, distance(vP, cameraPosition))), 1.);
        #include <colorspace_fragment>
      }` }));
  w.rotation.x = -Math.PI / 2; w.position.y = -1.25; scene.add(w);
})();

/* ---------- house designs: every design is built facing +z ---------- */
const WOOD = ['#8a5a34', '#70452a', '#a26d3e', '#5e3b26'], PLASTER = ['#f6ecd6', '#f0dfb6', '#e4e8dd', '#f1d196', '#d6e2cc'], STONE = ['#8f8e88', '#a39f95', '#7b7c79'];
const ROOF = ['#525a6b', '#c6502f', '#3f6e5c', '#96412f', '#3f5478', '#6d5240'], SHUT = ['#2f6f5b', '#b6302a', '#2e5c8a', '#d8a22c', '#6e3b5e'];
/* Fine detail goes into its own mesh per map chunk and is drawn only near the camera, so the town stays light. */
let det = null;
const shades = new Map();
const shade = (hex, f) => { const k = hex + f; if (!shades.has(k)) { const c = new THREE.Color(hex).multiplyScalar(f); shades.set(k, `#${c.getHexString()}`); } return shades.get(k); };
const faceZ = (x0, x1, y0, y1, z, hex) => det.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], rgb(hex));
const faceX = (x, z0, z1, y0, y1, hex, s = 1) => s > 0 ? det.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], rgb(hex)) : det.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], rgb(hex));
function planks(x, y, z, w, h, hex) { for (let a = y + .36; a < y + h - .08; a += .42) faceZ(x - w / 2, x + w / 2, a, a + .05, z + .02, shade(hex, .68)); }
function planksSide(cz, y, w, d, h, hex) { for (let a = y + .36; a < y + h - .08; a += .42) { faceX(w / 2 + .02, cz - d / 2, cz + d / 2, a, a + .05, shade(hex, .68)); faceX(-w / 2 - .02, cz - d / 2, cz + d / 2, a, a + .05, shade(hex, .68), -1); } }
function stones(x, y, z, w, h, hex, r, n = 15) { for (let i = 0; i < n; i++) { const bw = .5 + r() * .7, bh = .26 + r() * .22, bx = x - w / 2 + r() * (w - bw), by = y + .3 + r() * (h - .3 - bh); faceZ(bx, bx + bw, by, by + bh, z + .02, shade(hex, r() > .5 ? 1.16 : .8)); } }
function gableD(g, cx, y0, cz, w, wall, rise, d, over, roofHex, endHex) {
  g.gable(cx, y0, cz, w, wall, rise, d, over, roofHex, endHex);
  const xm = cx, ox0 = cx - w / 2 - over, ox1 = cx + w / 2 + over, oz0 = cz - d / 2 - over, oz1 = cz + d / 2 + over, yr = y0 + wall + rise, yb = y0 + wall - over * rise / (w / 2), rows = Math.max(4, Math.round(rise * 2)), dark = rgb(shade(roofHex, .76));
  for (let i = 0; i < rows; i++) {
    const a = (i + .35) / rows, b = a + .22 / rows, xa = ox0 + (xm - ox0) * a, xb = ox0 + (xm - ox0) * b, xc = ox1 + (xm - ox1) * a, xd = ox1 + (xm - ox1) * b, ya = yb + (yr - yb) * a + .05, yc = yb + (yr - yb) * b + .05;
    det.quad([xa, ya, oz0], [xa, ya, oz1], [xb, yc, oz1], [xb, yc, oz0], dark); det.quad([xc, ya, oz1], [xc, ya, oz0], [xd, yc, oz0], [xd, yc, oz1], dark);
  }
  det.box(cx, yr - .04, cz, .34, .14, d + over * 2 + .08, shade(roofHex, .68));
  det.box(ox0, yb - .1, cz, .16, .16, d + over * 2, '#e9e4d8'); det.box(ox1, yb - .1, cz, .16, .16, d + over * 2, '#e9e4d8');
}
const BUSH = new THREE.IcosahedronGeometry(.62, 0);
let TRIM = '#f4f1e8';
function win(g, w, x, y, z, ww = 1.3, hh = 1.4, sx = false) { // window on a +z face, or +x when sx
  if (det) {
    const k = TRIM;
    if (sx) { det.box(x + .1, y + hh / 2 - .03, z, .06, .06, ww, k); det.box(x + .1, y, z, .06, hh, .06, k); det.box(x + .08, y - .2, z, .2, .08, ww + .36, k); }
    else {
      det.box(x, y + hh / 2 - .03, z + .1, ww, .06, .06, k); det.box(x, y, z + .1, .06, hh, .06, k); det.box(x, y - .2, z + .1, ww + .36, .08, .2, k);
      if (ww < 2 && y < 2) { det.box(x, y - .46, z + .2, ww + .1, .24, .32, '#6b4a30'); for (let i = 0; i < 4; i++) det.box(x - ww * .38 + i * ww * .25, y - .24, z + .2, .17, .17, .17, ['#d8352b', '#f6c81e', '#e47ab0', '#f3f1ea'][i % 4]); }
    }
  }
  if (sx) { g.box(x, y - .12, z, .1, hh + .24, ww + .24, TRIM); w.box(x + .04, y, z, .1, hh, ww, '#000'); }
  else { g.box(x, y - .12, z, ww + .24, hh + .24, .1, TRIM); w.box(x, y, z + .04, ww, hh, .1, '#000'); }
}
function shutters(g, x, y, z, hex) { g.box(x - 1, y, z + .03, .5, 1.5, .1, hex); g.box(x + 1, y, z + .03, .5, 1.5, .1, hex); }
const ORDER = [3, 1, 4, 7, 2, 6, 0, 5], MAIN = ['wood', 'wood', 'st', 'pla', 'pla', 'pla', 'wood', 'pla'], usedDesigns = new Set(), placed = new Map();
// Every resident gets a design nobody else has: house type, wall colour and roof colour first,
// then shutters, size and garden extras once those combinations run out. Older residents keep theirs.
function design(h) {
  // next-door houses never share a type; earlier residents decide first, so nobody changes when others join
  const near = new Set(), gx = Math.floor(h.x / 29), gz = Math.floor(h.z / 29);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of placed.get(`${gx + a},${gz + b}`) || []) if (Math.hypot(o.x - h.x, o.z - h.z) < 29) near.add(o.type);
  const start = h.id === 1 ? 0 : (h.id - 2) % ORDER.length;
  const type = Number.isInteger(h.style) ? h.style : h.wish === 'cabin' || h.wish === 'tub' ? 1 : h.wish === 'black' || h.wish === 'river' ? 3 : h.id === 1 ? 0 : (ORDER.map((_, i) => ORDER[(start + i) % ORDER.length]).find(t => !near.has(t)) ?? ORDER[start]);
  { const k = `${gx},${gz}`; if (!placed.has(k)) placed.set(k, []); placed.get(k).push({ x: h.x, z: h.z, type }); }
  for (let seed = h.h, tries = 0; ; seed++, tries++) {
    const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
    const d = { type, wood: pick(WOOD), pla: pick(PLASTER), st: pick(STONE), roof: pick(ROOF), acc: pick(SHUT), W: 7 + r() * 1.5, D: 7 + r() * 1.5, extra: 1 + Math.floor(r() * 31) };
    const base = `${type}|${d[MAIN[type]]}|${d.roof}`, full = `${base}|${d.acc}|${d.extra}|${d.W.toFixed(1)}`, sig = tries < 300 ? base : full;
    if (usedDesigns.has(sig)) continue;
    usedDesigns.add(base); usedDesigns.add(full);
    if (h.tint) Object.assign(d, { wood: h.tint, pla: h.tint });
    if (h.wish === 'black') Object.assign(d, { wood: '#232529', pla: '#1b1d20', st: '#2a2c30', roof: '#101114', acc: '#34373c' });
    if (h.wish === 'river') { d.W = 7; d.D = 7; }
    return d;
  }
}
const PLATES = [];
const plate = (h, lx, y, lz, text, width = 4) => { if (!h.plated) PLATES.push({ x: h.x + lx * h.flip, y, z: h.z + lz * h.flip, flip: h.flip, text, width }); };
function castle(g, w, h) { // n.vrecko asked for a castle
  const S = '#a9a69c', D = '#8f8d85', R = '#4d5f7a', cx = (h.yard || 0) * h.flip / 2, cz = -.5, X = 9.5, Z = 5.2;
  g.box(cx, 0, cz - Z, X * 2, 3.6, .9, S); g.box(cx - X, 0, cz, .9, 3.6, Z * 2, S); g.box(cx + X, 0, cz, .9, 3.6, Z * 2, S);
  g.box(cx - 5.5, 0, cz + Z, 7.5, 3.6, .9, S); g.box(cx + 5.5, 0, cz + Z, 7.5, 3.6, .9, S); g.box(cx, 2.4, cz + Z, 3.5, 1.2, .9, S);
  g.box(cx, 0, cz + Z + .1, 3, 2.3, .7, '#3b2a1c');
  for (let i = -9; i <= 9; i += 2) { g.box(cx + i, 3.6, cz - Z, .9, .7, 1, D); if (Math.abs(i) > 2) g.box(cx + i, 3.6, cz + Z, .9, .7, 1, D); }
  for (let j = -4; j <= 4; j += 2) { g.box(cx - X, 3.6, cz + j, 1, .7, .9, D); g.box(cx + X, 3.6, cz + j, 1, .7, .9, D); }
  for (const a of [-X, X]) for (const b of [-Z, Z]) { g.add(TURRET, S, cx + a, 3, cz + b, 1, .92, 1); g.add(TURRET_ROOF, R, cx + a, 7.8, cz + b); w.box(cx + a, 4, cz + b + (b > 0 ? 1.56 : -1.66), .5, .9, .1, '#000'); }
  g.box(cx, 0, cz - 1, 7, 7.5, 5, D); g.gable(cx, 0, cz - 1, 7, 7.5, 2.6, 5, .3, R, D);
  for (const x of [-2, 0, 2]) w.box(cx + x, 4.4, cz + 1.54, .7, 1.4, .1, '#000');
  g.box(cx, 10.1, cz - 1, .14, 2.8, .14, '#e8e8e4'); g.box(cx + .95, 11.8, cz - 1, 1.8, .95, .07, '#d8352b');
}
const rotX = g => g.clone().rotateX(Math.PI / 2);
function special(g, w, h) { // whole buildings people asked for in the comments
  const f = 3.6, r = rng(h.h ^ 77), yard = (h.yard || 0) * h.flip / 2, K = h.wish, wins = (cx, cz, W, n, y0, rows, dy, ww = .9, hh = 1) => { for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) w.box(cx - W / 2 + (i + .5) * W / n, y0 + j * dy, cz, ww, hh, .1, '#000'); };
  if (K === 'tree') {
    g.add(new THREE.CylinderGeometry(1.3, 2, 7, 8), '#6b4a30', 0, 3.5, 0);
    for (const [x, y, z, s] of [[0, 14, -2.6, 2.9], [-3, 12.4, -2.8, 2.3], [3, 12.6, -3, 2.4], [0, 11.6, -4.2, 2.3]]) g.add(CROWN, ['#4f8a44', '#5f9a4a', '#6aa850'][Math.floor(r() * 3)], x, y, z, s, s, s);
    g.box(0, 6, 0, 6.4, .4, 6.4, '#8a5a34'); g.box(0, 6.4, .2, 4.2, 2.6, 3.8, '#a26d3e'); g.gable(0, 6.4, .2, 4.2, 2.6, 1.3, 3.8, .3, '#7f3b2f', '#a26d3e'); w.box(-1, 7.4, 2.14, .9, .9, .1, '#000'); g.box(1, 6.4, 2.13, .9, 1.8, .1, '#4f2f1c');
    for (let y = .5; y < 6; y += .9) g.box(1.9, y, 3.2, 1, .12, .12, '#5e3b26'); g.box(1.45, 0, 3.2, .12, 6.2, .12, '#5e3b26'); g.box(2.35, 0, 3.2, .12, 6.2, .12, '#5e3b26');
  } else if (K === 'spaceship') {
    g.add(new THREE.CylinderGeometry(2.6, 2.6, 8, 12), '#e6e9ec', 0, 5.2, 0); g.add(new THREE.ConeGeometry(2.6, 3.6, 12), '#d8352b', 0, 11, 0); g.add(new THREE.CylinderGeometry(1.6, 2.2, 1.1, 12), '#3a3f47', 0, .7, 0);
    for (const [x, z] of [[3.2, 0], [-3.2, 0], [0, 3.2], [0, -3.2]]) { g.box(x, 0, z, x ? 1.4 : .3, 4, z ? 1.4 : .3, '#d8352b'); }
    w.box(0, 7, 2.56, 1.6, 1.6, .1, '#000'); g.box(0, 1.5, 2.56, 1.2, 2.3, .1, '#3a3f47'); g.box(0, .1, 3.8, 1.3, .1, 2.4, '#8f9499');
  } else if (K === 'donut' || K === 'pizza' || K === 'chicken' || K === 'music' || K === 'market') {
    const c = { donut: '#f7c6d6', pizza: '#e9c98f', chicken: '#f3f1ea', music: '#23252b', market: '#f2efe6' }[K], tr = { donut: '#d94f8a', pizza: '#b4472f', chicken: '#c8201e', music: '#d8352b', market: '#2f7fc0' }[K];
    g.box(0, 0, 0, 8.4, 3.8, 7, c); g.box(0, 3.8, 0, 8.8, .3, 7.4, tr); w.box(-2.2, .7, 3.54, 2.6, 2, .1, '#000'); w.box(2.5, .7, 3.54, 1.9, 2, .1, '#000'); g.box(.3, 0, 3.54, 1.3, 2.4, .1, tr);
    for (let i = 0; i < 9; i++) g.box(-4 + i, 2.9, 3.9, .96, .14, .9, i % 2 ? tr : '#f3f1ea');
    if (K === 'market') { g.box(0, 4.1, 0, 5.4, 1.4, .3, tr); plate(h, 0, 4.2, .2, 'SUPERMARKET', 5); plate(h, 0, 3.2, 3.62, 'FRESH FOOD', 4.4); for (let i = 0; i < 4; i++) { g.box(-3.3 + i * 2.2, 0, 5.4, 1.2, .8, .8, '#8f9499'); g.box(-3.3 + i * 2.2, .8, 5.4, 1, .3, .6, ['#d8352b', '#6aa850', '#e9b23c', '#e07a2e'][i]); } }
    if (K === 'donut') { g.add(new THREE.TorusGeometry(2.3, 1.05, 8, 14), '#d9a066', 0, 7, 0); g.add(new THREE.TorusGeometry(2.3, .85, 8, 14), '#f06fa8', 0, 7, .36); plate(h, 0, 3.2, 3.62, 'DONUTS', 4.6); }
    if (K === 'pizza') { g.add(rotX(new THREE.CylinderGeometry(3.1, 3.1, .4, 14)), '#e0a23c', 0, 7.1, 0); g.add(rotX(new THREE.CylinderGeometry(2.7, 2.7, .1, 14)), '#c8352b', 0, 7.1, .24); for (const [x, y] of [[-1, .7], [1.1, 1], [.1, -1], [-1.5, -.8], [1.5, -.6]]) g.add(rotX(new THREE.CylinderGeometry(.45, .45, .1, 8)), '#7a1f16', x, 7.1 + y, .32); plate(h, 0, 3.2, 3.62, 'PIZZA', 4); }
    if (K === 'chicken') { for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; g.box(Math.cos(a) * 1.8, 4.1, Math.sin(a) * 1.8, 1.1, 3.6, .3 + Math.abs(Math.cos(a)) * .8, i % 2 ? '#c8201e' : '#f3f1ea'); } g.add(CROWN, '#d9a066', 0, 7.8, 0, 1.2, .8, 1.2); plate(h, 0, 3.2, 3.62, 'FRIED CHICKEN', 5.8); }
    if (K === 'music') { g.add(rotX(new THREE.CylinderGeometry(3, 3, .25, 18)), '#14161a', 0, 7.2, 0); g.add(rotX(new THREE.CylinderGeometry(1, 1, .3, 12)), '#d8352b', 0, 7.2, .05); plate(h, 0, 3.2, 3.62, 'PUNK RECORDS', 5.4); }
  } else if (K === 'tall') {
    const wall = ['#e8d9bf', '#c9d6c6', '#d9c1b4'][Math.floor(r() * 3)], rf = ['#7f3b2f', '#3f4a54', '#5a4a3a'][Math.floor(r() * 3)]; g.box(0, 0, 0, 5.4, 13, 5.4, wall); g.box(0, 0, 0, 5.8, .6, 5.8, '#7d7a72'); for (let y = 3.3; y < 13; y += 3.2) g.box(0, y, 0, 5.6, .14, 5.6, '#f4f1e8'); g.gable(0, 0, 0, 5.4, 13, 2.2, 5.4, .3, rf, wall); wins(0, 2.74, 3.6, 2, 3.9, 3, 3.2, 1, 1.4); w.box(-.9, 1, 2.74, .9, 1.3, .1, '#000'); g.box(.9, 0, 2.74, 1.1, 2.3, .1, '#4f2f1c'); g.box(.9, 0, 3.4, 2.2, .3, 1.4, '#a8a39a');
  } else if (K === 'five') {
    const wall = '#b4553f'; g.box(0, 0, 0, 8.6, 16, 7, wall); g.box(0, 0, 0, 9, 1, 7.4, '#6f6a62'); for (let i = 1; i < 5; i++) g.box(0, i * 3.1, 0, 8.8, .16, 7.2, '#e8e2d4'); g.box(0, 16, 0, 9.2, .5, 7.6, '#3f3a35'); g.box(2.8, 16.5, -1.6, 1.4, 1.6, 1.4, '#6f6a62'); wins(0, 3.54, 7, 4, 4.2, 4, 3.1, 1.1, 1.5); w.box(-2.7, 1.3, 3.54, 1.1, 1.5, .1, '#000'); w.box(2.7, 1.3, 3.54, 1.1, 1.5, .1, '#000'); g.box(0, 0, 3.54, 1.6, 2.6, .1, '#3a2a1e'); g.box(0, 2.7, 4.1, 2.4, .14, 1.3, '#3f3a35');
  } else if (K === 'tower') {
    g.add(new THREE.CylinderGeometry(3.2, 3.5, 16, 12), '#a8a49a', 0, 8, 0); g.add(new THREE.CylinderGeometry(3.9, 3.3, 1, 12), '#96928a', 0, 16.4, 0); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.box(Math.cos(a) * 3.6, 16.9, Math.sin(a) * 3.6, .9, 1, .9, '#a8a49a'); } g.add(new THREE.ConeGeometry(3, 4.6, 12), '#2f5a8c', 0, 19.6, 0); g.box(0, 21.8, 0, .1, 2, .1, '#6b4a30'); g.box(.5, 23.1, 0, 1, .6, .06, '#d8352b'); g.box(0, 0, 3.4, 1.5, 2.6, .3, '#4f2f1c'); for (const y of [5, 9, 13]) w.box(0, y, 3.32, .8, 1.3, .1, '#000');
  } else if (K === 'blocks') { // a house built from cubes, block by block
    const S = 1, P = ['#b98a54', '#a87a48', '#c39a62'], St = ['#8f8f8f', '#7c7c7c', '#9a9a9a'], Lg = ['#6b4a2b', '#5e3f24']; g.box(0, 0, 0, 10, .5, 9, '#6aa850');
    for (let y = 0; y < 5; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) { if (Math.abs(x) !== 3 && Math.abs(z) !== 3) continue; const corner = Math.abs(x) === 3 && Math.abs(z) === 3, door = z === 3 && x === 0 && y < 2, glass = y === 2 && ((Math.abs(z) === 3 && Math.abs(x) === 1) || (Math.abs(x) === 3 && Math.abs(z) === 1)); if (door) continue; if (glass) { w.box(x, .5 + y, z, .94, .94, .94, '#000'); continue; } const c = corner ? Lg[Math.floor(r() * 2)] : y === 0 ? St[Math.floor(r() * 3)] : P[Math.floor(r() * 3)]; g.box(x, .5 + y, z, S, S, S, c); }
    for (let lay = 0; lay < 3; lay++) { const q = 4 - lay; for (let x = -q; x <= q; x++) for (let z = -q; z <= q; z++) if (Math.max(Math.abs(x), Math.abs(z)) === q || lay === 2) g.box(x, 5.5 + lay, z, S, S, S, St[Math.floor(r() * 3)]); } g.box(0, .5, 3, .96, 2, .2, '#7a5230');
    for (let y = 0; y < 4; y++) g.box(5.4, .5 + y, 3, S, S, S, Lg[y % 2]); for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 0; y < 2; y++) g.box(5.4 + x, 4.5 + y, 3 + z, S, S, S, ['#4f8a44', '#5f9a4a'][Math.floor(r() * 2)]);
  } else if (K === 'tank') { // a home in a tank, windows in the turret
    const o = '#5e6b3c', d = '#4a5530', t = '#2c2e2a'; for (const s of [-1, 1]) { g.box(s * 3.1, .1, 0, 1.7, 1.7, 9.4, t); for (let i = 0; i < 6; i++) g.add(new THREE.CylinderGeometry(.62, .62, 1.76, 10).rotateZ(Math.PI / 2), '#51544c', s * 3.1, .9, -3.5 + i * 1.4); } g.box(0, 1.4, 0, 5.2, 1.7, 8.8, o); g.box(0, 3.1, -.3, 6.4, .3, 8.4, d); g.add(new THREE.CylinderGeometry(2.3, 2.7, 1.9, 14), o, 0, 4.3, -.6); g.add(new THREE.CylinderGeometry(.7, .8, .5, 10), d, -.7, 5.5, -.6); g.box(0, 3.95, 1.9, .5, .5, 6.6, d); g.box(0, 3.85, 5.2, .7, .7, .9, t); for (const a of [-.9, 0, .9]) w.box(Math.sin(a) * 2.5, 4.05, -.6 + Math.cos(a) * 2.5, .8, .8, .1, '#000'); g.box(0, .1, -4.5, 1.2, 2.8, .1, '#3a3f30');
  } else if (K === 'skyscraper') {
    g.box(0, 0, 0, 7.4, 2, 7.4, '#3a4654'); g.box(0, 2, 0, 6.4, 27, 6.4, '#8ea6b8'); g.box(0, 29, 0, 4.6, 3, 4.6, '#6f8799'); g.box(0, 32, 0, .3, 5, .3, '#d8352b'); g.box(0, 0, 3.72, 2.4, 1.8, .1, '#16202a');
    wins(0, 3.24, 6, 4, 3, 13, 2, .95, 1.3); for (let j = 0; j < 13; j++) for (let i = 0; i < 4; i++) w.box(3.24, 3 + j * 2, -2.25 + i * 1.5, .1, 1.3, .95, '#000');
  } else if (K === 'lighthouse') {
    for (let y = 0; y < 16; y += 4) g.add(new THREE.CylinderGeometry(2.2 - y * .05, 2.4 - y * .05, 4, 12), y % 8 ? '#f3f1ea' : '#d8352b', 0, y + 2, 0);
    g.add(new THREE.CylinderGeometry(1.7, 1.7, .3, 12), '#23252b', 0, 16.2, 0); w.box(0, 16.4, 0, 1.8, 1.5, 1.8, '#000'); g.add(new THREE.ConeGeometry(1.6, 1.4, 12), '#23252b', 0, 18.5, 0); g.box(0, 0, 2.3, 1.2, 2.2, .3, '#4f2f1c'); w.box(0, 8, 2.05, .8, 1, .1, '#000');
  } else if (K === 'pyramid') {
    g.add(new THREE.ConeGeometry(6.4, 7.6, 4).rotateY(Math.PI / 4), '#d9bd7c', 0, 3.8, 0); g.box(0, 0, 4.7, 1.5, 2.2, .1, '#4f2f1c'); for (let i = 0; i < 4; i++) g.box(0, .9 + i * 1.5, 0, 9 - i * 2.1, .05, 9 - i * 2.1, '#c7a862');
  } else if (K === 'bus') { // Oscar's pink double-decker house
    const c = h.tint || '#e47ab0', dk = shade(c, .72), L = 9.4, wd = 3.3, x0 = -1.3, x1 = x0 + L / 2, x2 = x0 - L / 2; g.box(x0, .8, 0, L, 2.2, wd, c); g.box(x0, 3, 0, L + .05, .2, wd + .05, '#f3f1ea'); g.box(x0 - .1, 3.2, 0, L - .2, 2, wd, c); g.box(x0 - .1, 5.2, 0, L - .1, .16, wd + .1, dk); g.box(x1 + .08, .8, 0, .24, 1.1, wd - .2, dk);
    for (const x of [x0 - 2.9, x0 + 2.9]) for (const z of [-1, 1]) { g.add(new THREE.CylinderGeometry(.86, .86, .5, 14).rotateX(Math.PI / 2), '#191a1a', x, .86, z * (wd / 2 - .1)); g.add(new THREE.CylinderGeometry(.42, .42, .56, 10).rotateX(Math.PI / 2), '#d7d9d6', x, .86, z * (wd / 2 - .1)); g.box(x, 1.72, z * (wd / 2 + .02), 2, .1, .1, dk); }
    for (let i = 0; i < 5; i++) { w.box(x0 - 3.3 + i * 1.65, 3.7, wd / 2 + .02, 1.25, 1.05, .1, '#000'); if (i !== 2) w.box(x0 - 3.3 + i * 1.65, 2, wd / 2 + .02, 1.25, .75, .1, '#000'); } g.box(x0, .34, wd / 2 + .03, 1.3, 2.5, .1, '#3b2a1c'); w.box(x1 + .2, 1.95, 0, .1, .95, wd - .5, '#000'); w.box(x1 + .02, 3.7, 0, .1, 1, wd - .5, '#000'); w.box(x2 - .04, 3.7, 0, .1, 1, wd - .5, '#000'); for (const z of [-1.2, 1.2]) g.box(x1 + .22, 1.05, z, .08, .34, .46, '#fff8d8'); plate(h, x0 - .1, 5.05, wd / 2 + .12, 'OSCAR', 3.4); g.box(x0, .02, 3, 1.5, .14, 2.4, '#c6bda9');
  } else if (K === 'burger') { // a giant burger you can live in: the bun is the roof, the door is in the bottom bun
    const bun = '#d9913f', dark = '#b56f28', x = 0; g.add(new THREE.CylinderGeometry(4.3, 4.1, 2.5, 24), dark, x, 1.25, 0); g.add(new THREE.CylinderGeometry(4.35, 4.35, .3, 24), '#f2c23e', x, 2.65, 0); g.add(new THREE.CylinderGeometry(4.5, 4.5, .85, 24), '#5a3320', x, 3.2, 0); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.box(x + Math.cos(a) * 3.8, 2.5, Math.sin(a) * 3.8, 1.5, .34, 1.5, '#f2c23e'); }
    g.add(new THREE.CylinderGeometry(4.65, 4.65, .24, 24), '#c8352b', x, 3.75, 0); g.add(new THREE.CylinderGeometry(4.75, 4.6, .26, 12), '#5fa83c', x, 4, 0); const dome = new THREE.SphereGeometry(4.4, 24, 12, 0, 6.283, 0, 1.57); g.add(dome, bun, x, 4.1, 0, 1, .72, 1); for (let i = 0; i < 26; i++) { const a = i * 2.4, r0 = .5 + (i % 7) * .55, y = 4.1 + Math.sqrt(Math.max(.2, 19 - r0 * r0)) * .72; g.box(x + Math.cos(a) * r0, y, Math.sin(a) * r0, .34, .1, .16, '#f6e3b4'); }
    g.box(.3, 0, 3.95, 1.4, 2.2, .3, '#5a3320'); w.box(-2.4, .9, 3.5, 1.5, 1.2, .2, '#000'); w.box(2.8, .9, 3.2, 1.3, 1.2, .2, '#000'); plate(h, 0, 2.75, 4.55, 'BURGER HOUSE', 5);
  } else if (K === 'bank') { // a stone bank with columns and a gold roof line
    const st = '#e6e1d4', dk = '#bdb6a4', gold = '#d6a93a'; g.box(0, 0, 0, 9.4, .5, 7.6, dk); g.box(0, .5, 0, 8.8, .4, 7, st); g.box(0, .9, -.8, 8, 4.6, 5.2, st); for (let i = 0; i < 6; i++) g.add(new THREE.CylinderGeometry(.3, .36, 4.5, 12), '#f3efe4', -3.6 + i * 1.44, 3.15, 2.7); g.box(0, 5.4, .6, 8.8, .6, 6.6, dk); g.box(0, 6, .6, 9, .16, 6.8, gold); for (let i = 0; i < 6; i++) g.box(0, 6.16 + i * .28, .6 + 0, 8.6 - i * 1.45, .28, 6.4, i % 2 ? st : dk); g.box(.0, .9, 1.84, 1.8, 3, .12, '#3b2a1c'); g.box(0, 2.2, 1.92, .08, 1.2, .06, gold); for (const s of [-1, 1]) w.box(s * 2.7, 1.9, 1.86, 1.2, 2, .1, '#000'); plate(h, 0, 5.25, 3.95, 'BANK', 3.4); g.box(0, .9, 3.5, 3, .22, .9, dk); g.box(0, .68, 3.9, 3.6, .22, .9, dk);
  } else if (K === 'cathouse') { // Luna's house: a big sitting cat, the door is in her chest and the eyes are lit windows
    const c = '#e8a04a', st = '#c97a26', wh = '#fbeedc', x = -.6; g.add(new THREE.SphereGeometry(3.5, 18, 12), c, x, 3.1, -.6, 1, .95, 1.1); g.add(new THREE.SphereGeometry(2.1, 14, 10), wh, x, 2.5, 1.4, 1, 1.1, .85); g.box(x, .02, -.6, 7.2, .3, 7.4, shade(c, .9));
    for (const s of [-1, 1]) { g.add(new THREE.SphereGeometry(.95, 12, 8), c, x + s * 1.7, .72, 3.2, 1, .78, 1.3); for (const t of [-.3, 0, .3]) g.box(x + s * 1.7 + t, .28, 4.26, .17, .3, .1, st); g.add(new THREE.SphereGeometry(1.4, 12, 8), st, x + s * 2.9, 1.5, .2, .8, 1.15, 1.3); }
    g.add(new THREE.SphereGeometry(2.55, 18, 12), c, x, 7.5, .2, 1.08, .95, 1); g.add(new THREE.SphereGeometry(1.05, 12, 8), wh, x, 6.75, 2.2, 1.15, .72, .75);
    for (const s of [-1, 1]) { g.add(new THREE.ConeGeometry(.92, 1.95, 4).rotateY(Math.PI / 4), c, x + s * 1.65, 10.1, .1); g.add(new THREE.ConeGeometry(.5, 1.15, 4).rotateY(Math.PI / 4), '#f4a7b5', x + s * 1.65, 9.85, .42); w.box(x + s * 1.05, 7.65, 2.5, .95, 1.05, .1, '#000'); g.box(x + s * 1.05, 7.65, 2.58, .24, .9, .06, '#17181c'); for (const t of [-.25, 0, .25]) g.box(x + s * 2.1, 6.95 + t * .9, 2.42, 1.3, .05, .05, '#2a1b12'); }
    g.add(new THREE.ConeGeometry(.22, .3, 4).rotateX(Math.PI), '#e8748f', x, 7, 2.92); g.box(x, 6.62, 2.86, .08, .28, .06, '#2a1b12'); g.box(x, 6.46, 2.82, .7, .08, .06, '#2a1b12');
    for (const a of [-1.1, -.55, 0, .55, 1.1]) g.box(x + a, 9.25 - Math.abs(a) * .25, 1.5 - Math.abs(a) * .4, .3, .9, .5, st); for (const y of [2.4, 3.9, 5.2]) for (const s of [-1, 1]) g.box(x + s * 3.2, y, -.4, .6, .36, 1.6, st);
    { const R = 2.5; for (let i = 0; i < 16; i++) { const a = i / 15 * 3.6 - .4, tx = 3.3 + Math.cos(a) * R * .7, ty = 1 + Math.sin(a) * R, q = i > 11 ? st : c; g.add(new THREE.SphereGeometry(.56 - i * .012, 9, 6), q, x + tx - .4, ty + 1.1, -3.1); } }
    g.box(x, .2, 3.55, 1.5, 2.55, .12, '#7a3a24'); g.add(new THREE.CylinderGeometry(.75, .75, .12, 16).rotateX(Math.PI / 2), '#7a3a24', x, 2.75, 3.55); g.box(x + .5, 1.3, 3.65, .12, .12, .08, '#f6c81e'); g.box(x, 3.3, 3.45, 1.9, .34, .1, '#d6b13c'); plate(h, x, 3.5, 3.6, 'LUNA', 1.7); g.box(x, .02, 5.1, 1.6, .06, 2.6, '#c6bda9');
  } else if (K === 'church') { // Mathew's church, with his name over the door
    const wc = '#e9e3d4', rf = '#7f3b2f', x = -1.3; g.box(x, 0, -1.2, 6, 4.6, 9.4, wc); g.gable(x, 0, -1.2, 6, 4.6, 2.6, 9.4, .3, rf, wc); g.box(x, 0, 4.2, 3, 8.6, 3, wc); g.add(new THREE.ConeGeometry(2.3, 3.6, 4).rotateY(Math.PI / 4), '#4f7a6a', x, 10.4, 4.2); g.box(x, 12.2, 4.2, .2, 1.6, .2, '#d6b13c'); g.box(x, 12.9, 4.2, .9, .2, .2, '#d6b13c');
    g.box(x, 0, 5.72, 1.5, 2.6, .1, '#5a3a24'); w.box(x, 5.4, 5.72, 1, 1.6, .1, '#000'); for (const z of [-4.2, -2.2, -.2, 1.8]) for (const s of [-1, 1]) w.box(x + s * 3.02, 1.5, z, .1, 2, .9, '#000'); plate(h, x, 3.2, 5.8, 'MATHEW', 2.8); g.box(x, .02, 6.9, 1.6, .06, 2.2, '#c6bda9');
  } else if (K === 'banana') { // a giant half-peeled banana you can live in
    const V = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], unit: a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); } };
    const frame = (P, t) => { const T = V.unit(V.sub(P(Math.min(1, t + .01)), P(Math.max(0, t - .01)))), Bn = V.unit(V.cross(T, Math.abs(T[2]) > .9 ? [1, 0, 0] : [0, 0, 1])); return { T, N: V.unit(V.cross(Bn, T)), B: Bn }; };
    const tube = (P, R, rings, sides, col) => { // swept skin, sides shaded one by one so the banana's ridges read
      const ring = i => { const t = i / rings, c = P(t), { N, B } = frame(P, t), rr = R(t); return Array.from({ length: sides }, (_, j) => { const a = j / sides * 6.28318, ca = Math.cos(a) * rr, sa = Math.sin(a) * rr; return [c[0] + N[0] * ca + B[0] * sa, c[1] + N[1] * ca + B[1] * sa, c[2] + N[2] * ca + B[2] * sa]; }); };
      let A = ring(0); for (let i = 0; i < rings; i++) { const Z = ring(i + 1); for (let j = 0; j < sides; j++) { const k = (j + 1) % sides; g.quad(A[j], A[k], Z[k], Z[j], rgb(col(i, j))); } A = Z; }
    };
    const skin = (i, j) => { const q = r(); return q < .012 ? '#7a5a26' : q < .04 ? '#d9a832' : j % 4 === 0 ? '#f2c62c' : j % 4 === 2 ? '#fff07c' : '#ffe052'; };
    const mini = (x, y, z, len, yaw, arch = .32, rad = .24) => { const cy = Math.cos(yaw), sy = Math.sin(yaw), P = t => { const d = t - .5; return [x + cy * len * d, y + len * arch * (1 - 4 * d * d), z + sy * len * d]; }; tube(P, t => rad * (.25 + .75 * Math.sin(Math.PI * Math.min(1, t * .94 + .03))), 7, 5, (i, j) => i === 0 ? '#4d3218' : i === 6 ? '#7a8f35' : j % 2 ? '#f6cf38' : '#e3b52a'); };
    const Pb = t => [2.5 * t * t - .4 * t, 16.5 * t, 0], Rb = t => 3.15 * Math.min(1, .86 + t * 3) * (t > .6 ? 1 - .94 * ((t - .6) / .4) ** 2.2 : 1), T0 = .52;
    g.add(new THREE.CylinderGeometry(3.9, 4.3, .5, 16), '#4d3218', 0, .25, 0); g.add(new THREE.CylinderGeometry(3.45, 3.6, .3, 16), '#7a5230', 0, .62, 0);
    tube(t => { const c = Pb(t * T0); return [c[0], c[1] + .6, c[2]]; }, t => Rb(t * T0), 18, 28, skin);
    tube(t => { const c = Pb(T0 - .02 + t * (1 - T0 + .02)); return [c[0], c[1] + .6, c[2]]; }, t => Rb(T0 - .02 + t * (1 - T0 + .02)) * (t > .97 ? .55 : .84), 13, 18, (i, j) => i === 12 ? '#5b4326' : (i + j) % 7 === 0 ? '#f0e2b4' : j % 2 ? '#fbf3d2' : '#f6ebc2');
    const top = Pb(T0), yp = top[1] + .6, rp = Rb(T0), F = frame(Pb, T0);
    for (let k = 0; k < 5; k++) { // five strips of peel folded down over the house
      const a = (k + .35) / 5 * 6.28318, dir = V.unit([F.N[0] * Math.cos(a) + F.B[0] * Math.sin(a), F.N[1] * Math.cos(a) + F.B[1] * Math.sin(a), F.N[2] * Math.cos(a) + F.B[2] * Math.sin(a)]), side = V.unit(V.cross(F.T, dir)), rho = 1.7, n = 10;
      const pt = (s, u) => { const ph = s * 3.05, out = rho * (1 - Math.cos(ph)) + 1.5 * s * s, up = rho * Math.sin(ph) - 1.9 * s * s, wd = 1.5 * (1 - s ** 2.4) + .06; return [top[0] + dir[0] * (rp + out) + F.T[0] * up + side[0] * wd * u, yp + dir[1] * (rp + out) + F.T[1] * up + side[1] * wd * u, top[2] + dir[2] * (rp + out) + F.T[2] * up + side[2] * wd * u]; };
      for (let i = 0; i < n; i++) for (const [u0, u1] of [[-1, -.34], [-.34, .34], [.34, 1]]) {
        const a0 = pt(i / n, u0), a1 = pt(i / n, u1), b0 = pt((i + 1) / n, u0), b1 = pt((i + 1) / n, u1), tip = i === n - 1, q = r();
        g.quad(a0, b0, b1, a1, rgb(tip ? '#5b3f1e' : q < .02 ? '#a9812c' : u0 === -.34 ? '#fff07c' : '#fbd63c'));
        const off = v => [v[0] - dir[0] * .07, v[1] + .07, v[2] - dir[2] * .07]; g.quad(off(a1), off(b1), off(b0), off(a0), rgb(tip ? '#5b3f1e' : u0 === -.34 ? '#fbf3d2' : '#f1e4b0'));
      }
    }
    // front door, windows and balcony set into the skin
    g.box(0, .75, 3.08, 2, 3, .28, '#5a3a22'); g.box(0, .75, 3.2, 1.45, 2.55, .22, '#b3582a'); g.box(.48, 1.9, 3.34, .13, .13, .13, '#f0c94a'); for (const y of [1.4, 2.5]) g.box(0, y, 3.32, 1.05, .1, .05, '#8a4120');
    g.box(0, .5, 3.95, 2.5, .25, 1.4, '#7a5230'); g.box(0, .25, 4.5, 3, .25, 1.2, '#8f6a44');
    for (let i = 0; i < 5; i++) mini(-1.05 + i * .52, 3.85 + Math.abs(i - 2) * -.1, 3.5, 1.7, 1.57, .24, .2); plate(h, 0, 4.75, 3.25, 'BANANA VILLA', 3.9);
    for (const x of [-2, 2]) { const z = 2.42; g.box(x, 2, z, 1.34, 1.5, .18, '#5a3a22'); w.box(x, 2.1, z + .11, 1.06, 1.22, .1, '#000'); g.box(x, 2.1, z + .17, .08, 1.22, .05, '#5a3a22'); }
    for (const s of [-1, 1]) { const x = s * 3.2; g.box(x, 2.4, .2, .18, 1.6, 1.4, '#5a3a22'); w.box(x + s * .1, 2.5, .2, .1, 1.3, 1.1, '#000'); }
    const by = 6.2, bx = Pb(by / 16.5)[0]; g.add(new THREE.CylinderGeometry(4.1, 3.9, .3, 16), '#7a5230', bx, by, 0); for (let i = 0; i < 18; i++) { if (i >= 3 && i <= 5) continue; const a = i / 18 * 6.28318; g.box(bx + Math.cos(a) * 3.95, by + .15, Math.sin(a) * 3.95, .12, .85, .12, '#5a3a22'); }
    g.add(new THREE.TorusGeometry(3.95, .07, 5, 22).rotateX(Math.PI / 2), '#5a3a22', bx, by + 1, 0);
    for (const y of [7.5]) { g.box(bx, y, 2.98, 1.5, 1.7, .18, '#5a3a22'); w.box(bx, y + .1, 3.08, 1.2, 1.4, .1, '#000'); } g.box(bx, by + .15, 3.05, 1, 2.1, .16, '#b3582a');
    // monkey on the balcony, eating a banana
    const mx = bx + 2.2, mz = 2.5, my = by + .15, fur = '#6a4326', face = '#e6c49a';
    g.add(new THREE.SphereGeometry(.58, 8, 6), fur, mx, my + .55, mz, 1, 1.12, .92); g.add(new THREE.SphereGeometry(.44, 8, 6), fur, mx, my + 1.4, mz + .08); g.add(new THREE.SphereGeometry(.29, 7, 5), face, mx, my + 1.34, mz + .34, 1, .82, .7);
    for (const s of [-1, 1]) { g.add(new THREE.SphereGeometry(.17, 6, 5), face, mx + s * .46, my + 1.5, mz + .08, .6, 1, 1); g.box(mx + s * .14, my + 1.5, mz + .47, .08, .08, .05, '#14201b'); g.box(mx + s * .62, my + .5, mz + .24, .2, .7, .2, fur); g.box(mx + s * .3, my, mz + .34, .26, .26, .62, fur); }
    mini(mx - .1, my + .75, mz + .64, 1.05, .35, .3, .13);
    for (let i = 0; i < 7; i++) g.box(mx - .5 - i * .05, my + .15 + Math.sin(i * .9) * .13, mz - .55 - i * .13, .1, .1, .16, fur);
    // palm tree with a hanging bunch, a crate and a banana fence
    const px = -4.6, pz = 3.2; for (let i = 0; i < 8; i++) g.add(new THREE.CylinderGeometry(.2 - i * .01, .27 - i * .01, .85, 7), i % 2 ? '#7a5a3a' : '#8c6a46', px + i * i * .012, .42 + i * .82, pz);
    const palm = [px + .6, 6.9, pz]; for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28318, cx = Math.cos(a), cz = Math.sin(a); for (let i = 0; i < 6; i++) { const s0 = i / 6, s1 = (i + 1) / 6, L = 3.4, wd = sn => .52 * Math.sin(Math.PI * Math.min(1, sn + .08)), yf = sn => palm[1] + 1.3 * sn - 3 * sn * sn; const A = [palm[0] + cx * L * s0 - cz * wd(s0), yf(s0), palm[2] + cz * L * s0 + cx * wd(s0)], B = [palm[0] + cx * L * s0 + cz * wd(s0), yf(s0), palm[2] + cz * L * s0 - cx * wd(s0)], C = [palm[0] + cx * L * s1 + cz * wd(s1), yf(s1), palm[2] + cz * L * s1 - cx * wd(s1)], D = [palm[0] + cx * L * s1 - cz * wd(s1), yf(s1), palm[2] + cz * L * s1 + cx * wd(s1)]; const c = rgb(i % 2 ? '#3f8a3a' : '#4fa444'); g.quad(A, B, C, D, c); g.quad(D, C, B, A, c); } }
    for (let i = 0; i < 6; i++) mini(palm[0] + .5, 5.35 + (i % 3) * .3, palm[2] - .28 + (i % 3) * .3, 1.15, 1.57 + i * .12, -.26, .19);
    g.box(4.3, .05, 3.6, 1.7, .95, 1.25, '#a97c49'); for (const y of [.3, .72]) g.box(4.3, y, 4.24, 1.74, .13, .04, '#7a5a34'); for (let i = 0; i < 6; i++) mini(3.72 + (i % 3) * .58, 1.02 + (i > 2 ? .1 : 0), 3.3 + (i > 2 ? .55 : 0), 1, .15 + i * .2, .24, .19);
    for (const x of [-5.5, -4, -2.6, 2.6, 4, 5.5]) { mini(x, .18, 5.8, 1.5, 0, .55, .25); g.box(x - .75, 0, 5.8, .15, .55, .15, '#7a5230'); g.box(x + .75, 0, 5.8, .15, .55, .15, '#7a5230'); }
    for (let i = 0; i < 4; i++) g.box(0, .04, 5.4 + i * .3 - .3, 1.3 - (i % 2) * .2, .07, .22, i % 2 ? '#f1c62e' : '#d9b45a');
  } else if (K === 'mansion' || K === 'huge' || K === 'biggest' || K === 'goldmansion' || K === 'manor') { // manor: the same big house, sized for one lot so an existing resident's neighbours never move
    const s = K === 'biggest' ? 1.2 : K === 'huge' ? 1.1 : K === 'manor' ? .8 : 1, wall = K === 'goldmansion' ? '#e8c04a' : h.tint || ['#f3efe4', '#e7d7b3', '#dfe3dc'][Math.floor(r() * 3)], roof = K === 'goldmansion' ? '#b8891d' : ['#3c5c50', '#4a4f58', '#7f3b2f', '#39495f'][Math.floor(r() * 4)];
    const W = 15 * s, Dp = 7.6, H = (K === 'biggest' ? 9.4 : 7), cx = yard;
    g.box(cx, 0, -.4, W, H, Dp, wall); g.gable(cx, 0, -.4, W, H, 2.8, Dp, .5, roof, wall); g.box(cx, 0, 3.2, 6, H + 1, 1, wall); g.gable(cx, H + 1 - .4, 3.2, 6, .4, 1.8, 1, .3, roof, wall);
    for (const x of [-2.5, -.85, .85, 2.5]) g.add(new THREE.CylinderGeometry(.26, .3, H - .4, 8), '#f8f6f0', cx + x, (H - .4) / 2, 4.2);
    g.box(cx, 0, 3.72, 1.6, 2.7, .1, '#3b2a1c'); for (const y of [1.1, 3.9]) for (const x of [-W / 2 + 1.6, -W / 2 + 3.6, W / 2 - 3.6, W / 2 - 1.6]) win(g, w, cx + x, y, 3.36, 1.1, 1.5); if (K === 'biggest') for (const x of [-W / 2 + 1.6, -W / 2 + 3.6, W / 2 - 3.6, W / 2 - 1.6]) win(g, w, cx + x, 6.8, 3.36, 1.1, 1.5);
    for (const x of [-W / 2 + 2, W / 2 - 2]) g.box(cx + x, H - 1, -1.8, 1, 5, 1, '#8f8e88'); g.box(cx, 0, 5.4, 5, .5, 1.8, '#c9c2b4'); g.box(cx, .36, 5.4, 4.3, .2, 1.3, '#48bcd0');
  } else if (K === 'sphere') {
    g.add(new THREE.SphereGeometry(4.4, 12, 8), '#9ac7d8', 0, 4, 0); g.add(new THREE.CylinderGeometry(4.5, 4.5, .6, 12), '#6f8ea0', 0, .3, 0); g.box(0, 0, 4.1, 1.3, 2.2, .7, '#3a5564'); w.box(-1.8, 3.6, 3.82, 1.1, 1.1, .1, '#000'); w.box(1.8, 3.6, 3.82, 1.1, 1.1, .1, '#000');
  }
}
function wishes(g, w, h, W, D, f, roof, acc) { // what each resident asked for in the comments
  const b = h.yard ? h.yard * h.flip : 0, bush = (x, z, s = 1, c = '#5f9a4a') => { g.box(x, 0, z, .3 * s, 1.5 * s, .3 * s, '#5e3b26'); g.add(CROWN, c, x, 2.4 * s, z, s, s, s); };
  if (h.wish === 'farm') {
    g.add(new THREE.CylinderGeometry(1, 1, 5.6, 8), '#c9c3b3', W / 2 + 1, 2.8, -D / 4); g.add(new THREE.ConeGeometry(1.25, 1.2, 8), '#8c2e27', W / 2 + 1, 6.2, -D / 4);
    g.box(0, 0, -D / 2 - 2.2, 4.6, 2.1, 2.4, '#a33a2c'); g.gable(0, 0, -D / 2 - 2.2, 4.6, 2.1, 1.2, 2.4, .2, '#5b4a3f', '#a33a2c'); g.box(0, 0, -D / 2 - .96, 1.3, 1.6, .08, '#f1ece0');
    for (const [x, z] of [[-W / 2 + .6, f + 2.6], [-W / 2 + 2.2, f + 3]]) g.add(new THREE.CylinderGeometry(.55, .55, .9, 8), '#d6b95e', x, .55, z, 1, 1, 1);
    g.box(W / 2 - .8, .3, f + 2.5, 1.9, .9, 1, '#c8352b'); g.box(W / 2 - 1.3, 1.2, f + 2.5, .9, .7, .9, '#3a6a86'); for (const x of [W / 2 - 1.5, W / 2 - .1]) for (const z of [f + 1.95, f + 3.05]) g.box(x, 0, z, .55, .55, .22, '#23262a');
    for (const [x, z] of [[-1.6, f + 1.2], [-2.4, f + 2], [1.6, f + 1.7]]) { g.box(x, .16, z, .34, .26, .42, '#f3f1ea'); g.box(x, .36, z + .2, .16, .2, .16, '#d8352b'); }
    for (let i = 0; i < 12; i++) if (i !== 6) g.box(-5.6 + i * 1, 0, f + 3.9, .13, .75, .13, '#8a6a44'); g.box(0, .5, f + 3.9, 11.4, .09, .09, '#8a6a44');
  }
  if (h.wish === 'luxury') {
    for (const x of [-W / 2 + .4, -W / 6, W / 6, W / 2 - .4]) g.add(new THREE.CylinderGeometry(.22, .25, 3.4, 8), '#f3f1ea', x, 1.7, f + 1.3);
    g.box(0, 3.4, f + .9, W + .5, .32, 2.2, '#f3f1ea'); g.box(0, 3.72, f + .9, W + .1, .12, 1.8, '#d6b13c');
    g.box(0, 0, -D / 2 - 1.5, 6.4, .5, 2.8, '#d9d3c4'); g.box(0, .36, -D / 2 - 1.5, 5.6, .18, 2.1, '#48bcd0');
  }
  if (h.wish === 'gym') {
    g.box(0, 0, -D / 2 - 1.5, 6.6, .5, 2.8, '#d9d3c4'); g.box(0, .36, -D / 2 - 1.5, 5.8, .18, 2.1, '#48bcd0');
    plate(h, W / 2 + 1.6, 3.1, (D - 2.2) / 2 - .4, 'GYM', 2.8);
  }
  if (h.wish === 'cat') { // a giant cat sits on the roof
    const y = 6.2, c = '#d9892f'; g.box(0, y, -.5, 3, 2.1, 4, c); g.box(0, y + 1.5, 2, 2.2, 2, 2, c); for (const x of [-.8, .8]) { g.add(new THREE.ConeGeometry(.5, 1, 4), c, x, y + 4, 2); g.box(x, y + 2.3, 3.02, .36, .36, .06, '#14201b'); } g.box(0, y + 1.8, 3.02, .4, .2, .06, '#e47ab0'); g.box(0, y + 1.8, -2.9, .5, 3, .5, c);
    for (let i = 0; i < 3; i++) g.box(0, y + .3 + i * .7, -.5, 3.04, .24, 4.04, '#b86a1e');
  }
  if (h.wish === 'octopus') { // a giant octopus hugging the roof
    const y = 8.2, c = '#a24fd0', d2 = '#7f3ba8'; g.add(new THREE.SphereGeometry(2.9, 14, 10), c, 0, y + 1.8, 0, 1, 1.2, 1); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + .39; for (let k = 0; k < 9; k++) { const r = 2 + k * .62, yy = y - .2 - k * k * .13 + Math.sin(k) * .15, s = .8 - k * .05; g.box(Math.sin(a) * r, yy, Math.cos(a) * r, s, s, s, k % 2 ? c : d2); } }
    for (const x of [-.75, .75]) { g.add(new THREE.SphereGeometry(.6, 10, 8), '#ffffff', x * 1.3, y + 2.5, 2.4); g.add(new THREE.SphereGeometry(.3, 8, 6), '#17181c', x * 1.3, y + 2.5, 2.92); }
  }
  if (h.wish === 'plane') { // a small passenger plane landed on the roof
    const y = 7.2, c = '#f4f5f6', tr = '#2f6fc8'; g.box(0, y - .1, 0, 6.4, .14, 2.6, '#5c6066'); for (const s of [-1, 1]) g.box(s * 2.8, 4, 0, .22, y - 4, 2.2, '#5c6066'); g.add(new THREE.CylinderGeometry(.82, .82, 7, 14).rotateZ(Math.PI / 2), c, 0, y + .9, 0); g.add(new THREE.SphereGeometry(.82, 14, 10), c, 3.5, y + .9, 0, 1.5, 1, 1); g.add(new THREE.ConeGeometry(.82, 2.2, 14).rotateZ(Math.PI / 2), c, -4.5, y + .9, 0); g.box(0, y + .42, 0, 7, .12, 1.5, tr); g.box(.2, y + .72, 0, 1.7, .16, 8.4, c); for (const s of [-1, 1]) { g.box(.2, y + .46, s * 2.5, .9, .5, .5, tr); g.box(-4.4, y + 1.1, s * .9, .8, .1, 1.4, c); } g.box(-4.5, y + 1.3, 0, 1, 1.5, .14, tr); for (let i = 0; i < 6; i++) for (const s of [-1, 1]) g.box(-2.4 + i * .95, y + 1.1, s * .81, .4, .34, .04, '#27323a'); g.box(3.9, y + 1.26, 0, .5, .36, 1.1, '#27323a');
  }
  if (h.wish === 'carroof') { // an orange supercar parked on the roof
    const y = 7.5, c = '#ee6c12'; g.box(0, y - .1, 0, 5.6, .14, 3, '#5c6066'); for (const s of [-1, 1]) g.box(s * 2.4, 4, 0, .22, y - 4, 2.4, '#5c6066'); for (const x of [-1.45, 1.45]) for (const z of [-1, 1]) g.add(new THREE.CylinderGeometry(.46, .46, .36, 12).rotateX(Math.PI / 2), '#191a1a', x, y + .46, z * 1.02); g.box(0, y + .36, 0, 4.7, .46, 2.1, c); g.box(.3, y + .82, 0, 2.2, .44, 1.74, '#27323a'); g.box(.2, y + 1.26, 0, 1.5, .08, 1.5, c); g.box(2.05, y + .78, 0, .9, .1, 1.9, c); g.box(-2.2, y + 1.1, 0, .46, .08, 2.1, '#191a1a'); for (const z of [-.8, .8]) { g.box(-2.2, y + .8, z, .12, .32, .12, '#191a1a'); g.box(2.38, y + .55, z * .85, .05, .13, .4, '#fff8d8'); }
  }
  if (h.wish === 'garden') { // flowers at the front, a vegetable patch behind, a hedge around
    const F = ['#d8352b', '#f6c81e', '#e47ab0', '#f3f1ea', '#7a5bd6']; for (const [x0, z0] of [[-5.2, f + .6], [-5.2, f + 2.1]]) { g.box(x0 + 1.5, 0, z0, 3.4, .32, 1.2, '#5a3f28'); for (let i = 0; i < 8; i++) { const x = x0 + .1 + i * .42, y = .32; g.box(x, y, z0 + (i % 2 ? .26 : -.26), .12, .55, .12, '#3f7a3e'); g.box(x, y + .55, z0 + (i % 2 ? .26 : -.26), .4, .34, .4, F[i % 5]); } } for (let x = -6; x < 3.2; x += 1) if (Math.abs(x + 1.1) > 1.1) g.box(x, 0, f + 3.3, .96, .75, .5, '#3f7a3e');
    for (let r = 0; r < 3; r++) { g.box(-2.6 + r * 2.6, 0, -D / 2 - 2, 1.9, .24, 2.8, '#5a3f28'); for (let i = 0; i < 5; i++) { g.box(-3.2 + r * 2.6, .24, -D / 2 - 3 + i * .5, .18, .3, .18, '#4f9a45'); g.box(-2 + r * 2.6, .24, -D / 2 - 3 + i * .5, .18, .3, .18, '#e0832e'); } } for (const s of [-1, 1]) bush(s * 4.8, -D / 2 - 2, .8, '#4f8f45');
  }
  if (h.wish === 'pool') { g.box(0, 0, -D / 2 - 1.5, 6.2, .5, 2.7, '#d9d3c4'); g.box(0, .36, -D / 2 - 1.5, 5.4, .18, 2, '#48bcd0'); }
  if (h.wish === 'dragon') { const y = 6.2, c = '#3f8a4e'; g.box(0, y, -.5, 2.2, 1.5, 4.4, c); g.box(0, y + 1.1, 2.4, 1.3, 1.3, 1.7, c); g.add(new THREE.ConeGeometry(.3, .8, 4), '#e8e0c8', -.4, y + 2.7, 2.4); g.add(new THREE.ConeGeometry(.3, .8, 4), '#e8e0c8', .4, y + 2.7, 2.4); for (const a of [-1, 1]) g.box(a * 2.6, y + 1, -.6, 3.2, .16, 2.6, '#2f6f3e'); g.box(0, y + .6, -3.4, .7, .7, 2.2, c); g.box(0, y + 1.2, 3.34, .9, .24, .1, '#d8352b'); }
  if (h.wish === 'dachshund') { const x = 2.6, z = f + 2, c = '#7a4a22'; g.box(x, .45, z, .55, .45, 1.9, c); g.box(x, .75, z + 1.15, .5, .55, .6, c); g.box(x, .72, z + 1.65, .3, .28, .5, '#5e3818'); for (const s of [-1, 1]) { g.box(x + s * .33, .78, z + 1.1, .1, .55, .32, '#54310f'); for (const e of [-.75, .75]) g.box(x + s * .18, 0, z + e, .14, .46, .16, '#54310f'); } g.box(x, .75, z - 1.1, .1, .1, .6, c); }
  if (h.wish === 'kennel') { const x = 2.7, z = f + 1.6, c = '#c8352b'; g.box(x, 0, z, 2.3, 1.5, 2.3, c); g.gable(x, 0, z, 2.3, 1.5, .9, 2.3, .15, '#6e3a1e', c); g.box(x, 0, z + 1.17, .9, 1.1, .05, '#1a1411'); }
  if (h.wish === 'liberty') { const x = 2.8, z = f + 2.2, c = '#6fb3a0', e = '#5a9c8a'; g.box(x, 0, z, 2.2, .9, 2.2, '#b5b0a4'); g.box(x, .9, z, 1.5, .8, 1.5, '#a8a39a'); g.add(new THREE.CylinderGeometry(.34, .75, 3.4, 10), c, x, 3.4, z); g.add(new THREE.SphereGeometry(.42, 10, 8), c, x, 5.5, z); for (let i = 0; i < 7; i++) { const a = -1.2 + i * .4; g.add(new THREE.ConeGeometry(.08, .6, 5), e, x + Math.sin(a) * .42, 6.05, z + Math.cos(a) * .2); } g.box(x + .55, 4.5, z, .2, 2, .2, c); g.add(new THREE.CylinderGeometry(.16, .1, .3, 8), '#e9b23c', x + .55, 6.6, z); g.add(new THREE.ConeGeometry(.14, .4, 8), '#ffb23e', x + .55, 6.95, z); g.box(x - .5, 3.7, z + .25, .5, .7, .14, e); }
  if (h.wish === 'tub') { g.box(W / 2 + .2, 0, f + 2, 2.9, .75, 2.9, '#6b4a30'); g.box(W / 2 + .2, .6, f + 2, 2.3, .2, 2.3, '#62c8dc'); }
  if (h.wish === 'kojo') plate(h, 0, 2.4, f + .1, 'KOJO', 3);
  if (h.wish === 'pibble') { const x = 2.4, z = f + 1.9, c = '#8e8f96'; g.box(x, .42, z, .6, .5, 1.3, c); g.box(x, .72, z + .78, .55, .55, .6, c); for (const a of [-.2, .2]) for (const b of [-.5, .5]) g.box(x + a, 0, z + b, .16, .45, .16, c); g.box(x, .86, z - .75, .12, .12, .5, c); g.box(x, .74, z + 1.1, .3, .22, .08, '#f3f1ea'); }
  if (h.wish === 'football') { // a pitch on the lot next door
    const c = b; g.box(c, .03, 0, 11.6, .1, 9.4, '#3f8f42'); for (let i = 0; i < 6; i += 2) g.box(c - 4.8 + i * 1.92, .05, 0, 1.92, .1, 9.2, '#4aa04d');
    for (const [x, z, a, d] of [[c, 4.5, 11.2, .1], [c, -4.5, 11.2, .1], [c, 0, .1, 9.1], [c - 5.6, 0, .1, 9.1], [c + 5.6, 0, .1, 9.1], [c - 4.8, 0, 1.6, .08], [c + 4.8, 0, 1.6, .08]]) g.box(x, .1, z, a, .03, d, '#f3f1ea');
    for (const s of [-1, 1]) { const x = c + s * 5.6; g.box(x, 0, -1.3, .12, 1.5, .12, '#fff'); g.box(x, 0, 1.3, .12, 1.5, .12, '#fff'); g.box(x, 1.45, 0, .12, .12, 2.7, '#fff'); }
    g.add(new THREE.IcosahedronGeometry(.26, 0), '#f3f1ea', c + 1, .32, .6);
  }
  if (h.wish === 'shelter') { // Olive's: the home plus a shelter and a garden on the next lot
    const c = b; g.box(c, 0, -1.8, 9, 3.2, 5.6, '#e7d7b3'); g.gable(c, 0, -1.8, 9, 3.2, 2, 5.6, .5, '#7f3b2f', '#e7d7b3');
    g.box(c, 0, 1, 1.5, 2.2, .1, '#2f6f5b'); for (const x of [-3, 3]) w.box(c + x, 1.1, 1.04, 1.5, 1.1, .1, '#000');
    plate(h, c, 3.75, 1.1, "OLIVE'S", 4.6);
    g.box(c, .03, 4, 11, .08, 5, '#7fbb5e'); g.add(new THREE.CylinderGeometry(1.2, 1.2, .08, 12), '#48bcd0', c + 3.2, .12, 4.2);
    bush(c - 4, 3.4, 1.05); bush(c - 1.8, 5.4, .85, '#6fae55'); g.box(c + .6, .42, 5.4, 1.8, .13, .5, '#7a4f2e');
    for (let i = 0; i < 8; i++) g.box(c - 4.5 + i * 1.3, .3, 3 + (i % 2), .2, .2, .2, ['#d8352b', '#f6c81e', '#e47ab0'][i % 3]);
  }
  if (h.wish === 'river') { // a small modern home with a fishing pier
    const len = Math.abs(riverZ(h.x) - h.z) - 4; g.box(0, .34, -D / 2 - len / 2, 1.5, .16, len, '#8a6a44');
    for (let i = 0; i < Math.floor(len / 2.4); i++) for (const x of [-.7, .7]) g.box(x, -2.6, -D / 2 - 1.5 - i * 2.4, .2, 3, .2, '#5e3b26');
    const e = -D / 2 - len + .6; g.box(.2, .5, e, .5, .45, .5, '#2f6f5b'); g.box(.2, .9, e - .9, .06, .06, 2.2, '#3a2a1c'); g.box(.2, -.8, e - 2, .03, 1.7, .03, '#e8e8e4');
    g.box(1.8, -1.18, e + .6, 1.1, .34, 2.6, '#c8352b');
  }
}
const TURRET = new THREE.CylinderGeometry(1.7, 1.7, 6.6, 8), TURRET_ROOF = new THREE.ConeGeometry(2.35, 3.2, 8), CROWN = new THREE.IcosahedronGeometry(1.5, 0);
function garage(g, w, d, he, fz, wall, roof, R = 6.15, dep = 5.6) { // one car garage on the right of the house, with a drive out to the road
  const gw = Math.min(3.1, R - he), gx = R - gw / 2, front = fz + .15, gz = front - dep / 2, y1 = 2.75;
  g.box(gx, 0, gz, gw, y1, dep, wall); g.box(gx, y1, gz, gw + .3, .24, dep + .3, roof);
  g.box(gx, 0, front + .03, gw - .26, 2.1, .08, '#ece7dc'); g.box(gx, 2.1, front + .03, gw - .1, .14, .1, shade(wall, .75)); for (const s of [-1, 1]) g.box(gx + s * (gw / 2 - .08), 0, front + .03, .12, 2.2, .1, shade(wall, .75));
  g.box(gx, .025, (front + 7.5) / 2 + .1, gw - .35, .05, 7.5 - front, '#b8b0a0');
  if (d) for (let y = .35; y < 2; y += .35) d.box(gx, y, front + .08, gw - .36, .04, .03, '#c9c2b4');
  w.box(gx, 2.28, front + .02, .7, .22, .1, '#000');
}
function house(g, w, h) {
  const { type, wood, pla, st, roof, acc, W, D, extra } = h.d || (h.d = design(h)), f = D / 2;
  h.design = `${type}|${MAIN[type]}:${{ wood, pla, st }[MAIN[type]]}|${roof}`;
  const plain = h.wish !== 'castle' && !CUSTOM.has(h.wish), DX = plain ? -1.1 : 0; g.box(DX, .02, f + 2.1, 1.3, .06, 4.2, '#c6bda9');
  TRIM = h.wish === 'black' ? '#4a4d52' : '#f4f1e8';
  const n0 = g.n, extraGarage = () => { // castles and comment buildings keep their shape: the garage goes in whatever room the lot has on the right
    const wide = h.yard && h.flip > 0, R = wide ? 19 : 6.15; let he = -9;
    for (let i = n0; i < g.n; i++) { const y = g.p[i * 3 + 1], x = (g.p[i * 3] - h.x) * h.flip; if (y > .1 && y < 3.2 && x < R + 1 && x > he && (!wide || x < 14)) he = x; }
    if (R - he >= 2.2) garage(g, w, det, he, 3.75, '#d9d3c6', '#5a4a3a', R); else garage(g, w, det, R - 3, 6.95, '#d9d3c6', '#5a4a3a', R, 3.1); // no room beside it: small one in the front yard
  };
  if (h.wish === 'castle') { castle(g, w, h); h.design = 'castle'; extraGarage(); return; }
  if (CUSTOM.has(h.wish)) { special(g, w, h); h.design = `${h.wish}:${h.key}`; if (h.wish !== 'burger' && h.wish !== 'bank') extraGarage(); return; }
  const grow = (k, ky) => { for (const q of [g, w, det]) if (q) { q.sc = k; q.sy = ky; } };
  grow(...[[1, 1], [1.08, 1.25], [1.16, 1.55]][h.lvl - 1]); // Chalet and Lodge are real size steps, walls and rooms included
  const K = [1, 1.08, 1.16][h.lvl - 1], GS = 1.1 * g.flip; for (const q of [g, w, det]) if (q) q.ox -= GS; // every house sits a little left on its lot, to leave room for the garage
  if (type === 0) { // chalet: stone plinth, timber upper floor, wide eaves, balcony
    g.box(0, 0, 0, W, 2.5, D, st); g.box(0, 2.5, 0, W, 2.6, D, wood); gableD(g, 0, 2.5, 0, W, 2.6, 2.5, D, 1.1, roof, wood);
    win(g, w, -W / 4, 1.1, f, 1.2, 1.1); win(g, w, W / 4, 1.1, f, 1.2, 1.1);
    g.box(0, 0, f, 1.3, 2.1, .12, '#4f2f1c');
    g.box(0, 2.9, f + .75, W + .3, .16, 1.5, '#5e3b26');
    for (let i = -3; i <= 3; i++) g.box(i * W / 6.3, 3.05, f + 1.45, .14, .95, .14, '#f1ece0');
    g.box(0, 3.95, f + 1.45, W + .2, .14, .14, '#f1ece0');
    win(g, w, -W / 4, 3.3, f, 1.1, 1.4); win(g, w, W / 4, 3.3, f, 1.1, 1.4);
    win(g, w, W / 2, 3.3, 0, 1.3, 1.3, true);
  } else if (type === 1) { // A-frame cabin
    g.box(0, 0, 0, W - .4, 1.5, D, wood); gableD(g, 0, 1.5, 0, W - .4, 0, 6.6, D, .7, roof, wood);
    win(g, w, 0, 2.2, f, 2.6, 2.2); g.box(0, 0, f, 1.2, 2, .12, '#3b2417'); g.box(0, 1.9, f + 1, W, .14, 2, '#6b4a30');
    win(g, w, W / 2 - .15, .4, 0, 1.2, .9, true);
  } else if (type === 2) { // stone cottage
    g.box(0, 0, 0, W, 3.1, D, st); gableD(g, 0, 0, 0, W, 3.1, 2.9, D, .5, roof, st);
    win(g, w, -W / 4 - .2, 1.1, f, 1.1, 1.2); win(g, w, W / 4 + .2, 1.1, f, 1.1, 1.2);
    shutters(g, -W / 4 - .2, 1, f, acc); shutters(g, W / 4 + .2, 1, f, acc);
    g.box(0, 0, f, 1.2, 2.1, .12, acc); g.box(W / 4, 4, -D / 5, 1, 3, 1, '#6e6d69');
    win(g, w, W / 2, 1.2, 0, 1.2, 1.1, true);
  } else if (type === 3) { // modern house: white block, timber box, sloping metal roof
    g.box(0, 0, 0, W + .6, 3, D, pla); g.box(-W / 7, 3, 0, W * .72, 2.7, D - .6, wood);
    const c = rgb(roof), x0 = -W / 7 - W * .41, x1 = -W / 7 + W * .41, z0 = -D / 2 - .1, z1 = D / 2 + .1;
    g.quad([x0, 6.6, z0], [x0, 6.6, z1], [x1, 5.5, z1], [x1, 5.5, z0], c); g.box(-W / 7, 5.45, 0, W * .84, .1, D + .2, roof);
    w.box(W / 5, .35, f + .04, 3, 2.25, .1, '#000'); w.box(-W / 7, 3.5, f - .26, 2.8, 1.7, .1, '#000');
    g.box(-W / 3.3, 0, f, 1.2, 2.2, .12, '#2c2f33');
  } else if (type === 4) { // farmhouse painted in plaster, with a red barn door
    g.box(0, 0, 0, W, 3.3, D, pla); gableD(g, 0, 0, 0, W, 3.3, 3.1, D, .75, roof, pla);
    win(g, w, -W / 4, 1.1, f, 1.1, 1.2); win(g, w, W / 4, 1.1, f, 1.1, 1.2); win(g, w, 0, 3.7, f, .9, 1);
    shutters(g, -W / 4, 1, f, acc); shutters(g, W / 4, 1, f, acc);
    g.box(0, 0, f, 1.4, 2.2, .12, '#8c2e27'); win(g, w, -W / 2 - .06, 1.2, 0, 1.2, 1.1, true);
  } else if (type === 5) { // tall, narrow town house
    const n = W * .78; g.box(0, 0, 0, n, 6.3, D, pla); gableD(g, 0, 0, 0, n, 6.3, 3.6, D, .45, roof, pla); g.box(0, 3.05, 0, n + .12, .2, D + .12, acc);
    for (const x of [-n / 4, n / 4]) win(g, w, x, 3.7, f, .95, 1.5);
    win(g, w, n / 4, 1, f, .95, 1.2); win(g, w, 0, 6.6, f, .8, .9); g.box(-n / 4, 0, f, 1.15, 2.1, .12, acc); win(g, w, n / 2, 3.8, 0, 1.2, 1.2, true);
  } else if (type === 6) { // lodge with a lower front wing
    g.box(0, 0, -.5, W, 3.3, D - 1, wood); gableD(g, 0, 0, -.5, W, 3.3, 2.5, D - 1, .5, roof, wood);
    g.box(-W / 4, 0, f, W * .5, 3, 3, pla); gableD(g, -W / 4, 0, f, W * .5, 3, 1.9, 3, .3, roof, pla);
    win(g, w, -W / 4, 1, f + 1.5, 1.5, 1.2); g.box(W / 4, 0, f - 1, 1.2, 2.1, .12, acc); win(g, w, W / 2, 1.2, -.5, 1.4, 1.1, true);
  } else if (type === 7) { // plaster house with a stone corner turret
    g.box(0, 0, 0, W, 3.4, D, pla); gableD(g, 0, 0, 0, W, 3.4, 2.7, D, .5, roof, pla);
    const tx = -W / 2 + .7, tz = f - .4; g.add(TURRET, st, tx, 3.3, tz); g.add(TURRET_ROOF, roof, tx, 8.2, tz);
    w.box(tx, 3.6, tz + 1.58, .8, 1.3, .1, '#000'); win(g, w, W / 4, 1.2, f, 1.2, 1.1); g.box(.2, 0, f, 1.2, 2.1, .12, acc);
  }
  const dr = rng(h.h ^ 0x5bd1), dark = '#6b4a30';
  if (type === 0) { planks(0, 2.5, f, W, 2.6, wood); planksSide(0, 2.5, W, D, 2.6, wood); stones(0, 0, f, W, 2.3, st, dr); }
  else if (type === 1) { planks(0, 0, f, W - .4, 1.5, wood); planksSide(0, 0, W - .4, D, 1.5, wood); for (let i = -2; i <= 2; i++) faceZ(i * .9 - .03, i * .9 + .03, 1.5, 4.9 - Math.abs(i) * 1.2, f + .02, shade(wood, .68)); }
  else if (type === 2) { stones(0, 0, f, W, 3.1, st, dr, 22); det.box(W / 4, 7, -D / 5, 1.3, .22, 1.3, '#55544f'); }
  else if (type === 3) { planks(-W / 7, 3, f - .3, W * .72, 2.7, wood); faceZ(-W / 2 - .3, W / 2 + .3, 2.92, 3, f + .02, '#8c8a82'); }
  else if (type === 4) { for (const x of [-W / 2, W / 2 - .2]) faceZ(x, x + .2, 0, 3.3, f + .02, dark); faceZ(-W / 2, W / 2, 3.1, 3.3, f + .02, dark); faceZ(-W / 2, W / 2, 0, .3, f + .02, dark); }
  else if (type === 5) { const n = W * .78; for (const x of [-n / 2, n / 2 - .3]) for (let y = .1; y < 6; y += .62) faceZ(x, x + .3, y, y + .34, f + .02, shade(pla, .84)); }
  else if (type === 6) { planks(0, 0, f - 1, W, 3.3, wood); planksSide(-.5, 0, W, D - 1, 3.3, wood); }
  else { faceZ(-W / 2 + 2.4, W / 2, 3.1, 3.3, f + .02, shade(pla, .78)); stones(.5, 0, f, W - 3, 1, st, dr, 8); }
  const foot = [W, W - .4, W, W + .6, W, W * .78, W, W][type];
  det.box(0, 0, type === 6 ? -.5 : 0, foot + .18, .3, (type === 6 ? D - 1 : D) + .18, '#6f6e68');
  const dx = [0, 0, 0, -W / 3.3, 0, -W * .195, W / 4, .2][type], dz = type === 6 ? f - 1 : f, dw = 1.35, dh = 2.2, fr = shade(acc, .7);
  det.box(dx - dw / 2 - .07, 0, dz + .08, .14, dh, .12, '#e9e4d8'); det.box(dx + dw / 2 + .07, 0, dz + .08, .14, dh, .12, '#e9e4d8'); det.box(dx, dh, dz + .08, dw + .28, .14, .12, '#e9e4d8');
  det.box(dx + dw * .3, 1, dz + .16, .12, .12, .1, '#d6b13c'); det.box(dx, 0, dz + .7, dw + .5, .22, 1, '#b8b0a0'); det.box(dx, 1.5, dz + .1, .9, .08, .06, fr); det.box(dx, .7, dz + .1, .9, .08, .06, fr);
  w.box(dx + dw / 2 + .32, 2, dz + .1, .16, .3, .14, '#000');
  const top = { 0: 7.5, 4: 6.3, 6: 5.8, 7: 6 }[type];
  if (top) { det.box(W / 4, 3, -D / 5, .9, top - 3, .9, '#7b7c79'); det.box(W / 4, top, -D / 5, 1.1, .18, 1.1, '#55544f'); }
  det.add(BUSH, '#4f8445', -W / 2 + .6, .5, dz + .7, 1, .85, 1); det.add(BUSH, '#5c9150', W / 2 - .5, .45, dz + .65, .8, .7, .8);
  for (let i = 0; i < 3; i++) det.box(dx * .15, .03, dz + 1.6 + i * .95, 1.05, .07, .7, i % 2 ? '#b8b0a0' : '#a8a092');
  // garden extras: each bit adds one thing, so neighbours differ on the lawn too
  if (extra & 1) { g.box(-W / 2 - 1, 0, f + 1.6, .35, 1.7, .35, '#5e3b26'); g.add(CROWN, '#5f9a4a', -W / 2 - 1, 2.7, f + 1.6); }
  if (extra & 2) { g.box(W / 2 - 1, .4, f + 2.1, 2, .14, .55, '#7a4f2e'); g.box(W / 2 - 1, 0, f + 2.1, 1.7, .4, .2, '#5e3b26'); }
  if (extra & 4) { g.box(1.1, 0, f + 3.4, .14, .95, .14, '#3a3f47'); g.box(1.1, .95, f + 3.4, .55, .35, .4, acc); }
  if (extra & 8) { g.box(-W / 2 - .9, 0, -D / 4, 1.2, 1.1, 2.8, '#6b4a30'); g.box(-W / 2 - .9, 1.1, -D / 4, 1.35, .14, 3, '#3e2b1d'); }
  if (extra & 16) { g.box(0, 0, -D / 2 - 2.6, 3, 2.1, 2.3, acc); gableD(g, 0, 0, -D / 2 - 2.6, 3, 2.1, 1, 2.3, .25, roof, acc); }
  wishes(g, w, h, W, D, f, roof, acc);
  grow(1, 1); for (const q of [g, w, det]) if (q) q.ox += GS;
  const he = W * K / 2 - 1.1, gL = 6.15 - Math.min(3.1, 6.15 - he) - .1;
  garage(g, w, det, he, f * K, { wood, pla, st }[MAIN[type]], roof);
  if (h.lvl >= 2) { // the plot grows with the house: Chalet fences the whole lot, Lodge walls it in as an estate
    const X = 6.3, Z0 = -5.7, Z1 = 7.1, lodge = h.lvl >= 3, gap = .9, gl = DX - gap, gr = DX + gap;
    g.box(0, .005, (Z0 + Z1) / 2, X * 2, .05, Z1 - Z0, lodge ? '#6fae52' : '#82bf60');
    const flower = (x, z) => { g.box(x, 0, z, 1.5, .28, .7, '#5a3f28'); for (let i = 0; i < 4; i++) g.box(x - .54 + i * .36, .28, z, .26, .26, .26, ['#d8352b', '#f6c81e', '#e47ab0', '#f3f1ea'][i]); };
    if (!lodge) {
      const posts = (x0, z0, x1, z1) => { const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.1); for (let i = 0; i <= n; i++) g.box(x0 + (x1 - x0) * i / n, 0, z0 + (z1 - z0) * i / n, .16, .85, .16, '#f4f1e8'); const w0 = Math.abs(x1 - x0) + .1, d0 = Math.abs(z1 - z0) + .1; g.box((x0 + x1) / 2, .58, (z0 + z1) / 2, w0, .09, d0, '#f4f1e8'); g.box((x0 + x1) / 2, .28, (z0 + z1) / 2, w0, .09, d0, '#f4f1e8'); };
      posts(-X, Z1, gl, Z1); posts(gr, Z1, gL, Z1); posts(-X, Z0, -X, Z1); posts(X, Z0, X, Z1); posts(-X, Z0, X, Z0);
      flower(-4, 5.9); flower(1.2, 6.2);
    } else {
      const wall = (cx, cz, wd, dp) => { g.box(cx, 0, cz, wd, 1.1, dp, '#b7b0a2'); g.box(cx, 1.1, cz, wd + .14, .16, dp + .14, '#8f8a7e'); };
      wall((-X + gl) / 2, Z1, gl + X, .42); wall((gL + gr) / 2, Z1, gL - gr, .42); wall(-X, (Z0 + Z1) / 2, .42, Z1 - Z0); wall(X, (Z0 + Z1) / 2, .42, Z1 - Z0); wall(0, Z0, X * 2, .42);
      for (const x of [gl, gr]) { g.box(x, 0, Z1, .62, 1.9, .62, '#8f8a7e'); g.box(x, 1.9, Z1, .76, .14, .76, '#6e6a60'); g.box(x, 2.04, Z1, .3, .36, .3, '#f6c81e'); }
      g.box((gL - X + .3) / 2, .03, 5.9, gL + X - .3, .05, 2.1, '#c9c2b4');
      g.box(-4.3, 0, 5.9, 2.8, .5, 1.8, '#d9d3c6'); g.box(-4.3, .4, 5.9, 2.2, .14, 1.3, '#48bcd0');
      for (const [x, z] of [[-5.6, -5.2], [5.6, -5.2]]) g.add(new THREE.ConeGeometry(.6, 4.2, 7), '#3f6b3e', x, 2.1, z);
    }
  }
  if (h.id === 1) { // the Mayor's flagpole
    g.box(-W / 2 - 2.4, 0, f + 1.5, .22, 10, .22, '#e8e8e4'); g.box(-W / 2 - 1, 8.4, f + 1.5, 2.7, 1.5, .08, '#d8352b'); g.box(-W / 2 - 1, 9, f + 1.5, 2.7, .3, .1, '#fff');
  }
}

/* ---------- static town ---------- */
const chunks = new Map();
const front0 = {}, sceneHits = [], carQueue = []; // everything solid in the town, kept for the cars
const chunk = (x, z) => { const k = `${Math.floor(x / 150)},${Math.floor(z / 150)}`; if (!chunks.has(k)) { chunks.set(k, { g: new Geo(), w: new Geo(), f: new Geo(), fw: new Geo(), homes: [], cx: (Math.floor(x / 150) + .5) * 150, cz: (Math.floor(z / 150) + .5) * 150 }); chunks.get(k).g.hits = sceneHits; } return chunks.get(k); };
const rows = new Map();
/* Far away a house is one simple block with a roof; the full model is only built around the camera (see updateDetail).
   Landmarks people asked for keep their full shape at any distance. */
const trash = new Geo(), FAR = [[5.1, 2.5], [1.5, 5.2], [3.1, 3], [6, .5], [4.6, 2.8], [7.4, 2.6], [4.4, 3], [4.6, 2.8]];
function farHouse(g, w, h) {
  const d = h.d || (h.d = design(h)), [bh, rh] = FAR[d.type], [k, ky] = [[1, 1], [1.08, 1.25], [1.16, 1.55]][h.lvl - 1], f = d.D / 2, wall = d[MAIN[d.type]]; const sh = 1.1 * h.flip; det = trash.at(h.x, h.z, h.flip); g.at(h.x - sh, h.z, h.flip); w.at(h.x - sh, h.z, h.flip); g.sc = w.sc = k; g.sy = w.sy = ky;
  g.box(0, 0, 0, d.W, bh, d.D, wall); if (d.type === 3) g.box(0, bh, 0, d.W + .6, rh, d.D + .6, d.roof); else gableD(g, 0, 0, 0, d.W, bh, rh, d.D, .5, d.roof, wall);
  g.box(0, 0, f, 1.2, 2, .12, '#4f2f1c'); if (bh > 2) for (const x of [-d.W / 4, d.W / 4]) w.box(x, 1.1, f, 1.2, 1.1, .1, '#000'); g.sc = w.sc = 1; g.sy = w.sy = 1; g.at(h.x, h.z, h.flip); w.at(h.x, h.z, h.flip); { const he = d.W * k / 2 - 1.1, gw = Math.min(3.1, 6.15 - he), gx = 6.15 - gw / 2, fr = f * k + .15; g.box(gx, 0, fr - 2.8, gw, 2.75, 5.6, wall); g.box(gx, 2.75, fr - 2.8, gw + .3, .24, 5.9, d.roof); g.box(gx, .025, (fr + 7.5) / 2 + .1, gw - .35, .05, 7.5 - fr, '#b8b0a0'); } g.at(0, 0); w.at(0, 0); det = null; trash.n = 0;
}
for (const h of houses) {
  const c = chunk(h.x, h.z); c.homes.push(h);
  if (h.wish === 'castle' || CUSTOM.has(h.wish)) { c.f.at(h.x, h.z, h.flip); c.fw.at(h.x, h.z, h.flip); det = trash.at(h.x, h.z, h.flip); house(c.f, c.fw, h); det = null; trash.n = 0; c.f.at(0, 0); c.fw.at(0, 0); c.f.sc = c.fw.sc = 1; c.f.sy = c.fw.sy = 1; }
  else farHouse(c.f, c.fw, h);
}
for (const p of plots) { // a free plot: bare ground, corner stakes and a little FREE board
  const c = chunk(p.x, p.z), g = c.g.at(p.x, p.z, p.flip);
  g.box(0, .02, 0, 10.6, .07, 9.6, '#b5c678');
  g.box(0, .03, 7.4, 1.4, .06, 5.2, '#d3cbb9');
  for (const a of [-5.1, 5.1]) for (const b of [-4.6, 4.6]) g.box(a, 0, b, .22, 1, .22, '#f3f1ea');
  g.box(-3.3, 0, 4.2, .2, 1.1, .2, '#5e3b26');
  g.at(0, 0);
}
for (const h of lots) { const R = rows.get(h.k) || { min: 1e9, max: -1e9 }; R.min = Math.min(R.min, h.x); R.max = Math.max(R.max, h.x); rows.set(h.k, R); }
const base = new Geo(), lit = new Geo(); base.hits = sceneHits;
const ROAD = '#5e6168', KERB = '#cfc7b4';
function roadX(x0, x1, z) { const w = x1 - x0, x = (x0 + x1) / 2; base.box(x, .03, z, w, .05, 10.5, KERB); base.box(x, .05, z, w, .06, 7, ROAD); for (let a = x0 + 4; a < x1 - 2; a += 9) base.box(a, .1, z, 3.2, .03, .22, '#e7e3d6'); }
function roadZ(x, z0, z1) { const d = z1 - z0, z = (z0 + z1) / 2; base.box(x, .035, z, 10.5, .055, d, KERB); base.box(x, .055, z, 7, .065, d, ROAD); for (let a = z0 + 4; a < z1 - 2; a += 9) base.box(x, .105, a, .22, .03, 3.2, '#e7e3d6'); }
const rowSegs = [];
function landRuns(x0, x1, z) { // the parts of a street that stay on dry land; streets stop at the river bank
  const out = []; let start = null;
  for (let x = x0; x <= x1; x += 2) { const dry = Math.abs(z - riverZ(x)) >= 18; if (dry && start === null) start = x; if ((!dry || x + 2 > x1) && start !== null) { const end = dry ? x : x - 2; if (end - start >= 16) out.push([start, end]); start = null; } }
  return out;
}
function barrier(x, z) { for (let i = -2; i <= 2; i++) base.box(x, .05, z + i * 1.4, .34, .9, 1.3, i % 2 ? '#f3f1ea' : '#d8352b'); }
const aves = new Map();
for (const [k, R] of rows) {
  const z = k * ROW, x0 = Math.floor((R.min - 9) / STEP) * STEP, x1 = Math.ceil((R.max + 9) / STEP) * STEP;
  for (const [a, b] of landRuns(x0, x1, z)) { roadX(a, b, z); rowSegs.push({ k, a, b }); if (a > x0) barrier(a, z); if (b < x1) barrier(b, z); }
  for (let m = Math.ceil(R.min / AVE) - 1; m <= Math.floor(R.max / AVE) + 1; m++) {
    const x = m * AVE; if (x < R.min - AVE * .5 || x > R.max + AVE * .5) continue;
    const a = aves.get(m) || { min: 1e9, max: -1e9 }; a.min = Math.min(a.min, z); a.max = Math.max(a.max, z); aves.set(m, a);
  }
}
if (!aves.has(0)) aves.set(0, { min: -ROW, max: ROW });
const BRIDGE_RISE = 3.4, BRIDGE_RAMP = 18, bridges = [];
const hump = d => Math.abs(d) >= BRIDGE_RAMP ? 0 : BRIDGE_RISE * Math.cos(Math.PI * d / (BRIDGE_RAMP * 2)) ** 2; // arched road, flat again before the first junction
const deckY = (x, z) => { for (const b of bridges) if (Math.abs(x - b.x) < 6) return hump(z - b.rz); return 0; };
function slab(cx, hw, z0, z1, y0, y1, t, hex) { // a sloping slice of bridge from z0 to z1, thickness t below the top surface
  const c = rgb(hex), L = cx - hw, R = cx + hw;
  base.quad([L, y1, z1], [R, y1, z1], [R, y0, z0], [L, y0, z0], c); base.quad([R, y1 - t, z1], [R, y0 - t, z0], [R, y0, z0], [R, y1, z1], c); base.quad([L, y0 - t, z0], [L, y1 - t, z1], [L, y1, z1], [L, y0, z0], c); base.quad([L, y0 - t, z0], [R, y0 - t, z0], [R, y1 - t, z1], [L, y1 - t, z1], c);
}
for (const [m, a] of aves) {
  const x = m * AVE, rz = riverZ(x), L = 46, onBridge = a.min < rz - L / 2 + 8 && a.max > rz + L / 2 - 8;
  if (!onBridge) { roadZ(x, a.min, a.max); continue; }
  roadZ(x, a.min, rz - L / 2); roadZ(x, rz + L / 2, a.max); bridges.push({ x, rz });
  const stone = '#b3aea3', dark = '#8d8a83', N = 28; // a proper arched bridge: tall enough for boats to pass under
  for (let i = 0; i < N; i++) {
    const z0 = rz - L / 2 + i * L / N, z1 = z0 + L / N, y0 = hump(z0 - rz), y1 = hump(z1 - rz);
    slab(x, 5.7, z0, z1, y0 + .02, y1 + .02, .75, stone); slab(x, 5.25, z0, z1, y0 + .07, y1 + .07, .05, KERB); slab(x, 3.5, z0, z1, y0 + .12, y1 + .12, .05, ROAD);
    if (i % 3 === 0) slab(x, .11, z0, z1, y0 + .15, y1 + .15, .02, '#e7e3d6');
    for (const s2 of [-1, 1]) { slab(x + s2 * 5.45, .3, z0, z1, y0 + 1.15, y1 + 1.15, 1.2, stone); slab(x + s2 * 5.45, .42, z0, z1, y0 + 1.3, y1 + 1.3, .15, dark); }
  }
  for (const dz of [-15, 0, 15]) { const top = hump(dz) - .7; base.box(x, -5, rz + dz, 8.6, top + 5, 2.8, dark); base.box(x, -1.4, rz + dz, 10.4, .8, 3.6, stone); for (const s2 of [-1, 1]) base.box(x + s2 * 4.6, -1.4, rz + dz, 1.1, top + 1.4 + .6, 3.2, stone); }
  for (const s2 of [-1, 1]) { for (let dz = -22; dz <= 22; dz += 5.5) { const y = hump(dz); base.box(x + s2 * 5.45, y + .1, rz + dz, .86, 1.36, .86, dark); base.box(x + s2 * 5.45, y + 1.46, rz + dz, 1, .14, 1, stone); } for (const e of [-1, 1]) { base.box(x + s2 * 5.45, 0, rz + e * L / 2, 1.3, 2.2, 1.3, dark); base.box(x + s2 * 5.45, 2.2, rz + e * L / 2, .5, .5, .5, '#d6b13c'); } }
}
// the Bakery: the first building the town voted for
function bakery(px, pz) {
  const cx = px - 2, fz = pz + 2.5, W = 14, D = 11, cz = fz - D / 2, cream = '#f1e6cc', beam = '#4a2f1d', shop = '#2f6f7a', gold = '#d6b13c', roof = '#a8502e', stone = '#a39f95', crust = '#c98a3c', crust2 = '#e0a95a', flour = '#f5ecd6';
  base.box(px, .05, pz, 22, .08, 18, '#b7ad9a'); for (let x = -10; x <= 10; x += 2.5) for (let z = -8; z <= 8; z += 2.5) base.box(px + x, .13, pz + z, 2.3, .03, 2.3, (x + z) % 5 ? '#c4baa6' : '#b0a692');
  // ground floor shopfront, timbered upper floor, steep tiled roof
  base.box(cx, 0, cz, W, .5, D, stone); base.box(cx, .5, cz, W, 3.1, D, shop); base.box(cx, 3.6, cz, W + .2, .22, D + .2, gold); base.box(cx, 3.82, cz, W, 3.3, D, cream); base.gable(cx, 7.12, cz, W + .1, 0, 5.6, D, .6, roof, cream);
  const fr = fz + .02, tim = (x0, y0, x1, y1, t = .2, hex = beam) => { const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * t / 2, ny = dx / l * t / 2, c = rgb(hex); base.quad([x0 - nx, y0 - ny, fr + .12], [x1 - nx, y1 - ny, fr + .12], [x1 + nx, y1 + ny, fr + .12], [x0 + nx, y0 + ny, fr + .12], c); };
  for (const x of [-7, -3.2, 3.2, 7]) tim(cx + x, 3.82, cx + x, 7.1, .28); tim(cx - 7, 7.1, cx + 7, 7.1, .28); tim(cx - 7, 3.9, cx + 7, 3.9, .28); tim(cx - 7, 3.9, cx - 3.2, 7.1); tim(cx - 3.2, 3.9, cx - 7, 7.1); tim(cx + 3.2, 3.9, cx + 7, 7.1); tim(cx + 7, 3.9, cx + 3.2, 7.1);
  tim(cx - 7.3, 7.1, cx, 12.7, .32); tim(cx + 7.3, 7.1, cx, 12.7, .32); tim(cx, 7.1, cx, 12.3, .22); tim(cx - 3.7, 7.1, cx, 10, .18); tim(cx + 3.7, 7.1, cx, 10, .18);
  const win = (x, y, w, h) => { base.box(x, y - .12, fz + .03, w + .36, h + .24, .16, beam); lit.box(x, y, fz + .14, w, h, .08, '#000'); base.box(x, y + h / 2 - .04, fz + .18, w, .07, .05, beam); base.box(x, y, fz + .18, .07, h, .05, beam); base.box(x, y - .3, fz + .32, w + .5, .26, .46, '#6b4a30'); for (let i = 0; i < 6; i++) base.box(x - w / 2 + i * w / 5, y - .05, fz + .32, .22, .22, .22, ['#d8352b', '#f6c81e', '#e47ab0'][i % 3]); };
  win(cx, 4.5, 2, 1.9); win(cx - 5.1, 4.5, 1.7, 1.9); win(cx + 5.1, 4.5, 1.7, 1.9); win(cx, 8.6, 1.5, 1.5);
  // shop windows with bread on show, double doors, striped awning, sign
  for (const s of [-1, 1]) { const x = cx + s * 4.3; base.box(x, .7, fz + .03, 4.6, 2.6, .12, gold); lit.box(x, .85, fz + .1, 4.3, 2.3, .06, '#000'); base.box(x, .55, fz + .1, 4.9, .32, .3, '#234a52'); base.box(x, 1.6, fz + .16, 4.3, .06, .22, '#c9a06a'); base.box(x, 2.3, fz + .16, 4.3, .06, .22, '#c9a06a');
    for (let i = 0; i < 6; i++) { base.add(new THREE.SphereGeometry(.28, 7, 5), i % 2 ? crust : crust2, x - 1.75 + i * .7, 1.82, fz + .2, 1.2, .72, .7); base.add(new THREE.SphereGeometry(.24, 7, 5), i % 2 ? crust2 : '#b9722e', x - 1.6 + i * .64, 2.5, fz + .2, 1, .72, .7); } for (let i = 0; i < 5; i++) base.add(new THREE.SphereGeometry(.2, 6, 5), i % 2 ? '#f0c8d4' : flour, x - 1.5 + i * .75, 1.12, fz + .22, 1, .7, .8); }
  base.box(cx, .5, fz + .03, 2.5, 3, .12, gold); for (const s of [-1, 1]) { base.box(cx + s * .6, .55, fz + .1, 1.08, 2.85, .1, '#7a2e2a'); lit.box(cx + s * .6, 1.75, fz + .16, .7, 1.3, .05, '#000'); base.box(cx + s * .18, 1.5, fz + .22, .07, .5, .09, gold); } base.box(cx, .05, fz + 1, 3.4, .45, 1.6, stone);
  for (let i = 0; i < 15; i++) { const x0 = cx - 7 + i, x1 = x0 + 1, c = rgb(i % 2 ? '#c8352b' : '#fbf3e0'); base.quad([x0, 3.5, fz + .02], [x0, 2.85, fz + 2], [x1, 2.85, fz + 2], [x1, 3.5, fz + .02], c); base.quad([x0, 2.85, fz + 2], [x0, 2.45, fz + 2.03], [x1, 2.45, fz + 2.03], [x1, 2.85, fz + 2], c); }
  plate({ x: cx, z: fz, flip: 1 }, 0, 3.72 - .32 + .38, .3, 'THE BAKERY', 6.6);
  // a giant croissant on the ridge and a pretzel hanging over the door
  for (let i = -9; i <= 9; i++) { const t = i / 9, a = t * 1.32, r = 1.95 * (1 - .78 * t * t) + .1, x = cx + Math.sin(a) * 5.1, y = 10.1 + Math.cos(a) * 3.5, band = Math.floor((i + 9) / 2) % 2; base.add(new THREE.SphereGeometry(1, 11, 8), band ? crust : crust2, x, y, cz + 1.2, 1.1, r, r); }
  base.box(cx + 7.2, 4.6, fz + .9, .14, .14, 2.2, beam); base.box(cx + 7.2, 4, fz + 1.9, .05, .6, .05, beam); const pr = (r, t, x, y, sx = 1) => base.add(new THREE.TorusGeometry(r, t, 7, 14), crust, cx + 7.2 + x, y, fz + 1.9, sx, 1, 1); pr(.82, .2, -.44, 3.3); pr(.82, .2, .44, 3.3); pr(1.12, .22, 0, 3.05, 1.08);
  // lower side wing with the ovens and a smoking stack
  const wx = px + 7.6; base.box(wx, 0, cz + .4, 6.6, 4.2, 8, cream); base.gable(wx, 4.2, cz + .4, 6.6, 0, 2.4, 8, .4, roof, cream); lit.box(wx, 1.2, cz + 4.44, 2.6, 1.7, .08, '#000'); base.box(wx, 1, cz + 4.44, 3, .2, .12, beam); for (const x of [-1.5, 1.5]) tim2(wx + x); base.box(wx + 1.4, 4.5, cz - 1.6, 1.3, 6, 1.3, '#8a4b35'); base.box(wx + 1.4, 10.5, cz - 1.6, 1.6, .3, 1.6, '#5a3a2a'); function tim2(x) { base.box(x, .4, cz + 4.44, .16, 3.7, .12, beam); }
  // pavement cafe: tables, parasols, crates, chalkboard
  for (const [x, z, c] of [[-5.8, 3, '#c8352b'], [5.6, 3.6, '#2f6f7a']]) { const X = cx + x, Z = fz + z; base.box(X, .15, Z, .14, 1, .14, '#2c3331'); base.add(new THREE.CylinderGeometry(.82, .82, .08, 12), '#f3f1ea', X, 1.18, Z); base.box(X, .15, Z, .14, 3.1, .14, '#e8e3d6'); base.add(new THREE.ConeGeometry(2.3, .95, 10), c, X, 3.6, Z); for (const [a, b] of [[-1.2, 0], [1.2, 0], [0, 1.2], [0, -1.2]]) { base.box(X + a, .15, Z + b, .46, .62, .46, '#8a5a34'); base.box(X + a + (a ? Math.sign(a) * .2 : 0), .76, Z + b + (b ? Math.sign(b) * .2 : 0), a ? .06 : .46, .5, b ? .06 : .46, '#8a5a34'); } base.add(new THREE.SphereGeometry(.2, 6, 4), crust, X + .2, 1.3, Z, 1.3, .7, 1); base.box(X - .25, 1.22, Z, .22, .2, .22, '#f3f1ea'); }
  base.box(cx + 2.6, .15, fz + 2.7, .9, 1.5, .08, '#23302c'); base.box(cx + 2.6, .15, fz + 2.65, 1.04, .1, .2, '#8a5a34'); for (let i = 0; i < 4; i++) base.box(cx + 2.6, .9 + i * .18, fz + 2.75, .55 - (i % 2) * .15, .05, .02, '#f3f1ea');
  for (const [x, z] of [[-1.9, 1.6], [2.3, 1.2]]) { base.box(cx + x, .15, fz + z, 1, .6, .7, '#a97c49'); for (const a of [-.25, .25]) base.add(new THREE.SphereGeometry(.26, 7, 5), crust2, cx + x + a, .84, fz + z, 1.2, .7, .8); }
  for (const x of [-9.5, 10]) { base.box(px + x, .15, pz + 7.4, 1.1, .55, 1.1, '#8d5a3a'); base.add(CROWN, '#5f9a4a', px + x, 1.6, pz + 7.4, .55, .55, .55); }
}
// square, church, fountain and the empty plot the town votes on
(() => {
  const r = rng(11);
  base.box(0, .02, 0, 100, .06, 68, '#c9c1b0');
  for (let x = -46; x <= 46; x += 7.6) for (let z = -30; z <= 30; z += 7.6) base.box(x, .05, z, 7.2, .05, 7.2, r() > .5 ? '#d3cbb9' : '#bfb6a4');
  const cx = -22, cz = -12;
  base.box(cx, 0, cz, 13, 8.5, 22, '#f0ebdf'); base.gable(cx, 0, cz, 13, 8.5, 6.5, 22, .5, '#7f3b2f', '#f0ebdf');
  base.box(cx, 0, cz + 14, 7, 21, 7, '#f0ebdf'); base.box(cx, 14.5, cz + 17.6, 2.2, 2.2, .1, '#d6b13c');
  base.box(cx, 21, cz + 14, 8, .5, 8, '#c9c1b0');
  base.add(new THREE.SphereGeometry(4, 8, 6), '#4f7a6a', cx, 25, cz + 14, .95, .9, .95);
  base.add(new THREE.ConeGeometry(1.6, 6, 8), '#4f7a6a', cx, 31, cz + 14);
  base.box(cx, 33.5, cz + 14, .22, 3, .22, '#d6b13c'); base.box(cx, 35, cz + 14, 1.4, .22, .22, '#d6b13c');
  base.box(cx, 0, cz + 17.6, 2.4, 4, .1, '#5a3a24');
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) lit.box(cx + s * 6.56, 3, cz - 8 + i * 5, .1, 3.2, 1.4, '#000');
  base.add(new THREE.CylinderGeometry(6, 6.6, 1.2, 12), '#a39f95', 18, .6, 10); base.add(new THREE.CylinderGeometry(5.2, 5.2, .1, 12), '#62c0d2', 18, 1.25, 10);
  base.add(new THREE.CylinderGeometry(.7, 1.1, 3.4, 8), '#a39f95', 18, 2.4, 10); base.add(new THREE.ConeGeometry(1.9, 1, 8), '#a39f95', 18, 4.3, 10);
  // the plot the town votes on: scaffolding until the winner is built
  const px = 26, pz = -16;
  if (!(CFG.opened || []).includes('Bakery')) {
    base.box(px, .05, pz, 22, .12, 18, '#8d7350');
    for (const a of [-1, 1]) for (const b of [-1, 1]) base.box(px + a * 9, 0, pz + b * 7, .3, 9, .3, '#d4a12d');
    for (const y of [3, 6, 9]) { base.box(px, y, pz - 7, 18, .25, .25, '#d4a12d'); base.box(px, y, pz + 7, 18, .25, .25, '#d4a12d'); base.box(px - 9, y, pz, .25, .25, 14, '#d4a12d'); base.box(px + 9, y, pz, .25, .25, 14, '#d4a12d'); }
  } else bakery(px, pz);
})();
// street lamps: a post with an arm and lantern along every road, and a pool of light that shows after dark
const lampSpots = [];
function lamp(x, z, ax, az) { // (ax, az) is the direction the arm reaches over the road
  if (CIVIC.some(c => Math.abs(x - (c.lot.x + 6.5)) < 15 && Math.abs(z - c.lot.z) < 10)) return; // keep public building entrances clear
  const c = chunk(x, z), P = '#232c2a';
  c.g.box(x, 0, z, .46, .5, .46, '#3a4340'); c.g.box(x, .5, z, .2, 5.6, .2, P); c.g.box(x + ax * .7, 6, z + az * .7, ax ? 1.5 : .12, .12, az ? 1.5 : .12, P);
  const hx = x + ax * 1.4, hz = z + az * 1.4; c.g.box(hx, 5.42, hz, .62, .1, .62, P); c.g.box(hx, 6.02, hz, .72, .14, .72, P); c.w.box(hx, 5.5, hz, .46, .52, .46, '#000');
  lampSpots.push([hx, hz]);
}
for (const { k, a: x0, b: x1 } of rowSegs) {
  const z = k * ROW; let side = 1;
  for (let x = x0 + 8; x < x1 - 4; x += 19.5) { const m = ((x % AVE) + AVE + AVE / 2) % AVE - AVE / 2; side = -side; const lz = z + side * 5.6; if (Math.abs(m) < 8 || Math.abs(lz - riverZ(x)) < 18.5) continue; lamp(x, lz, 0, -side); }
}
for (const [m, A] of aves) { let side = 1; const x = m * AVE; for (let z = A.min + 8; z < A.max - 4; z += 19.5) { const r = ((z % ROW) + ROW + ROW / 2) % ROW - ROW / 2; side = -side; if (Math.abs(r) < 8 || Math.abs(z - riverZ(x)) < 24) continue; lamp(x + side * 5.6, z, -side, 0); } }
/* benches and bus shelters */
function bench(x, z, ax, az) { // (ax, az) is the way the seat faces
  const c = chunk(x, z), along = ax !== 0, W = '#8a5a34', I = '#2c3331', b = (u, y, v, wu, h, wv, hex) => along ? c.g.box(x + v * ax, y, z + u, wv, h, wu, hex) : c.g.box(x + u, y, z + v * az, wu, h, wv, hex);
  for (const u of [-1.05, 1.05]) { b(u, 0, 0, .12, .5, .62, I); b(u, .5, -.32, .12, .62, .1, I); }
  for (const v of [-.22, 0, .22]) b(0, .5, v, 2.5, .08, .17, W); for (const y of [.72, .92, 1.08]) b(0, y, -.34, 2.5, .13, .06, W);
}
function shelter(x, z, ax, az) { // bus shelter on the pavement: (ax, az) points at the road
  const c = chunk(x, z), along = ax !== 0, b = (u, y, v, wu, h, wv, hex, G = c.g) => along ? G.box(x + v * ax, y, z + u, wv, h, wu, hex) : G.box(x + u, y, z + v * az, wu, h, wv, hex), F = '#2b3a46', GL = '#a9cfdd';
  for (const u of [-2, 0, 2]) b(u, 0, -.5, .09, 2.5, .09, F); for (const u of [-2, 2]) b(u, 0, .42, .09, 2.5, .09, F);
  b(-1, .45, -.5, 1.9, 1.95, .04, GL); b(1, .45, -.5, 1.9, 1.95, .04, GL); for (const u of [-2, 2]) b(u, .45, -.04, .04, 1.95, .84, GL); b(0, 2.5, 0, 4.3, .09, 1.2, F); b(0, 2.59, 0, 4.5, .12, 1.42, '#d8352b'); b(0, 2.34, .6, 3, .18, .06, '#000', c.w);
  for (const u of [-.8, .8]) b(u, .46, -.26, 1.3, .07, .36, '#8a5a34'); b(-.8, 0, -.26, .09, .46, .3, F); b(.8, 0, -.26, .09, .46, .3, F); b(1.55, .3, -.46, .7, 1.5, .04, '#f3f1ea'); for (let i = 0; i < 5; i++) b(1.55, .5 + i * .24, -.43, .54, .06, .02, '#6d7277');
  b(-2.7, 0, .3, .11, 3, .11, F); b(-2.7, 2.86, .3, .66, .66, .08, '#d8352b'); b(-2.7, 3.04, .3, .8, .3, .1, '#2e5c8a');
}
const longRoads = rowSegs.filter(r => r.b - r.a > 90).sort((p, q) => (q.b - q.a) - (p.b - p.a)), busRows = longRoads.filter((r, i) => i % 2 === 0).slice(0, 3), busAves = [...aves.entries()].filter(([, A]) => A.max - A.min > 90).sort((p, q) => Math.abs(p[0]) - Math.abs(q[0])).slice(0, 2);
const busStops = new Map(); // route key -> stopping points along that lane
const stopAt = (key, q) => { if (!busStops.has(key)) busStops.set(key, []); busStops.get(key).push(q); };
const clearOfLamps = (x, z) => !lampSpots.some(([a, b]) => Math.hypot(a - x, b - z) < 5);
const firstClear = (f, offs = [12.5, 15, 10, 18, 21]) => { for (const d of offs) if (f(d)) return d; return null; };
for (const r of busRows) { const z = r.k * ROW; for (let m = Math.ceil(r.a / AVE); m * AVE < r.b - 14; m++) { const x = m * AVE; if (x - 22 < r.a || x + 22 > r.b || Math.abs(z - riverZ(x)) < 26) continue;
  const up = firstClear(d => clearOfLamps(x + d, z - 5.05)); if (up !== null) { shelter(x + up, z - 5.05, 0, 1); stopAt(`x${r.k}+`, x + up); if (clearOfLamps(x + up + 6, z - 5)) bench(x + up + 6, z - 5, 0, 1); }
  const dn = firstClear(d => clearOfLamps(x - d, z + 5.05)); if (dn !== null) { shelter(x - dn, z + 5.05, 0, -1); stopAt(`x${r.k}-`, x - dn); if (clearOfLamps(x - dn - 6, z + 5)) bench(x - dn - 6, z + 5, 0, -1); } } }
for (const [m, A] of busAves) { const x = m * AVE; for (let k = Math.ceil(A.min / ROW); k * ROW < A.max - 14; k++) { const z = k * ROW; if (z - 22 < A.min || z + 22 > A.max || Math.abs(z - riverZ(x)) < 30 || k % 2) continue;
  const up = firstClear(d => clearOfLamps(x + 5.05, z + d)); if (up !== null) { shelter(x + 5.05, z + up, -1, 0); stopAt(`z${m}+`, z + up); }
  const dn = firstClear(d => clearOfLamps(x - 5.05, z - d)); if (dn !== null) { shelter(x - 5.05, z - dn, 1, 0); stopAt(`z${m}-`, z - dn); } } }
for (let i = 0; i < 8; i++) { const a = i / 8 * 6.2832 + .39, nx = -Math.cos(a), nz = -Math.sin(a), big = Math.abs(nx) > Math.abs(nz), z = 10 + Math.sin(a) * 9.4; if (z > 7.5) bench(18 + Math.cos(a) * 9.4, z, big ? Math.sign(nx) : 0, big ? 0 : Math.sign(nz)); } // around the fountain, on the side away from the road
for (const x of [-42, -30, 10, 26, 42]) { bench(x, -27.4, 0, 1); bench(x, 27.4, 0, -1); }
for (const z of [-22, -8, 6, 20]) { bench(-47, z, 1, 0); bench(47, z, -1, 0); }
for (const b of bridges) for (const s of [-1, 1]) for (const e of [-1, 1]) { bench(b.x + s * 7.5, b.rz + e * 21, s, 0); }
for (const [m, A] of aves) { const x = m * AVE; for (let k = Math.ceil(A.min / ROW); k * ROW <= A.max; k++) { const z = k * ROW; if (Math.abs(z) < 50 && Math.abs(x) < 60 || Math.abs(z - riverZ(x)) < 26 || (k + m) % 3) continue; if (clearOfLamps(x + 5, z + 9)) bench(x + 5, z + 9, -1, 0); if (clearOfLamps(x - 5, z - 9)) bench(x - 5, z - 9, 1, 0); } }
const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
{ const x = glowCv.getContext('2d'), r = x.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = r; x.fillRect(0, 0, 128, 128); }
const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc46e, map: new THREE.CanvasTexture(glowCv), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), lampSpots.length);
{ const M = new THREE.Matrix4(); lampSpots.forEach(([x, z], i) => { M.makeTranslation(x, .17, z); pools.setMatrixAt(i, M); }); pools.frustumCulled = false; pools.renderOrder = 2; pools.visible = false; scene.add(pools); }
CIVIC.forEach(civic);
/* ---------- the Dream Mall: a real building site. Likes from visitors move it through five stages ---------- */
const mallG = new THREE.Group(), mallSpin = [], mallSteps = CFG.mall.steps, mallNames = ['Ground works', 'Foundations', 'Concrete floors', 'Glass walls', 'Roof and dome', 'Grand opening'], mallLikes = () => Number(live.mall) || 0, mallStage = n => mallSteps.filter(s => n >= s).length; scene.add(mallG); let mallBuilt = -1, mallBoard = null;
function mallSign(w, h, paint) { const c = document.createElement('canvas'); c.width = Math.round(w * 40); c.height = Math.round(h * 40); paint(c.getContext('2d'), c.width, c.height); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); m.userData.redraw = p => { p(c.getContext('2d'), c.width, c.height); t.needsUpdate = true; }; return m; }
function drawBoard() { if (mallBoard) mallBoard.userData.redraw((x, w, h) => { const n = mallLikes(), s = mallStage(n), next = mallSteps[s]; if (!next) { x.fillStyle = '#c8352b'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `800 ${h * .72}px system-ui`; x.fillText('DREAM MALL', w / 2, h * .54); return; } x.fillStyle = '#17302a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#f2c14e'; x.lineWidth = 12; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = '#f2c14e'; x.textAlign = 'center'; x.font = `800 ${h * .3}px system-ui`; x.fillText('DREAM MALL', w / 2, h * .36); x.fillStyle = '#fff'; x.font = `700 ${h * .17}px system-ui`; x.fillText(next ? `STAGE ${s} OF 5` : 'NOW OPEN', w / 2, h * .6); x.fillText(next ? `${n} OF ${next} LIKES` : `${n} LIKES`, w / 2, h * .82); }); }
function buildMall(stage) { if (stage === mallBuilt) return; mallBuilt = stage; for (const o of [...mallG.children]) { mallG.remove(o); o.traverse(q => { if (q.geometry) q.geometry.dispose(); if (q.material && q.material.map) { q.material.map.dispose(); q.material.dispose(); } }); } mallSpin.length = 0;
  const g = new Geo(), L = new Geo(), { x: cx, z: cz, W, D, front: fz } = MALL, C = '#bdb9af', C2 = '#a8a49b', steel = '#d4a12d', glass = '#5f93ab', clad = '#ece6da', asphalt = '#4c5157', open = stage >= 5, floors = [0, 1, 2, 3, 3, 3][stage], top = 1 + floors * 6;
  g.box(cx, .04, -601, 130, .08, 98, open ? '#8f9a7c' : '#8d7350');
  g.box(cx, .1, -567, 124, .08, 30, open ? asphalt : '#a08866'); if (open) { for (let x = -56; x <= 56; x += 4) { if (Math.abs(x) < 7) continue; for (const z of [-574, -561]) g.box(x, .19, z, .16, .03, 5, '#e8e6dc'); } g.box(0, .19, -567, 12, .03, 30, '#5a6066'); }
  if (!open) { for (const s of [-1, 1]) { for (let i = 0; i < 9; i++) g.box(s * (14 + i * 5.4 + 2.5), 0, -552.5, 5.2, 2.6, .25, i % 2 ? '#f2f0e8' : '#e0632e'); g.box(s * 64, 0, -601, .25, 2.6, 97, '#f2f0e8'); } g.box(cx, 0, -650, 128, 2.6, .25, '#f2f0e8'); }
  if (stage === 0) { g.box(cx, .12, cz, W, .1, D, '#6d583c'); for (const [x, z, r, h] of [[-46, -600, 7, 5], [-34, -628, 6, 4], [42, -594, 8, 6], [48, -626, 6, 4]]) g.add(new THREE.ConeGeometry(r, h, 8), '#7c6444', x, h / 2 + .1, z); for (let x = -50; x <= 50; x += 10) for (let z = -632; z <= -592; z += 10) g.box(x, .2, z, .22, 1.6, .22, '#7a4a2a');
    const x = -8, z = -604; g.box(x, .8, z, 5, 1.8, 3, '#e8b21f'); g.box(x - 1, 2.6, z, 2.2, 1.8, 2.4, '#3a3f47'); for (const s of [-1, 1]) g.box(x, .1, z + s * 1.7, 6, .9, .8, '#2c2e2a'); g.box(x + 4, 3.2, z, 5, .6, .6, '#e8b21f'); g.box(x + 7, 1.2, z, .6, 3, .6, '#e8b21f'); g.box(x + 7.2, .4, z, 1.6, 1, 1.4, '#3a3f47'); }
  if (stage >= 1) { g.box(cx, 0, cz, W, 1, D, C); const cols = (y, h) => { for (let x = -54; x <= 54; x += 12) for (let z = -24; z <= 24; z += 12) g.box(cx + x, y, cz + z, 1, h, 1, C2); }; if (floors === 1 && stage === 1) cols(1, 3); for (let i = 0; i < (stage === 1 ? 0 : floors); i++) { const y = 1 + i * 6; cols(y, 5.6); g.box(cx, y + 5.6, cz, W, .5, D, C); } for (const s of [-1, 1]) g.box(cx + s * 30, 1, cz, 7, stage === 1 ? 4 : top + 1.5, 7, C2); }
  if (stage === 1) for (let x = -54; x <= 54; x += 12) for (let z = -24; z <= 24; z += 12) for (const a of [-.3, .3]) g.box(cx + x + a, 4, cz + z, .1, 2, .1, '#6b3f25');
  const face = (i, full) => { const y = 1 + i * 6; g.box(cx, y, fz - .2, W, 5.6, .3, glass); for (let x = -54; x <= 54; x += 6) g.box(cx + x, y, fz + .02, .3, 5.6, .3, clad); g.box(cx, y + 2.7, fz + .02, W, .22, .3, clad); if (full) { g.box(cx - W / 2, y, cz, .4, 5.6, D, clad); g.box(cx + W / 2, y, cz, .4, 5.6, D, clad); g.box(cx, y, cz - D / 2, W, 5.6, .4, clad); for (const s of [-1, 1]) for (let z = -21; z <= 21; z += 7) g.box(cx + s * (W / 2 + .05), y + 1.4, cz + z, .3, 3, 4.6, glass); } }; if (stage === 3) { face(0, true); face(1, true); } if (stage >= 4) { face(0, true); face(1, true); face(2, true); g.box(cx, top + .1, cz, W + 1, 1, D + 1, clad); g.box(cx, top + 1.1, cz, W + 1.4, .3, D + 1.4, '#c9a24a'); }
  if (stage === 4) for (let i = 0; i < 5; i++) { const t = new THREE.TorusGeometry(15, .3, 6, 24, Math.PI).rotateY(i / 5 * Math.PI); g.add(t, steel, cx, top + 1.4, cz); }
  if (open) { g.add(new THREE.SphereGeometry(15, 24, 10, 0, 6.2832, 0, 1.5708), '#7fb6cc', cx, top + 1.4, cz); for (let i = 0; i < 6; i++) g.add(new THREE.TorusGeometry(15.1, .22, 6, 24, Math.PI).rotateY(i / 6 * Math.PI), '#d6b13c', cx, top + 1.4, cz); g.box(cx, top + 16, cz, .3, 6, .3, '#d6b13c'); for (let y = 0; y < 3; y++) L.box(cx, 2.2 + y * 6, fz + .25, W - 4, 2.4, .08, '#000'); g.box(cx, 0, fz + 3, 26, .3, 10, '#c9c2b4'); g.box(cx, 7, fz + 4, 28, .7, 9, '#c8352b'); g.box(cx, 7.7, fz + 4, 29, .3, 10, '#d6b13c'); for (const s of [-13, -5, 5, 13]) g.box(cx + s, .3, fz + 7.5, .7, 6.8, .7, clad); L.box(cx, .4, fz + .3, 16, 6, .1, '#000'); for (const s of [-52, -26, 26, 52]) { g.box(cx + s, top + 1.4, fz - 1, .2, 8, .2, '#e8e6dc'); g.box(cx + s + 1.3, top + 7.4, fz - 1, 2.6, 1.6, .1, ['#c8352b', '#f2c14e', '#2f7fc0', '#3fa86a'][Math.abs(s) % 4]); }
    { const Cc = ['#c8352b', '#2f7fc0', '#f2efe6', '#3a3f47', '#d6b13c', '#3fa86a'], r = rng(31); for (const z of [-574, -561]) for (let x = -54; x <= 54; x += 4) { if (Math.abs(x) < 8 || r() < .4) continue; const c = Cc[Math.floor(r() * 6)]; g.box(x + 2, .24, z, 1.9, .7, 4, c); g.box(x + 2, .94, z - .1, 1.6, .55, 2, '#2d3a44'); } } for (const x of [-20, 20]) { g.add(new THREE.CylinderGeometry(3.4, 3.8, .9, 14), '#a39f95', x, .6, fz + 8); g.add(new THREE.CylinderGeometry(2.9, 2.9, .1, 14), '#62c0d2', x, 1.08, fz + 8); g.add(new THREE.CylinderGeometry(.4, .6, 2, 8), '#a39f95', x, 2, fz + 8); } }
  if (stage >= 2 && !open) { const H = top; for (let x = -54; x <= 54; x += 6) for (const z of [fz + 1.6, fz + 3.4]) g.box(cx + x, 0, z, .2, H + 2, .2, steel); for (let y = 3; y < H + 1; y += 3) { g.box(cx, y, fz + 2.5, W, .16, 2.2, '#b98d4e'); for (const z of [fz + 1.6, fz + 3.4]) g.box(cx, y + 1, z, W, .1, .1, steel); } }
  if (!open) { for (const [x, z] of [[-40, -566], [30, -570]]) { for (let i = 0; i < 3; i++) g.box(x + i * 3.4, .2, z, 3, 1.2, 3, ['#c9a26a', '#9a9c9c', '#b4553f'][i]); } g.add(new THREE.ConeGeometry(4, 3, 8), '#c9b48a', 8, 1.7, -570); { const x = 46, z = -572; g.box(x, .9, z, 2.6, 1.8, 5, '#e8b21f'); g.box(x, 1.5, z - 3.4, 2.6, 2.4, 1.9, '#d8352b'); g.box(x, 2, z - 4.36, 2.1, 1, .1, '#2d3a44'); for (const a of [-1.2, 1.2]) for (const b of [-3.4, 1.5]) g.add(new THREE.CylinderGeometry(.55, .55, .5, 8).rotateZ(Math.PI / 2), '#26282a', x + a, .55, z + b); }
    const crane = (x, z, H, L2, jr) => { g.box(x, 0, z, 5, .7, 5, C2); for (const a of [-.8, .8]) for (const b of [-.8, .8]) g.box(x + a, .7, z + b, .2, H, .2, '#e8b21f'); for (let y = 3; y < H; y += 3) { g.box(x, y, z + .8, 1.6, .12, .12, '#e8b21f'); g.box(x, y, z - .8, 1.6, .12, .12, '#e8b21f'); g.box(x + .8, y, z, .12, .12, 1.6, '#e8b21f'); g.box(x - .8, y, z, .12, .12, 1.6, '#e8b21f'); } const j = new Geo(); j.box(0, 0, 0, 2.2, 2.2, 2.2, '#e8b21f'); j.box(L2 / 2 - 2, 1, 0, L2, .7, .7, '#e8b21f'); j.box(-7, 1, 0, 14, .7, .7, '#e8b21f'); j.box(-12, -.4, 0, 3, 1.5, 1.5, '#7a7d80'); j.box(0, 2.2, 0, .5, 3, .5, '#e8b21f'); const lift = L2 * .62; j.box(lift, -9, 0, .1, 10, .1, '#2a2c2e'); j.box(lift, -11, 0, 3.4, 1.8, 1.4, stage > 1 ? '#7a8087' : '#b98d4e'); const m = j.mesh(solid); m.castShadow = true; m.position.set(x, H + .7, z); m.rotation.y = jr; mallG.add(m); mallSpin.push(m); }; crane(cx - 72, cz - 2, 44, 44, .4); if (stage >= 2) crane(cx + 72, cz + 6, 50, 48, 2.7); }
  const mm = g.mesh(solid); mm.castShadow = mm.receiveShadow = true; mallG.add(mm); if (L.n) mallG.add(L.mesh(glow));
  mallBoard = mallSign(open ? 44 : 30, open ? 5 : 12, () => {}); if (open) { mallBoard.position.set(cx, top - 2.6, fz + .6); mallG.add(mallBoard); } else { mallBoard.position.set(cx, 11, -556); mallG.add(mallBoard); for (const s of [-1, 1]) { const p = new Geo(); p.box(cx + s * 13, 0, -556.3, .5, 17, .5, '#5a3a24'); mallG.add(p.mesh(solid)); } } drawBoard(); }
buildMall(mallStage(mallLikes()));
/* the Dream City Defence Base, south of the last street: walls, towers, hangar, helipad, tanks */
const BASE = { x: 0, z: 612, W: 168, D: 104 }, baseG = new THREE.Group(), baseGuns = []; scene.add(baseG);
{
  const g = new Geo(), w = new Geo(), { x: cx, z: cz, W, D } = BASE, O = '#5f6d45', O2 = '#4d5a39', S = '#b6a884', C = '#9b9a90', K = '#2c3129', R = '#c8352b', hw = W / 2, hd = D / 2, gate = 12;
  g.box(cx, .05, cz, W + 8, .1, D + 8, '#8e8d7f'); for (let x = -hw + 12; x < hw; x += 12) g.box(cx + x, .15, cz, .12, .02, D, '#7d7c70'); for (let z = -hd + 12; z < hd; z += 12) g.box(cx, .15, cz + z, W, .02, .12, '#7d7c70');
  g.box(cx, .16, cz - hd + 26, 12, .03, 52, '#5c6066'); for (let z = -hd + 4; z < -hd + 50; z += 7) g.box(cx, .2, cz + z, .3, .02, 3.4, '#f3f1e6');
  const wall = (x0, z0, x1, z1) => { const h = z0 === z1, L = h ? x1 - x0 : z1 - z0, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; if (h) { g.box(mx, 0, z0, L, 5, 1.4, S); g.box(mx, 5, z0, L, .5, 1.8, C); } else { g.box(x0, 0, mz, 1.4, 5, L, S); g.box(x0, 5, mz, 1.8, .5, L, C); } };
  wall(cx - hw, cz - hd, cx - gate, cz - hd); wall(cx + gate, cz - hd, cx + hw, cz - hd); wall(cx - hw, cz + hd, cx + hw, cz + hd); wall(cx - hw, cz - hd, cx - hw, cz + hd); wall(cx + hw, cz - hd, cx + hw, cz + hd);
  for (const s of [-1, 1]) { g.box(cx + s * gate, 0, cz - hd, 3, 7, 3, O2); g.box(cx + s * 4, 1.4, cz - hd - .6, 8, .4, .4, R); g.box(cx + s * 4, 1.4, cz - hd - .6, 2.5, .42, .42, '#f3f1e6'); }
  const tower = (x, z) => { g.box(x, 0, z, 5.6, 10, 5.6, O); g.box(x, 10, z, 7.6, .6, 7.6, C); for (const a of [-3.4, 3.4]) { g.box(x + a, 10.6, z, .4, 1.3, 7.6, O2); g.box(x, 10.6, z + a, 7.6, 1.3, .4, O2); } g.box(x, 12, z, .3, 3.2, .3, K); g.box(x, 15.2, z, 2.4, .5, 2.4, O2); for (const [a, b] of [[-2.81, 0], [2.81, 0], [0, -2.81], [0, 2.81]]) w.box(x + a, 6.6, z + b, a ? .1 : 1.8, 1.2, b ? .1 : 1.8, '#000'); };
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tower(cx + a * hw, cz + b * hd);
  // headquarters
  g.box(cx - 42, 0, cz + 22, 44, 9, 22, O); g.box(cx - 42, 9, cz + 22, 46, .7, 24, C); g.box(cx - 42, 9.7, cz + 22, 12, 3, 12, O2); for (let i = 0; i < 9; i++) for (const y of [2, 5.6]) w.box(cx - 61 + i * 4.8, y, cz + 10.95, 2.6, 1.8, .1, '#000'); g.box(cx - 42, 0, cz + 10.9, 4.6, 3.4, .3, K); g.box(cx - 42, 3.5, cz + 10, 7, .3, 3, C);
  // barracks
  for (let i = 0; i < 3; i++) { const x = cx + 26 + i * 18, z = cz + 28; g.box(x, 0, z, 13, 4.2, 28, S); g.add(new THREE.CylinderGeometry(6.5, 6.5, 28, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), O2, x, 4.2, z); for (let k = 0; k < 6; k++) w.box(x - 6.55, 1.8, z - 11 + k * 4.4, .1, 1.3, 1.6, '#000'); g.box(x, 0, z - 14.1, 2, 2.8, .2, K); }
  // hangar with an open front
  { const x = cx + 42, z = cz - 22, h = new THREE.CylinderGeometry(15, 15, 34, 22, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2); g.add(h, O2, x, 0, z); g.box(x, 0, z - 17.05, 22, 9, .3, K); g.box(x, 9.2, z - 17.1, 9, 1.6, .3, '#d6b13c'); }
  // helipad
  { const x = cx - 52, z = cz - 24; g.add(new THREE.CylinderGeometry(15, 15, .22, 32), '#6c6f70', x, .1, z); g.add(new THREE.CylinderGeometry(13.6, 13.6, .03, 32), '#e9e4d3', x, .23, z); g.add(new THREE.CylinderGeometry(12.8, 12.8, .03, 32), '#6c6f70', x, .25, z); g.box(x - 3, .28, z, 1.5, .02, 9, '#e9e4d3'); g.box(x + 3, .28, z, 1.5, .02, 9, '#e9e4d3'); g.box(x, .28, z, 6, .02, 1.5, '#e9e4d3'); }
  // sandbags, crates, flag
  for (const [x, z, n] of [[-16, -22, 8], [16, -22, 8], [-10, 6, 6], [10, 6, 6]]) for (let i = 0; i < n; i++) for (let y = 0; y < 3; y++) g.box(cx + x + (i - n / 2) * 1.3 + (y % 2) * .6, .1 + y * .5, cz + z, 1.25, .48, 1.5, y % 2 ? '#a8986f' : '#b8a97f');
  for (const [x, z] of [[-14, 30], [-9, 34], [-18, 36], [-4, 40]]) { g.box(cx + x, 0, cz + z, 3, 2.4, 3, '#6d5a36'); g.box(cx + x, 2.4, cz + z, 3.1, .25, 3.1, '#4e3f26'); }
  g.box(cx, 0, cz + 8, .35, 20, .35, '#d9d9d2'); g.box(cx + 3, 16.6, cz + 8, 6, 3.4, .1, R); g.box(cx + 3, 17.8, cz + 8, 6, 1, .12, '#f3f1e6');
  const m = g.mesh(solid); m.castShadow = m.receiveShadow = true; baseG.add(m); if (w.n) baseG.add(w.mesh(glow));
  const sign = mallSign(26, 5, (x, W2, H2) => { x.fillStyle = '#23302b'; x.fillRect(0, 0, W2, H2); x.strokeStyle = '#d6b13c'; x.lineWidth = 12; x.strokeRect(10, 10, W2 - 20, H2 - 20); x.fillStyle = '#f6c81e'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `800 ${H2 * .46}px system-ui`; x.fillText((CFG.name || 'DREAM CITY').toUpperCase() + ' BASE', W2 / 2, H2 * .54); }); sign.position.set(cx, 9.5, cz - hd - .1); sign.rotation.y = Math.PI; baseG.add(sign); { const q = new Geo(); for (const a of [-11, 11]) q.box(cx + a, 5.5, cz - hd - .1, .5, 7, .5, O2); baseG.add(q.mesh(solid)); }
  // tanks: body and turret apart, so the turret can aim
  const tank = (x, z, ry) => { const r = new THREE.Group(), b = new Geo(); for (const s of [-1, 1]) { b.box(0, 0, s * 1.75, 8.4, 1.2, 1.1, K); for (let i = 0; i < 7; i++) b.add(new THREE.CylinderGeometry(.5, .5, 1.14, 10).rotateX(Math.PI / 2), '#3f463c', -3.4 + i * 1.13, .55, s * 1.75); } b.box(0, 1.1, 0, 8, 1.2, 3.6, O); b.box(3.4, 1, 0, 1.6, .9, 3.4, O2); const mb = b.mesh(solid); mb.castShadow = true; r.add(mb); const t = new THREE.Group(), q = new Geo(); q.box(0, 0, 0, 4, 1.2, 3, O2); q.box(-.6, 1.2, .6, .9, .4, .9, K); q.add(new THREE.CylinderGeometry(.2, .24, 6, 10).rotateZ(Math.PI / 2), K, 4.7, .6, 0); q.add(new THREE.CylinderGeometry(.3, .3, .8, 10).rotateZ(Math.PI / 2), K, 7.6, .6, 0); const mt = q.mesh(solid); mt.castShadow = true; t.add(mt); t.position.y = 2.3; r.add(t); const f = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd768' })); f.position.set(8.8, .6, 0); f.visible = false; t.add(f); r.position.set(x, 0, z); r.rotation.y = ry; baseG.add(r); baseGuns.push({ root: r, turret: t, flash: f }); };
  tank(cx - 20, cz - 34, Math.PI / 2); tank(cx + 20, cz - 34, Math.PI / 2); tank(cx - 34, cz - 10, Math.PI / 2 + .1); tank(cx + 14, cz - 6, Math.PI / 2 - .2);
}
function pack(geo, mat, keepPos = false) { // half the memory per corner; the browser's copy is dropped once the graphics card has it
  const n = geo.n * 3, q = new THREE.BufferGeometry(), N = new Int8Array(n), C = new Uint8Array(n), drop = function () { this.array = new this.array.constructor(1); };
  for (let i = 0; i < n; i++) { N[i] = Math.round(geo.m[i] * 127); C[i] = Math.round(Math.min(1, geo.c[i]) * 255); }
  const P = new THREE.BufferAttribute(geo.p.slice(0, n), 3), a = new THREE.BufferAttribute(N, 3, true), b = new THREE.BufferAttribute(C, 3, true);
  q.setAttribute('position', P); q.setAttribute('normal', a); q.setAttribute('color', b); q.computeBoundingSphere(); a.onUpload(drop); b.onUpload(drop); if (!keepPos) P.onUpload(drop);
  return new THREE.Mesh(q, mat);
}
function packGlow(geo, keepPos = false) { const q = new THREE.BufferGeometry(), P = new THREE.BufferAttribute(geo.p.slice(0, geo.n * 3), 3); q.setAttribute('position', P); q.computeBoundingSphere(); if (!keepPos) P.onUpload(function () { this.array = new Float32Array(3); }); return new THREE.Mesh(q, glow); }
for (const c of chunks.values()) {
  const m = pack(c.g, solid); m.castShadow = m.receiveShadow = true; scene.add(m); c.gm = m;
  if (c.w.n) { c.wm = packGlow(c.w); scene.add(c.wm); }
  if (c.f.n) { c.fm = pack(c.f, solid); c.fm.castShadow = c.fm.receiveShadow = true; scene.add(c.fm); }
  if (c.fw.n) { c.fwm = packGlow(c.fw); scene.add(c.fwm); }
  c.g = c.w = c.f = c.fw = null;
}
const DETAIL_RANGE = 340, NEAR_RANGE = 430, NEAR_MAX = PHONE ? 12 : 24;
function nearBuild(c) {
  if (c.near || !c.homes.length) return; const g = new Geo(), w = new Geo(), d = new Geo(), hits = c.hit ? null : []; g.hits = d.hits = hits;
  for (const h of c.homes) { g.at(h.x, h.z, h.flip); w.at(h.x, h.z, h.flip); det = d.at(h.x, h.z, h.flip); const n0 = [g.n, w.n, d.n]; house(g, w, h); h.slice = { c, g: [n0[0], g.n], w: [n0[1], w.n], d: [n0[2], d.n] }; g.at(0, 0); w.at(0, 0); d.at(0, 0); det = null; }
  if (hits) { c.hit = new Float32Array(hits); carQueue.push(c.hit); } g.hits = d.hits = null;
  c.nm = pack(g, solid, true); c.nm.castShadow = c.nm.receiveShadow = true; scene.add(c.nm); if (w.n) { c.nw = packGlow(w, true); scene.add(c.nw); } if (d.n) { c.nd = pack(d, solid, true); c.nd.receiveShadow = true; scene.add(c.nd); }
  if (c.fm) c.fm.visible = false; if (c.fwm) c.fwm.visible = false; c.near = true;
}
function nearDrop(c) { for (const k of ['nm', 'nw', 'nd']) if (c[k]) { scene.remove(c[k]); c[k].geometry.dispose(); c[k] = null; } for (const h of c.homes) h.slice = null; if (c.fm) c.fm.visible = true; if (c.fwm) c.fwm.visible = true; c.near = false; }
function nearAround(x, z, r) { for (const c of chunks.values()) if (Math.hypot(c.cx - x, c.cz - z) < r) nearBuild(c); }
function updateDetail() {
  if (room.on) return; const list = []; for (const c of chunks.values()) if (c.homes.length) list.push([Math.hypot(c.cx - view.x, c.cz - view.z), c]); list.sort((a, b) => a[0] - b[0]);
  let held = 0, todo = null; for (const [d, c] of list) { const want = d < NEAR_RANGE && held < NEAR_MAX; if (want) { held++; if (!c.near && !todo) todo = c; } else if (c.near && !show && (d > NEAR_RANGE * 1.25 || held >= NEAR_MAX)) nearDrop(c); else if (c.near) held++; }
  if (todo) nearBuild(todo);
  for (const c of chunks.values()) if (c.nd) c.nd.visible = Math.hypot(c.cx - camera.position.x, c.cz - camera.position.z) < DETAIL_RANGE;
}
function civic({ kind, lot }) { // public buildings on two lots side by side
  const flip = lot.side > 0 ? -1 : 1, c = chunk(lot.x, lot.z), g = c.g.at(lot.x, lot.z, flip), w = c.w.at(lot.x, lot.z, flip), cx = 6.5 * flip, here = { x: lot.x, z: lot.z, flip }, W = 21, f = 4;
  const rows2 = (n, y0, r2, dy) => { for (let j = 0; j < r2; j++) for (let i = 0; i < n; i++) w.box(cx - W / 2 + (i + .5) * W / n, y0 + j * dy, f + .04, 1.5, 1.5, .1, '#000'); };
  g.box(cx, .02, f + 2, 8, .07, 4.2, '#c6bda9');
  if (kind === 'police') {
    g.box(cx, 0, 0, W, 8, 8, '#2f4a78'); g.box(cx, 8, 0, W + .5, .4, 8.5, '#f3f1ea'); g.box(cx, 0, f + .6, 5.4, 3.2, 1.3, '#f3f1ea'); g.box(cx, 0, f + 1.26, 1.8, 2.6, .1, '#1c2c44'); rows2(7, 4.4, 1, 0); rows2(6, 1.2, 1, 0);
    g.box(cx + 3.4, 0, f + 1.4, .16, 4.6, .16, '#23252b'); c.w.box(cx + 3.4, 4.6, f + 1.4, .6, .6, .6, '#000'); plate(here, cx, 8.7, f + .34, 'POLICE', 7);
    g.box(cx - 7, 8.4, 0, .16, 4, .16, '#e8e8e4'); g.box(cx - 6, 11.3, 0, 2, 1.1, .08, '#2e5c8a');
  }
  if (kind === 'hospital') {
    g.box(cx, 0, 0, W, 11, 8, '#f4f4ee'); g.box(cx, 11, 0, W + .4, .4, 8.4, '#c8d6dc'); rows2(7, 7.9, 1, 0); rows2(7, 4.6, 1, 0); rows2(5, 1.3, 1, 0);
    g.box(cx, 0, f + 1.6, 9, .3, 3.4, '#c9c2b4'); g.box(cx, 3, f + 1.6, 9.6, .4, 3.8, '#d8352b'); for (const x of [-4.2, 4.2]) g.box(cx + x, 0, f + 3, .3, 3, .3, '#f3f1ea'); g.box(cx, 0, f + .1, 3, 2.7, .1, '#31566c');
    g.box(cx, 13.2, f + .1, 3.4, 1, .12, '#d8352b'); g.box(cx, 12, f + .1, 1, 3.4, .12, '#d8352b'); plate(here, cx, 3.75, f + 3.5, 'HOSPITAL', 7.6);
    g.add(new THREE.CylinderGeometry(4.2, 4.2, .1, 20), '#3f4c54', cx - 3, 11.5, 0); g.box(cx - 4, 11.6, 0, .4, .04, 3, '#f3f1ea'); g.box(cx - 2, 11.6, 0, .4, .04, 3, '#f3f1ea'); g.box(cx - 3, 11.6, 0, 2.2, .04, .4, '#f3f1ea');
  }
  if (kind === 'fire') {
    g.box(cx, 0, 0, W, 6.6, 8, '#a33a2c'); g.box(cx, 6.6, 0, W + .5, .5, 8.6, '#7a2a20'); g.box(cx + W / 2 - 2.4, 0, -1, 4.4, 13, 5, '#8c3026'); g.box(cx + W / 2 - 2.4, 13, -1, 5, .5, 5.6, '#5c1f18');
    for (const x of [-7, 0, 7].map(a => a - 1)) { g.box(cx + x, 0, f + .05, 5.6, 4.8, .1, '#d8352b'); for (let y = .9; y < 4.8; y += .95) g.box(cx + x, y, f + .12, 5.4, .1, .06, '#f3f1ea'); }
    plate(here, cx - 1, 5.75, f + .34, 'FIRE STATION', 12); g.box(cx, .02, f + 2, 21, .07, 4, '#c8c2b4');
  }
  c.g.at(0, 0); c.w.at(0, 0);
}
for (const h of houses) h.plated = true;
for (const p of PLATES) { // name boards painted on a few special buildings
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 96; const x = cv.getContext('2d'); paintWood(x, 384, 96, '#7a4f2e', 2, 5); x.strokeStyle = '#2e1b0e'; x.lineWidth = 7; x.strokeRect(3, 3, 378, 90); x.fillStyle = '#f6c81e'; let sz = 60; x.font = `900 ${sz}px Arial Black, Arial, sans-serif`; while (x.measureText(p.text).width > 350 && sz > 20) { sz -= 2; x.font = `900 ${sz}px Arial Black, Arial, sans-serif`; } x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(p.text, 192, 50);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(p.width, p.width / 4), new THREE.MeshLambertMaterial({ map: t })); m.position.set(p.x, p.y, p.z); m.rotation.y = p.flip > 0 ? 0 : Math.PI; scene.add(m);
}
const baseMesh = pack(base, solid); baseMesh.castShadow = baseMesh.receiveShadow = true; scene.add(baseMesh); base.p = base.m = base.c = null;
if (lit.n) scene.add(lit.mesh(glow));

/* ---------- trees, cows, cars ---------- */
function instanced(build, n, shadow = true) {
  const g = new Geo(); build(g); const src = g.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const m = new THREE.InstancedMesh(src.geometry, src.material, n); m.castShadow = shadow; m.receiveShadow = false; m.frustumCulled = false; scene.add(m); return m;
}
(() => {
  const r = rng(77), pts = [];
  const free = (x, z) => {
    if (Math.abs(x) < 54 && Math.abs(z) < 38) return false;
    if (Math.abs(z - riverZ(x)) < 15) return false;
    for (const [m] of aves) if (Math.abs(x - m * AVE) < 7.5) return false;
    return true;
  };
  for (const h of lots) if (r() < .34) { const x = h.x + 6.4, z = h.z + (r() - .5) * 8 - h.side * 2; if (free(x, z)) pts.push([x, z, .7 + r() * .5, 1]); }
  const want = Math.min(7000, 3400 + lots.length);
  for (let t = 0; pts.length < want && t < want * 8; t++) {
    const a = r() * 6.283, d = townR - 6 + Math.pow(r(), 1.5) * 640, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!free(x, z) || (Math.abs(x) < 125 && z < -540 && z > -690)) continue;
    const y = height(x, z); if (y > 66 || y < -.5) continue;
    if (fbm(x / 90, z / 90, 2) < .4 && d < townR + 90) continue;
    pts.push([x, z, .9 + r() * .9, 0]);
  }
  const pine = instanced(g => { g.add(new THREE.CylinderGeometry(.3, .4, 1.8, 5), '#5c3f2a', 0, .9, 0); g.add(new THREE.ConeGeometry(2.3, 4.2, 6), '#ffffff', 0, 3.6, 0); g.add(new THREE.ConeGeometry(1.7, 3.6, 6), '#ffffff', 0, 5.6, 0); g.add(new THREE.ConeGeometry(1.1, 2.8, 6), '#ffffff', 0, 7.4, 0); }, pts.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
  pts.forEach(([x, z, s], i) => {
    Q.setFromAxisAngle(UP, r() * 6); S.set(s, s * (.9 + r() * .4), s); P.set(x, Math.max(0, height(x, z)), z);
    if (Math.hypot(x, z) < townR + 60) sceneHits.push(x - .45 * s, x + .45 * s, z - .45 * s, z + .45 * s);
    pine.setMatrixAt(i, M.compose(P, Q, S)); C.setHSL(.37 + r() * .05, .42 + r() * .14, .2 + r() * .09); pine.setColorAt(i, C);
  });
  pine.instanceMatrix.needsUpdate = true; pine.instanceColor.needsUpdate = true; front0.pine = pine; front0.pts = pts;
  // cows on the meadow beside the river
  const cows = instanced(g => { g.box(0, .7, 0, .9, .85, 2, '#ffffff'); g.box(0, .95, 1.25, .62, .62, .7, '#ffffff'); for (const a of [-.3, .3]) for (const b of [-.7, .7]) g.box(a, 0, b, .2, .75, .2, '#ffffff'); g.box(0, .6, 1.25, .16, .25, .16, '#e0b53c'); }, 12);
  for (let i = 0; i < 12; i++) {
    const x = -64 + i * 13 + r() * 6, z = riverZ(x) - 15 - r() * 3; Q.setFromAxisAngle(UP, r() * 6); S.setScalar(1.15); P.set(x, 0, z);
    sceneHits.push(x - 1.5, x + 1.5, z - 1.5, z + 1.5);
    cows.setMatrixAt(i, M.compose(P, Q, S)); cows.setColorAt(i, C.set(i % 3 ? '#8a5a3a' : '#e9e4d8'));
  }
})();
if (plots.length) { // one texture, many boards
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const x = cv.getContext('2d');
  paintWood(x, 256, 128, '#9a6a3c', 2, 9); x.strokeStyle = '#3a2616'; x.lineWidth = 8; x.strokeRect(4, 4, 248, 120); carve(x, 'FREE', 128, 68, 214, 78, '#f6c81e');
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(2.8, 1.4, .1), new THREE.MeshLambertMaterial({ map: t }), plots.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), U = new THREE.Vector3(0, 1, 0);
  plots.forEach((p, i) => { Q.setFromAxisAngle(U, p.flip > 0 ? 0 : Math.PI); V.set(p.x - 3.3 * p.flip, 1.7, p.z + 4.25 * p.flip); sceneHits.push(V.x - 1.4, V.x + 1.4, V.z - .1, V.z + .1); m.setMatrixAt(i, M.compose(V, Q, S)); });
  m.castShadow = true; m.frustumCulled = false; scene.add(m);
}
const carSet = rowSegs.filter(r => r.b - r.a > 60).slice(0, 10);
const cars = [];
const aveSet = [...aves.entries()].filter(([, A]) => A.max - A.min > 60).slice(0, 6);
const CARS = Math.max(7, Math.min(28, carSet.length * 2 + aveSet.length * 3));
/* vehicle models: a body that takes the paint colour, plus a trim layer (glass, wheels, lights) that keeps its own colours */
const GLASS = '#22303a', TYRE = '#15171a', RIM = '#c9ced3', CHROME = '#dfe3e6', BLACK = '#26292e';
function prism(g, pts, zb, zt, hex) { // side outline pts (anticlockwise), half width zb at the bottom narrowing to zt at the top
  const c = rgb(hex), ys = pts.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), wd = y => zb + (zt - zb) * (y - lo) / (hi - lo || 1), v = (p, s) => [p[0], p[1], s * wd(p[1])];
  for (let i = 1; i < pts.length - 1; i++) { g.tri(v(pts[0], 1), v(pts[i], 1), v(pts[i + 1], 1), c); g.tri(v(pts[0], -1), v(pts[i + 1], -1), v(pts[i], -1), c); }
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; g.quad(v(p, 1), v(p, -1), v(q, -1), v(q, 1), c); });
}
function wheel(t, x, hw, r = .36) {
  for (const s of [-1, 1]) {
    const z = s * (hw - .1), cyl = (a, b) => new THREE.CylinderGeometry(a, a, b, 14).rotateX(Math.PI / 2);
    t.add(cyl(r + .08, .03), '#101214', x, r + .01, s * (hw + .012)); t.add(cyl(r, .3), TYRE, x, r, z); t.add(cyl(r * .62, .32), RIM, x, r, z); t.add(cyl(r * .22, .34), '#6d7277', x, r, z);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.2832; t.box(x + Math.cos(a) * r * .4, r + Math.sin(a) * r * .4 - .03, z + s * .16, .06, .06, .02, '#6d7277'); }
  }
}
function cabin(b, t, cab, zb, zt, hex, pillar = true) { // roof and pillars in paint, glass set into every side
  prism(b, cab, zb, zt, hex);
  const [rb, fb, ft, rt] = cab, lo = fb[1], hi = ft[1], yb = lo + .07, yt = hi - .06, fx = y => fb[0] + (ft[0] - fb[0]) * (y - lo) / (hi - lo), rx = y => rb[0] + (rt[0] - rb[0]) * (y - lo) / (hi - lo), wd = y => zb + (zt - zb) * (y - lo) / (hi - lo);
  const pane = (x0a, x1a, x0b, x1b) => { const e = .014, za = zb + (zt - zb) * (yb - lo) / (hi - lo) + e, zc = zb + (zt - zb) * (yt - lo) / (hi - lo) + e, c = rgb(GLASS); t.quad([x0a, yb, za], [x1a, yb, za], [x1b, yt, zc], [x0b, yt, zc], c); t.quad([x0a, yb, -za], [x0b, yt, -zc], [x1b, yt, -zc], [x1a, yb, -za], c); };
  const m = (rb[0] + rt[0] + fb[0] + ft[0]) / 4 - .08, front0 = fx(yb) - .1, front1 = fx(yt) - .1, rear0 = rx(yb) + .1, rear1 = rx(yt) + .1;
  if (pillar) { pane(rear0, m - .05, rear1, m - .05); pane(m + .05, front0, m + .05, front1); } else pane(rear0, front0, rear1, front1);
  const z0 = wd(yb) - .08, z1 = wd(yt) - .08, cc = rgb(GLASS), f = .014;
  t.quad([fx(yb) + f, yb, z0], [fx(yb) + f, yb, -z0], [fx(yt) + f, yt, -z1], [fx(yt) + f, yt, z1], cc); t.quad([rx(yb) - f, yb, -z0], [rx(yb) - f, yb, z0], [rx(yt) - f, yt, z1], [rx(yt) - f, yt, -z1], cc);
  t.box(fx(yb) + .02, yb, .25, .03, .03, .5, BLACK); t.box(fx(yb) + .02, yb, -.3, .03, .03, .5, BLACK);
}
function nose(t, L, hw, y, hex = '#fff3c4') { // lights, grille, bumpers, plates, shared by most cars
  for (const s of [-1, 1]) { t.box(L, y, s * (hw - .28), .09, .17, .36, hex); t.box(L + .03, y + .01, s * (hw - .28), .04, .09, .24, '#fffbe6'); t.box(-L, y + .02, s * (hw - .26), .09, .17, .42, '#b81c1a'); t.box(-L - .03, y + .02, s * (hw - .26), .04, .07, .18, '#f07a2a'); }
  t.box(L, y - .02, 0, .07, .16, hw * .85, BLACK); for (let i = -3; i <= 3; i++) t.box(L + .03, y - .02, i * hw * .11, .03, .13, .03, CHROME);
  t.box(L + .02, .32, 0, .14, .15, hw * 1.96, BLACK); t.box(-L - .02, .32, 0, .14, .15, hw * 1.96, BLACK); t.box(L + .1, .33, 0, .03, .1, .46, '#f3f1ea'); t.box(-L - .1, .33, 0, .03, .1, .46, '#f6c81e');
}
function doors(t, x0, xm, x1, hw, y0, y1) { // panel lines and handles along the sides
  for (const s of [-1, 1]) { for (const x of [x0, xm, x1]) if (x !== null) t.box(x, y0, s * (hw + .006), .018, y1 - y0, .012, '#1b1e22'); for (const x of [xm + .16, x0 + .16]) t.box(x, y1 - .1, s * (hw + .02), .2, .05, .04, CHROME); t.box((x0 + x1) / 2, .34, s * hw, x1 - x0 + 1.2, .09, .05, BLACK); }
}
function mirrors(b, x, hw, y, hex) { for (const s of [-1, 1]) { b.box(x, y, s * (hw + .12), .13, .13, .24, hex); } }
const CAR_MODELS = [
  (b, t, c) => { // saloon
    prism(b, [[-1.85, .28], [1.85, .28], [1.92, .48], [1.84, .7], [1, .8], [-1.25, .86], [-1.84, .84], [-1.92, .52]], .84, .78, c);
    cabin(b, t, [[-1.42, .84], [.98, .8], [.24, 1.36], [-.9, 1.36]], .76, .58, c); nose(t, 1.92, .84, .6); doors(t, -.95, .08, 1.05, .82, .42, .8); mirrors(b, .72, .78, .9, c); wheel(t, 1.15, .86); wheel(t, -1.15, .86);
  },
  (b, t, c) => { // hatchback
    prism(b, [[-1.58, .28], [1.62, .28], [1.68, .5], [1.6, .74], [.86, .84], [-1.5, .9], [-1.62, .54]], .82, .76, c);
    cabin(b, t, [[-1.54, .88], [.84, .84], [.16, 1.42], [-1.32, 1.42]], .74, .58, c); nose(t, 1.68, .82, .62); doors(t, -.72, .12, 1, .8, .42, .82); mirrors(b, .62, .76, .94, c); wheel(t, 1, .84, .34); wheel(t, -1, .84, .34); b.box(-1.26, 1.42, 0, .32, .06, 1.1, c);
  },
  (b, t, c) => { // 4x4
    prism(b, [[-1.9, .4], [1.92, .4], [1.98, .66], [1.9, .96], [1.05, 1.06], [-1.9, 1.08], [-1.96, .66]], .92, .86, c);
    cabin(b, t, [[-1.84, 1.06], [1.02, 1.06], [.5, 1.74], [-1.72, 1.74]], .84, .7, c); nose(t, 1.98, .92, .8); doors(t, -.9, .12, 1.08, .9, .52, 1.04); mirrors(b, .86, .84, 1.2, c); wheel(t, 1.2, .94, .46); wheel(t, -1.2, .94, .46);
    for (const s of [-1, 1]) { t.box(-.6, 1.8, s * .58, 2.2, .05, .05, CHROME); for (const x of [-1.6, -.6, .4]) t.box(x, 1.74, s * .58, .05, .07, .05, CHROME); t.box(0, .42, s * .98, 2.2, .06, .14, CHROME); }
    for (let i = 0; i < 4; i++) t.box(-.9 + i * .5, 1.8, 0, .05, .04, 1.16, BLACK); const sp = new THREE.CylinderGeometry(.42, .42, .22, 14).rotateZ(Math.PI / 2); t.add(sp, TYRE, -2.08, .98, 0); t.add(new THREE.CylinderGeometry(.24, .24, .24, 12).rotateZ(Math.PI / 2), RIM, -2.09, .98, 0);
  },
  (b, t, c) => { // pickup with an open load bed
    prism(b, [[-2.1, .36], [2.02, .36], [2.08, .6], [2, .88], [1.15, .96], [.3, .98], [-2.1, .98]], .88, .84, c);
    cabin(b, t, [[-.42, .96], [1.12, .96], [.62, 1.56], [-.36, 1.56]], .8, .66, c, false); nose(t, 2.08, .88, .72); doors(t, -.3, .32, 1.1, .86, .5, .94); mirrors(b, .95, .8, 1.08, c); wheel(t, 1.28, .9, .42); wheel(t, -1.3, .9, .42);
    t.box(-1.28, .86, 0, 1.56, .14, 1.46, '#1c1f23'); for (const z of [-.5, 0, .5]) t.box(-1.28, 1.0, z, 1.52, .025, .06, '#3a3f45'); t.box(-1.2, 1, .1, .8, .34, .62, '#a97c49'); t.box(-1.2, 1.34, .1, .84, .04, .66, '#7a5a34'); for (const s of [-1, 1]) t.box(-1.28, .98, s * .85, 1.6, .05, .05, CHROME);
  },
  (b, t, c) => { // delivery van
    prism(b, [[-2, .3], [2, .3], [2.06, .62], [1.98, .92], [1.52, 1.08], [.88, 1.86], [.7, 1.92], [-1.96, 1.92], [-2.04, .6]], .9, .84, c);
    const g0 = rgb(GLASS), y0 = 1.14, y1 = 1.76; t.quad([1.46, y0, .86], [1.48, y0, -.86], [.92, y1, -.82], [.92, y1, .82], g0); for (const s of [-1, 1]) { const z = s * .9; const q = s > 0 ? (a, b2, c2, d) => t.quad(a, b2, c2, d, g0) : (a, b2, c2, d) => t.quad(d, c2, b2, a, g0); q([.56, y0, z], [1.34, y0, z], [.88, y1, z - s * .03], [.56, y1, z - s * .03]); }
    nose(t, 2.06, .9, .68); for (const s of [-1, 1]) { t.box(.3, .3, s * .91, .02, 1.5, .012, '#1b1e22'); t.box(-1.1, .95, s * .91, 1.2, 1.1, .012, '#ffffff'); t.box(-1.1, 1.05, s * .92, .84, .2, .012, '#2e5c8a'); t.box(-1.1, .78, s * .92, .84, .12, .012, '#d8352b'); t.box(.46, 1, s * .93, .2, .05, .04, CHROME); }
    t.box(-2.04, 1.1, 0, .03, 1.5, .02, '#1b1e22'); for (const s of [-1, 1]) t.box(-2.05, 1.4, s * .42, .03, .5, .6, GLASS); mirrors(b, 1.4, .86, 1.2, c); wheel(t, 1.28, .92, .4); wheel(t, -1.22, .92, .4);
  },
  (b, t, c) => { // taxi: saloon with a chequered band and a lit roof sign
    CAR_MODELS[0](b, t, c); for (const s of [-1, 1]) for (let i = 0; i < 16; i++) { t.box(-1.75 + i * .235, .6, s * .85, .118, .09, .012, i % 2 ? '#14171a' : '#f3f1ea'); t.box(-1.75 + i * .235 + .118, .51, s * .85, .118, .09, .012, i % 2 ? '#14171a' : '#f3f1ea'); }
    t.box(-.32, 1.36, 0, .34, .24, .96, '#fff6c9'); t.box(-.32, 1.42, 0, .36, .1, .98, '#14171a'); for (const z of [-.3, -.1, .1, .3]) t.box(-.32, 1.43, z, .37, .07, .1, '#f6c81e');
  },
  (b, t, c) => { // sports car
    prism(b, [[-1.9, .22], [1.95, .22], [2.04, .36], [1.92, .54], [.9, .72], [-1.2, .8], [-1.9, .76], [-1.96, .46]], .92, .84, c);
    cabin(b, t, [[-1.16, .78], [.84, .72], [.08, 1.14], [-.74, 1.14]], .78, .56, c, false); nose(t, 2.04, .92, .46); doors(t, -.7, .1, .9, .9, .36, .72); mirrors(b, .62, .8, .84, c); wheel(t, 1.22, .94, .34); wheel(t, -1.22, .94, .36);
    t.box(-1.9, 1, 0, .34, .05, 1.7, BLACK); for (const s of [-1, 1]) { t.box(-1.82, .86, s * .68, .08, .24, .06, BLACK); t.box(-.5, .5, s * .93, .9, .16, .03, BLACK); t.box(-1.98, .28, s * .3, .2, .1, .1, CHROME); } for (let i = 0; i < 3; i++) t.box(1.1 + i * .2, .7 - i * .05, 0, .1, .02, .5, BLACK);
  },
];
function modelMeshes(build, n) { // paint and trim instanced together, moved as one
  const b = new Geo(), t = new Geo(); build(b, t, '#ffffff'); const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true }), body = new THREE.InstancedMesh(b.mesh(mat()).geometry, mat(), n), trim = new THREE.InstancedMesh(t.mesh(mat()).geometry, mat(), n);
  for (const m of [body, trim]) { m.frustumCulled = false; scene.add(m); } body.castShadow = true;
  return { body, trim, set(i, M) { body.setMatrixAt(i, M); trim.setMatrixAt(i, M); }, done() { body.instanceMatrix.needsUpdate = true; trim.instanceMatrix.needsUpdate = true; } };
}
const slotsFor = (n, kinds, k) => Math.floor((n - k - 1) / kinds) + 1; // exact counts: an unused slot would sit black at the origin
const carKinds = CAR_MODELS.map((f, k) => modelMeshes(f, slotsFor(CARS, CAR_MODELS.length, k)));
for (let i = 0; i < CARS; i++) {
  const useAve = aveSet.length && (i % 3 === 2 || !carSet.length), dir = i % 2 ? 1 : -1, t = (i * .37) % 1, v = 8 + (i % 4) * 2;
  if (useAve) { const [m, A] = aveSet[i % aveSet.length]; cars.push({ ax: 'z', at: m * AVE + (dir > 0 ? 1.7 : -1.7), dir, min: A.min, max: A.max, t, v }); }
  else { const r = carSet[i % carSet.length] || { k: 1, a: -60, b: 60 }; cars.push({ ax: 'x', at: r.k * ROW + (dir > 0 ? -1.7 : 1.7), dir, min: r.a, max: r.b, t, v }); }
  cars[i].kind = carKinds[i % CAR_MODELS.length]; cars[i].slot = Math.floor(i / CAR_MODELS.length); cars[i].kind.body.setColorAt(cars[i].slot, new THREE.Color(i % CAR_MODELS.length === 5 ? '#f6c81e' : ['#d8352b', '#f3f1ea', '#2e5c8a', '#2a3a35', '#d8a22c', '#3f8a6a', '#1f2a44', '#c9ced3', '#7a2a3a'][(i * 5) % 9]));
}
const carPitch = new THREE.Quaternion(), carSide = new THREE.Vector3(0, 0, 1), carM = new THREE.Matrix4(), carQ = new THREE.Quaternion(), carA = new THREE.Vector3(0, 1, 0), carS = new THREE.Vector3(1, 1, 1), carP = new THREE.Vector3();
function moveCars(dt) { // left-hand traffic; cars shrink away at the end of a road instead of popping
  cars.forEach((c, i) => {
    c.t = (c.t + dt * c.v / Math.max(30, c.max - c.min)) % 1;
    const s = c.dir > 0 ? c.t : 1 - c.t, q = c.min + (c.max - c.min) * s, e = clamp(Math.min(q - c.min, c.max - q) / 6, .001, 1);
    if (c.ax === 'x') { carP.set(q, .1, c.at); carQ.setFromAxisAngle(carA, c.dir > 0 ? 0 : Math.PI); }
    else { const y = deckY(c.at, q), up = Math.atan((deckY(c.at, q + c.dir) - y) / 1); carP.set(c.at, .22 * (y > 0 ? 1 : 0) + .1 + y, q); carQ.setFromAxisAngle(carA, c.dir > 0 ? -Math.PI / 2 : Math.PI / 2).multiply(carPitch.setFromAxisAngle(carSide, up)); }
    carS.setScalar(e); c.kind.set(c.slot, carM.compose(carP, carQ, carS));
  });
  carKinds.forEach(k => k.done());
}
/* police, ambulance and fire engine: they drive the same roads as everyone else, with flashing lights */
const fleet = [], lightGlow = new THREE.CanvasTexture(glowCv);
function t3(g, s) { for (let i = 0; i < 4; i++) { const x = -3 + i * 1.34; g.box(x, 1.12, s * 1.03, 1.2, 1.04, .02, '#d9dde0'); for (let j = 1; j < 7; j++) g.box(x, .58 + j * .15, s * 1.04, 1.18, .02, .02, '#aeb3b8'); g.box(x + .4, .72, s * 1.05, .2, .06, .03, BLACK); } g.box(-.9, 1.82, s * 1.03, 4.6, .14, .02, '#f6c81e'); g.box(-.9, .54, s * 1.03, 4.6, .1, .02, '#f6c81e'); }
function vehicle(kind, i) {
  const g = new Geo(), root = new THREE.Group(), flash = [];
  if (kind === 'police') { // patrol saloon with the blue band and a checked stripe
    CAR_MODELS[0](g, g, '#f3f1ea');
    for (const s of [-1, 1]) { g.box(0, .5, s * .845, 3.5, .2, .02, '#2e5c8a'); for (let i = 0; i < 12; i++) g.box(-1.7 + i * .31, .64, s * .842, .155, .08, .02, i % 2 ? '#f6c81e' : '#2e5c8a'); }
    g.box(1.4, .81, 0, .8, .03, 1.2, '#2e5c8a'); g.box(-.34, 1.37, 0, 1, .03, 1, '#2e5c8a');
  }
  if (kind === 'ambulance') { // box-body ambulance with a Battenburg side
    prism(g, [[.6, .3], [2.3, .3], [2.36, .62], [2.26, .9], [1.74, 1.02], [1.2, 1.74], [.6, 1.8]], .94, .88, '#f7f7f4'); g.box(-.75, .3, 0, 2.8, 1.9, 1.94, '#f7f7f4');
    nose(g, 2.36, .94, .68); wheel(g, 1.5, .96, .42); wheel(g, -1.3, .96, .42); mirrors(g, 1.7, .9, 1.2, '#f7f7f4');
    const gl = rgb(GLASS); g.quad([1.72, 1.08, .86], [1.72, 1.08, -.86], [1.26, 1.66, -.8], [1.26, 1.66, .8], gl); for (const s of [-1, 1]) { g.box(1.2, 1.36, s * .92, .62, .5, .02, GLASS); g.box(-.75, 1.72, s * .98, 2.2, .3, .02, '#2f7d4a'); }
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) { g.box(-2.05 + i * .32, 1.0, s * .975, .32, .24, .02, i % 2 ? '#f6e24a' : '#2f7d4a'); g.box(-2.05 + i * .32, .76, s * .975, .32, .24, .02, i % 2 ? '#2f7d4a' : '#f6e24a'); }
    for (const s of [-1, 1]) { g.box(-.75, 1.42, s * .985, .5, .16, .02, '#d8352b'); g.box(-.75, 1.42, s * .985, .16, .5, .02, '#d8352b'); } g.box(-.75, 2.2, 0, 1.4, .02, .44, '#d8352b'); g.box(-.75, 2.2, 0, .44, .02, 1.4, '#d8352b');
    g.box(-2.16, 1.25, 0, .03, 1.7, .03, '#1b1e22'); for (const s of [-1, 1]) g.box(-2.17, 1.6, s * .45, .03, .5, .6, GLASS); g.box(-2.24, .4, 0, .2, .1, 1.5, '#3a3f45');
  }
  if (kind === 'fire') { // fire engine with lockers, hose reel and a roof ladder
    g.box(-.9, .46, 0, 4.7, 1.72, 2.04, '#c8201e'); prism(g, [[1.5, .46], [3.4, .46], [3.46, .8], [3.36, 1.2], [3.1, 2.3], [1.5, 2.36]], 1.04, .98, '#c8201e');
    const gl = rgb(GLASS); g.quad([3.3, 1.34, .92], [3.3, 1.34, -.92], [3.12, 2.2, -.9], [3.12, 2.2, .9], gl); for (const s of [-1, 1]) { g.box(2.5, 1.68, s * 1.03, 1.2, .62, .02, GLASS); g.box(2.45, .8, s * 1.04, .02, 1.5, .02, '#7a1412'); }
    for (const s of [-1, 1]) { t3(g, s); }
    nose(g, 3.46, 1.04, .86); g.box(3.5, .92, 0, .05, .3, 1.2, CHROME); for (let i = -4; i <= 4; i++) g.box(3.52, .92, i * .13, .03, .26, .04, BLACK); wheel(g, 2.4, 1.06, .46); wheel(g, -.6, 1.06, .46); wheel(g, -2, 1.06, .46); mirrors(g, 3.1, 1, 1.9, BLACK);
    for (const s of [-1, 1]) { g.box(-1, 2.2, s * .5, 4.6, .1, .1, '#d4d6d8'); } for (let a = -3.2; a < 1.2; a += .4) g.box(a, 2.26, 0, .07, .07, 1, '#d4d6d8'); g.box(-3.2, 1.6, 0, .36, .9, 1.5, '#7a1412'); g.add(new THREE.CylinderGeometry(.34, .34, 1.1, 12).rotateX(Math.PI / 2), '#e8c04a', -3.3, 1.4, 0);
  }
  root.add(g.mesh(solid)); root.children[0].castShadow = true;
  const bar = kind === 'fire' ? [[2.6, 2.5], [-3, 2.2]] : kind === 'ambulance' ? [[1.3, 1.92], [-1.9, 2.28]] : [[-.32, 1.56]];
  for (const [x, y] of bar) for (const [z, c] of [[-.5, kind === 'police' ? 0x2f6cff : 0xff2a22], [.5, kind === 'police' ? 0xff2a22 : 0x2f6cff]]) { const l = new THREE.Group(), lens = new THREE.Mesh(new THREE.BoxGeometry(.62, .32, .78), new THREE.MeshBasicMaterial({ color: c })), halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: lightGlow, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .95, fog: false })); halo.scale.set(6.5, 6.5, 1); l.add(lens, halo); l.position.set(x, y, z); root.add(l); lens.userData.c = c; flash.push({ l, lens, halo }); const base2 = new THREE.Mesh(new THREE.BoxGeometry(.66, .1, 1.7), new THREE.MeshBasicMaterial({ color: 0x20262b })); base2.position.set(x, y - .18, 0); root.add(base2); }
  scene.add(root);
  const useAve = i % 2 && aveSet.length, dir = i % 3 ? 1 : -1, t = (i * .23 + .1) % 1, v = kind === 'fire' ? 12 : 15;
  if (useAve) { const [m, A] = aveSet[i % aveSet.length]; fleet.push({ root, flash, ax: 'z', at: m * AVE + (dir > 0 ? 1.7 : -1.7), dir, min: A.min, max: A.max, t, v }); }
  else { const r = carSet[(i * 2 + 1) % Math.max(1, carSet.length)] || { k: 1, a: -60, b: 60 }; fleet.push({ root, flash, ax: 'x', at: r.k * ROW + (dir > 0 ? -1.7 : 1.7), dir, min: r.a, max: r.b, t, v }); }
}
['police', 'police', 'ambulance', 'fire', 'police'].forEach(vehicle);
function placeOnRoad(c, q) { // follows the road, including the climb over a bridge
  if (c.ax === 'x') { c.root.position.set(q, .1, c.at); c.root.rotation.set(0, c.dir > 0 ? 0 : Math.PI, 0); return; }
  const y = deckY(c.at, q), up = Math.atan(deckY(c.at, q + c.dir) - y); c.root.position.set(c.at, .1 + y + (y > 0 ? .22 : 0), q); c.root.rotation.set(0, c.dir > 0 ? -Math.PI / 2 : Math.PI / 2, up);
}
function moveFleet(dt) {
  const on = Math.floor(performance.now() / 140) % 2 === 0;
  for (const c of fleet) {
    c.t = (c.t + dt * c.v / Math.max(30, c.max - c.min)) % 1; const s = c.dir > 0 ? c.t : 1 - c.t, q = c.min + (c.max - c.min) * s, e = clamp(Math.min(q - c.min, c.max - q) / 7, .001, 1);
    placeOnRoad(c, q);
    c.root.scale.setScalar(e); c.flash.forEach((f, i) => { const lit = i % 2 ? on : !on; f.halo.visible = lit; f.lens.material.color.setHex(lit ? f.lens.userData.c : 0x24282c); });
  }
}
/* red double-deck buses: they keep to their routes and pull in at every shelter */
const busBoard = (() => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const x = cv.getContext('2d'); x.fillStyle = '#f6c81e'; x.fillRect(0, 0, 512, 64); x.fillStyle = '#14201b'; x.font = '44px "Lilita One", Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(`${CFG.name}  ${CFG.handle}`, 256, 34); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshLambertMaterial({ map: t }); })();
const buses = [];
function bus(i, ax, at, dir, min, max, stops, v = 7.5) {
  const g = new Geo(), R = '#c8201e', RD = '#9c1614', root = new THREE.Group(), H = 4.3, W = 1.18, GL = '#22303a';
  g.box(0, .34, 0, 8.6, 1.9, W * 2, R); g.box(-.08, 2.24, 0, 8.44, 1.5, W * 2, R); g.box(-.08, 3.74, 0, 8.3, .1, W * 2 - .1, '#e9e4d8'); g.box(0, 2.14, 0, 8.64, .16, W * 2 + .04, '#f3f1ea'); g.box(0, .34, 0, 8.64, .14, W * 2 + .04, RD);
  for (const s of [-1, 1]) { const z = s * (W + .015); g.box(-.5, 1.42, z, 6.1, .68, .02, GL); g.box(-.1, 2.72, z, 7.9, .72, .02, GL); for (let x = -3.4; x < 3.9; x += 1.1) g.box(x, 2.72, z + s * .012, .09, .74, .02, R); for (let x = -3.5; x < 2.6; x += 1.2) g.box(x, 1.42, z + s * .012, .09, .7, .02, R); for (const x of [2.4, -2.5]) { g.add(new THREE.CylinderGeometry(.72, .72, .03, 16).rotateX(Math.PI / 2), '#17191c', x, .5, s * (W + .012)); } }
  wheelBig(g, 2.4); wheelBig(g, -2.5);
  g.box(3.4, .46, -W - .02, 1.12, 1.64, .03, '#f3f1ea'); g.box(3.13, 1.25, -W - .04, .48, 1.46, .02, GL); g.box(3.67, 1.25, -W - .04, .48, 1.46, .02, GL); g.box(3.4, .34, -W - .5, 1.1, .05, .7, '#b8b0a0');
  g.box(4.31, 1.2, 0, .03, 1, W * 1.8, GL); g.box(4.25, 2.72, 0, .03, .72, W * 1.8, GL); g.box(4.33, 2.2, 0, .03, .16, 1.3, '#ffb020'); g.box(4.34, 2.2, 0, .03, .08, 1.1, '#14171a'); for (const s of [-1, 1]) { g.box(4.32, .78, s * .8, .05, .2, .34, '#fff3c4'); g.box(-4.32, .9, s * .86, .05, .34, .22, '#b81c1a'); g.box(3.9, 1.7, s * (W + .24), .22, .42, .08, '#26292e'); } g.box(4.33, .52, 0, .05, .2, 1.8, '#26292e'); g.box(4.34, .3, 0, .03, .12, .7, '#f6c81e'); g.box(-4.33, .3, 0, .03, .12, .7, '#f6c81e');
  g.box(-4.32, 2.72, 0, .03, .7, W * 1.7, GL); for (let y = .6; y < 1.4; y += .16) g.box(-4.33, y, 0, .03, .07, 1.4, '#7a1412'); g.box(4.34, 1.2, 0, .03, 1, .05, '#26292e');
  root.add(g.mesh(solid)); root.children[0].castShadow = true;
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(5.6, .44), busBoard); p.position.set(-.6, 2.22, s * (W + .05)); p.rotation.y = s > 0 ? 0 : Math.PI; root.add(p); }
  scene.add(root); buses.push({ root, ax, at, dir, min, max, stops: [...stops].sort((a, b) => dir * (a - b)), q: dir > 0 ? min + (i * 37) % (max - min) : max - (i * 37) % (max - min), v, sp: v, wait: 0, n: 0 });
}
function wheelBig(g, x) { for (const s of [-1, 1]) { const cyl = (a, b) => new THREE.CylinderGeometry(a, a, b, 16).rotateX(Math.PI / 2), z = s * 1.02; g.add(cyl(.56, .36), TYRE, x, .56, z); g.add(cyl(.34, .38), RIM, x, .56, z); g.add(cyl(.12, .4), '#6d7277', x, .56, z); } }
for (const r of busRows) for (const d of [1, -1]) bus(buses.length, 'x', r.k * ROW + (d > 0 ? -1.7 : 1.7), d, r.a + 6, r.b - 6, busStops.get(`x${r.k}${d > 0 ? '+' : '-'}`) || []);
for (const [m, A] of busAves) for (const d of [1, -1]) bus(buses.length, 'z', m * AVE + (d > 0 ? 1.7 : -1.7), d, A.min + 6, A.max - 6, busStops.get(`z${m}${d > 0 ? '+' : '-'}`) || []);
function moveBuses(dt) {
  for (const c of buses) {
    if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0) { c.n++; } placeOnRoad(c, c.q); continue; }
    const next = c.stops[c.n], gap = next === undefined ? 1e9 : (next - c.q) * c.dir;
    const want = gap > 0 && gap < 16 ? Math.max(1.4, c.v * gap / 16) : c.v; c.sp += (want - c.sp) * Math.min(1, dt * 2.4); c.q += c.dir * c.sp * dt;
    if (gap > 0 && gap < .4) { c.wait = 3.5; c.sp = 0; }
    if (gap <= 0 && next !== undefined) c.n++;
    const end = c.dir > 0 ? c.q > c.max : c.q < c.min; if (end) { c.q = c.dir > 0 ? c.min : c.max; c.n = 0; }
    const e = clamp(Math.min(c.q - c.min, c.max - c.q) / 7, .001, 1); c.root.scale.setScalar(e); placeOnRoad(c, c.q);
  }
}
/* the hospital helicopter: circles the town, lands on the roof pad, takes off again */
const heli = (() => {
  const g = new Geo(), root = new THREE.Group(), C = '#f3f1ea', R = '#d8352b';
  g.box(.3, .9, 0, 3.2, 1.5, 1.6, C); g.box(1.9, 1.05, 0, 1, 1.05, 1.3, '#2b3b48'); g.box(-2.4, 1.35, 0, 3.4, .42, .42, C); g.box(-4.1, 1.2, 0, .8, 1.5, .16, R); g.box(.3, 1.45, .82, 1.7, .5, .04, R); g.box(.3, 1.45, -.82, 1.7, .5, .04, R); g.box(.3, 2.4, 0, .4, .35, .4, '#3a3f47');
  for (const z of [-1, 1]) { g.box(.3, 0, z, 3.6, .14, .14, '#3a3f47'); for (const x of [-.6, 1.2]) g.box(x, 0, z * .85, .12, .9, .12, '#3a3f47'); }
  const body = g.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); body.castShadow = true; root.add(body);
  const rotor = new THREE.Group(), blade = new THREE.MeshLambertMaterial({ color: 0x1c2024 }); for (const a of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(8.6, .07, .34), blade); m.rotation.y = a; rotor.add(m); } rotor.position.set(.3, 2.8, 0); root.add(rotor);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.5, .2), blade); tail.position.set(-4.3, 1.9, .18); root.add(tail);
  scene.add(root); const lot = CIVIC[1].lot, pad = new THREE.Vector3(lot.x + 3.5, 11.6, lot.z);
  return { root, rotor, tail, pad, r: 150, y: 44, a0: Math.atan2(lot.z - 5, lot.x) };
})();
const heliFrom = new THREE.Vector3(), heliTo = new THREE.Vector3();
function moveHeli(dt) {
  const h = heli, T = 56, u = (performance.now() / 1000) % T, fly = 38, ring = a => heliFrom.set(Math.cos(a) * h.r, h.y, Math.sin(a) * h.r + 6);
  let p, face = 0, spin = 34;
  if (u < fly) { const a = h.a0 + (u / fly) * Math.PI * 2; p = ring(a); face = -a; }
  else if (u < fly + 6) { const t = smooth(0, 1, (u - fly) / 6); ring(h.a0); p = heliTo.copy(heliFrom).lerp(h.pad, t); p.y = heliFrom.y + (h.pad.y - heliFrom.y) * t * t; face = Math.atan2(-(h.pad.z - heliFrom.z), h.pad.x - heliFrom.x); }
  else if (u < fly + 11) { p = heliTo.copy(h.pad); face = h.root.rotation.y; spin = 12; }
  else { const t = smooth(0, 1, (u - fly - 11) / (T - fly - 11)); ring(h.a0); p = heliTo.copy(h.pad).lerp(heliFrom, t); p.y = h.pad.y + (heliFrom.y - h.pad.y) * Math.sqrt(t); face = -h.a0; }
  h.root.position.copy(p); h.root.rotation.y = face; h.rotor.rotation.y += spin * dt; h.tail.rotation.x += 40 * dt;
}
/* small boats on the river */
const BOATS = 8, boatSpan = townR + 110;
/* boats are one smooth shape: a lofted hull with a closed deck, and a cabin that grows out of it */
function twoSided(g, a, b, c, d, col) { g.quad(a, b, c, d, col); g.quad(d, c, b, a, col); }
function loft(b, t, L, W, H, deckHex) {
  const N = 12, st = []; for (let i = 0; i <= N; i++) { const u = -1 + 2 * i / N, n = u > .15 ? (u - .15) / .85 : 0, w = W * (u <= .15 ? .9 + .1 * (u + 1) / 1.15 : Math.sqrt(Math.max(0, 1 - n * n))) + .001, top = H * (1 + .4 * n * n), low = .02 + .22 * n * n; st.push({ x: u * L, w, top, low }); }
  const hull = rgb('#ffffff'), deck = rgb(deckHex), band = rgb('#fbf7ec'), under = rgb('#23262a');
  for (let i = 0; i < N; i++) { const p = st[i], q = st[i + 1]; for (const s of [-1, 1]) {
    twoSided(b, [p.x, p.top - .12, s * p.w], [q.x, q.top - .12, s * q.w], [q.x, q.low + .12, s * q.w * .86], [p.x, p.low + .12, s * p.w * .86], hull);
    twoSided(t, [p.x, p.top, s * p.w], [q.x, q.top, s * q.w], [q.x, q.top - .12, s * q.w], [p.x, p.top - .12, s * p.w], band);
    twoSided(t, [p.x, p.low + .12, s * p.w * .86], [q.x, q.low + .12, s * q.w * .86], [q.x, q.low, 0], [p.x, p.low, 0], under); }
    twoSided(t, [p.x, p.top - .03, -p.w], [q.x, q.top - .03, -q.w], [q.x, q.top - .03, q.w], [p.x, p.top - .03, p.w], deck); }
  const a = st[0]; twoSided(b, [a.x, a.top - .12, -a.w], [a.x, a.top - .12, a.w], [a.x, a.low + .12, a.w * .86], [a.x, a.low + .12, -a.w * .86], hull); twoSided(t, [a.x, a.top, -a.w], [a.x, a.top, a.w], [a.x, a.top - .12, a.w], [a.x, a.top - .12, -a.w], band);
}
function wake(t, L, W) { // one clean V of foam behind the stern and a small bow wave
  const foam = rgb('#f4fbfc'), y = .07, x0 = -L * .98, x1 = -L - 5, spread = 1.5; for (const s of [-1, 1]) { twoSided(t, [x0, y, s * W * .78], [x1, y, s * (W + spread)], [x1, y, s * (W + spread + .05)], [x0, y, s * W * 1.04], foam); twoSided(t, [L * .95, y, s * .08], [L * .15, y, s * (W * 1.2)], [L * .15, y, s * (W * .98)], [L * .95, y, 0], foam); }
}
const boatCabin = (t, x, y, l, h, w, wall, roof, gl = '#27404e') => { t.box(x, y, 0, l, h, w, wall); t.box(x, y + h * .42, 0, l + .02, h * .4, w + .02, gl); t.box(x + l * .28, y + h * .42, 0, l * .12, h * .4, w + .04, wall); t.box(x - l * .22, y + h * .42, 0, l * .12, h * .4, w + .04, wall); t.box(x, y + h, 0, l + .34, .1, w + .24, roof); };
const BOAT_MODELS = [
  (b, t) => { // runabout: low windscreen, seats and an outboard
    loft(b, t, 2.8, .98, .5, '#e8dcc2'); wake(t, 2.8, .98); t.box(.35, .52, 0, .9, .3, 1.4, '#f4efe2'); t.box(.8, .78, 0, .05, .3, 1.36, '#9fc4d4'); t.box(-.75, .5, 0, 1.3, .24, 1.3, '#d8352b'); t.box(-1.32, .72, 0, .2, .34, 1.3, '#d8352b'); t.box(-2.92, .22, 0, .34, .62, .3, '#23262a'); t.box(-2.94, .82, 0, .42, .26, .36, '#f3f1ea');
  },
  (b, t) => { // fishing boat: wheelhouse forward, working deck behind, one mast
    loft(b, t, 3.3, 1.2, .55, '#d9c9a4'); wake(t, 3.3, 1.2); boatCabin(t, .7, .52, 1.7, 1.05, 1.5, '#fbf7ec', '#c92c3a'); t.box(-1.2, .55, 0, 1.3, .3, .9, '#c79a62'); for (const z of [-.3, 0, .3]) t.box(-1.2, .85, z, 1.2, .05, .2, '#f6c81e'); t.box(.25, 1.68, 0, .1, 1, .1, '#7a4f2e'); t.box(.25, 2.4, 0, .06, .06, 1, '#7a4f2e');
  },
  (b, t) => { // cruiser: long cabin with a window band and a small upper deck
    loft(b, t, 3.4, 1.15, .55, '#e8dcc2'); wake(t, 3.4, 1.15); boatCabin(t, .1, .53, 2.8, .82, 1.6, '#fbf7ec', '#f4efe2'); t.box(-.4, 1.45, 0, 1.3, .34, 1.1, '#fbf7ec'); t.box(-.1, 1.5, 0, .05, .3, 1, '#9fc4d4'); t.box(-.75, 1.79, 0, .1, .5, .1, '#8a8d90');
  },
];
const boatKinds = BOAT_MODELS.map((f, k) => modelMeshes(f, slotsFor(BOATS, BOAT_MODELS.length, k)));
const boats = Array.from({ length: BOATS }, (_, i) => { const kind = boatKinds[i % BOAT_MODELS.length], slot = Math.floor(i / BOAT_MODELS.length); kind.body.setColorAt(slot, new THREE.Color(['#d8352b', '#fdf6e6', '#f6c81e', '#ff7a2a', '#fdf6e6', '#c92c3a', '#ffd23c', '#ff5a3c'][i % 8])); return { kind, slot, t: i / BOATS + .03, dir: i % 2 ? 1 : -1, off: i % 2 ? 4.6 : -4.6, v: i % 2 ? 3.6 : 4.2 }; }); // one speed per lane, so nobody sails through the boat ahead
const boatQ = new THREE.Quaternion(), boatP = new THREE.Vector3(), boatS = new THREE.Vector3(1.3, 1.3, 1.3), boatM = new THREE.Matrix4();
function moveBoats(dt) {
  boats.forEach((b, i) => {
    b.t = (b.t + dt * b.v / (boatSpan * 2)) % 1; const s = b.dir > 0 ? b.t : 1 - b.t, x = -boatSpan + s * boatSpan * 2, z = riverZ(x) + b.off, slope = riverZ(x + 2) - riverZ(x - 2), ang = Math.atan2(slope * b.dir, 4 * b.dir) * -1 + (b.dir > 0 ? 0 : Math.PI);
    boatP.set(x, -1.2 + Math.sin(performance.now() / 600 + i) * .03, z); boatQ.setFromAxisAngle(carA, b.dir > 0 ? -Math.atan2(slope, 4) : Math.PI - Math.atan2(slope, 4)); b.kind.set(b.slot, boatM.compose(boatP, boatQ, boatS));
  });
  boatKinds.forEach(k => k.done());
}
moveCars(0); moveFleet(0); moveBuses(0); moveBoats(0); moveHeli(0);
const stars = (() => {
  const r = rng(5), a = new Float32Array(1500);
  for (let i = 0; i < 500; i++) { const t = r() * 6.283, p = .12 + r() * 1.3, d = townR + 1500; a[i * 3] = Math.cos(t) * Math.cos(p) * d; a[i * 3 + 1] = Math.sin(p) * d; a[i * 3 + 2] = Math.sin(t) * Math.cos(p) * d; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false })); scene.add(p); return p;
})();

/* selection marker and the nickname board on the lawn */
const marker = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3.2, 4), new THREE.MeshBasicMaterial({ color: 0xf6c81e })); marker.rotation.x = Math.PI; marker.visible = false; scene.add(marker);
// Painted timber: planks, grain, knots and nail heads, used on every sign in the town.
function paintWood(x, w, h, base = '#9a6a3c', planks = 3, seed = 3) {
  const r = rng(seed), ph = h / planks; x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph, tone = (r() - .5) * .14; x.fillStyle = tone > 0 ? `rgba(255,214,150,${tone})` : `rgba(40,20,8,${-tone})`; x.fillRect(0, y0, w, ph);
    for (let i = 0; i < 26; i++) { let gy = y0 + r() * ph; x.strokeStyle = r() > .5 ? `rgba(60,32,14,${.1 + r() * .22})` : `rgba(255,215,160,${.05 + r() * .12})`; x.lineWidth = .6 + r() * 1.5; x.beginPath(); x.moveTo(-8, gy); const a = r() * 6; for (let q = 0; q <= w + 40; q += 36) { gy += Math.sin(q * .012 + a) * 1.2 + (r() - .5) * .8; x.lineTo(q, gy); } x.stroke(); }
    if (r() > .35) { const kx = r() * w, ky = y0 + ph * (.3 + r() * .4); for (let k = 5; k > 0; k--) { x.strokeStyle = `rgba(50,26,10,${.14 + k * .05})`; x.lineWidth = 1.1; x.beginPath(); x.ellipse(kx, ky, k * 4.2, k * 2, 0, 0, 7); x.stroke(); } }
    if (p) { x.fillStyle = 'rgba(30,14,6,.6)'; x.fillRect(0, y0 - 1.5, w, 3); x.fillStyle = 'rgba(255,225,175,.2)'; x.fillRect(0, y0 + 1.5, w, 1.2); }
  }
}
function carve(x, text, cx, cy, maxW, size, color = '#fff0c8') { // letters painted onto the wood, fitted to the board
  let s = size; const font = n => `400 ${n}px "Lilita One", Arial Black, sans-serif`; x.font = font(s); while (x.measureText(text).width > maxW && s > 20) { s -= 2; x.font = font(s); }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'; x.lineWidth = Math.max(5, s * .16); x.strokeStyle = '#2e1b0e'; x.strokeText(text, cx, cy + 2); x.fillStyle = color; x.fillText(text, cx, cy);
}
const boardCv = document.createElement('canvas'); boardCv.width = 512; boardCv.height = 168;
const boardTx = new THREE.CanvasTexture(boardCv); boardTx.colorSpace = THREE.SRGBColorSpace; boardTx.anisotropy = 4;
const board = new THREE.Group();
const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.97), new THREE.MeshBasicMaterial({ map: boardTx, side: THREE.DoubleSide })); boardFace.position.y = 2.7; boardFace.position.z = .1;
const boardBack = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.15, .15), new THREE.MeshLambertMaterial({ color: 0x4f2f1c })); boardBack.position.y = 2.7;
const post = new THREE.Mesh(new THREE.BoxGeometry(.3, 1.8, .3), new THREE.MeshLambertMaterial({ color: 0x4f2f1c })); post.position.y = .9;
board.add(boardFace, boardBack, post); board.visible = false; board.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(board);
function setBoard(h) {
  const x = boardCv.getContext('2d'); paintWood(x, 512, 168, '#9a6a3c', 3, h.h & 1023); x.strokeStyle = '#3a2616'; x.lineWidth = 10; x.strokeRect(5, 5, 502, 158);
  x.fillStyle = '#c9c2b4'; for (const [a, c] of [[18, 18], [494, 18], [18, 150], [494, 150]]) { x.beginPath(); x.arc(a, c, 5, 0, 7); x.fill(); }
  carve(x, h.nick, 256, 86, 450, 76); boardTx.needsUpdate = true;
  board.position.set(h.x - 5 * h.flip, 0, h.z + 7.6 * h.flip); board.rotation.y = h.flip > 0 ? 0 : Math.PI; board.visible = true;
}

/* ---------- time of day ---------- */
const KEYS = [ // hour, horizon, sun colour, sun power, ambient, glow, top of the sky
  [0, '#16233f', '#7f97c9', .35, .52, 1, '#070d1c'], [5.2, '#1c2c49', '#7f97c9', .35, .54, 1, '#0a1226'], [6.8, '#ffc79a', '#ffbe82', 1.7, .85, .45, '#7fb0dc'], [9, '#c4e6f3', '#fff0d2', 2.7, 1.15, 0, '#58a8e2'],
  [16, '#c4e6f3', '#ffeecb', 2.7, 1.15, 0, '#58a8e2'], [19, '#ffa56e', '#ffab66', 1.8, .82, .6, '#5a6fae'], [20.6, '#2b3658', '#8a96cc', .4, .56, 1, '#121a33'], [24, '#16233f', '#7f97c9', .35, .52, 1, '#070d1c']
];
const skyC = new THREE.Color(), tmpA = new THREE.Color(), tmpB = new THREE.Color(), glowOff = new THREE.Color('#37505e'), glowOn = new THREE.Color('#ffd27a');
const PHASES = [['Night', 2], ['Morning', 7.1], ['Day', 13], ['Evening', 19]];
let manual = null; // null = viewer's own clock
// Weather: the same for every visitor, changes in 3-hour blocks; about one block in three is rainy.
let wxMode = 'auto', wet = 0;
const autoRain = () => rng(hash(`rain${Math.floor(Date.now() / 10800000)}`))() < .32;
const wantRain = () => wxMode === 'auto' ? autoRain() : wxMode === 'rain';
wet = wantRain() ? 1 : 0;
const usaTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function hourNow() { // the town runs on US Eastern time, wherever the visitor is
  if (manual !== null) return manual;
  const p = usaTime.formatToParts(new Date()), v = t => Number(p.find(x => x.type === t).value);
  return v('hour') + v('minute') / 60;
}
function applyTime(t) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
  const a = KEYS[i], b = KEYS[i + 1], f = (t - a[0]) / (b[0] - a[0]);
  skyC.copy(tmpA.set(a[1])).lerp(tmpB.set(b[1]), f); scene.background = skyC; scene.fog.color.copy(skyC);
  sun.color.copy(tmpA.set(a[2])).lerp(tmpB.set(b[2]), f); sun.intensity = a[3] + (b[3] - a[3]) * f;
  hemi.intensity = a[4] + (b[4] - a[4]) * f; hemi.color.copy(skyC).lerp(tmpB.set('#ffffff'), .5);
  const g = a[5] + (b[5] - a[5]) * f; glow.color.copy(glowOff).lerp(glowOn, Math.max(g, wet * .55)); stars.material.opacity = g * g * (1 - wet);
  pools.material.opacity = g * .5; pools.visible = g > .04;
  const bright = clamp(sun.intensity / 2.6, .22, 1);
  skyC.lerp(tmpB.set('#8a979f').multiplyScalar(bright), wet * .9); scene.fog.color.copy(skyC);
  scene.fog.near = townR * 2.2 * (1 - wet * .3); scene.fog.far = (townR + 1600) * (1 - wet * .22);
  skyU.low.value.copy(skyC); skyU.top.value.copy(tmpA.set(a[6])).lerp(tmpB.set(b[6]), f).lerp(skyC, wet * .85);
  waterU.fogC.value.copy(skyC); waterU.fogNear.value = scene.fog.near; waterU.fogFar.value = scene.fog.far; waterU.sunC.value.copy(sun.color); waterU.light.value = clamp((sun.intensity / 2.7) ** 1.3 * .82 + .16, .16, 1) * (1 - wet * .28);
  sun.intensity *= 1 - wet * .62;
  const day = (t - 6) / 13.5, s = day > 0 && day < 1 ? day : .5, el = day > 0 && day < 1 ? Math.max(.22, Math.sin(s * Math.PI) * .95) : .8;
  sunDir.set(Math.cos(s * Math.PI) * 1, el, .55).normalize();
  const hh = Math.floor(t), mm = Math.floor((t - hh) * 60), ph = t < 5.5 || t >= 21 ? 'Night' : t < 11 ? 'Morning' : t < 17.5 ? 'Day' : 'Evening', h12 = hh % 12 || 12, ampm = hh < 12 ? 'AM' : 'PM';
  $('clock').textContent = `${h12}:${String(mm).padStart(2, '0')} ${ampm} ET \u00B7 ${ph}${manual === null ? '' : ' \u00B7 manual'}`;
  $('wx').textContent = `${wantRain() ? 'Rain' : 'Dry'}${wxMode === 'auto' ? '' : ' \u00B7 manual'}`;
}
const sunDir = new THREE.Vector3(.5, .8, .5);

/* rain: a box of streaks that follows the view */
const DROPS = innerWidth < 600 ? 700 : 1300, dropSeed = new Float32Array(DROPS * 3), dropPos = new Float32Array(DROPS * 6);
{ const r = rng(21); for (let i = 0; i < DROPS * 3; i++) dropSeed[i] = r(); }
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xdbe9f2, transparent: true, opacity: 0, fog: false }));
rain.frustumCulled = false; rain.visible = false; scene.add(rain);
function moveRain(now) {
  const S = clamp(view.d * 1.15, 50, 420), H = S * .8, L = S * .028, ax = camera.position.x * .35 + view.x * .65, az = camera.position.z * .35 + view.z * .65, ay = H * .5;
  for (let i = 0; i < DROPS; i++) {
    const fall = (dropSeed[i * 3 + 1] + now * .00095 * (1 + dropSeed[i * 3 + 2] * .35)) % 1;
    const x = ax + (dropSeed[i * 3] - .5) * S, z = az + (dropSeed[i * 3 + 2] - .5) * S, y = ay + (.5 - fall) * H, j = i * 6;
    dropPos[j] = x; dropPos[j + 1] = y; dropPos[j + 2] = z; dropPos[j + 3] = x - L * .12; dropPos[j + 4] = y - L; dropPos[j + 5] = z - L * .06;
  }
  rainGeo.attributes.position.needsUpdate = true;
}
/* ---------- camera ---------- */
const view = { x: 0, z: 10, d: 420, yaw: .42, pitch: .3, lift: .13 }, goal = { ...view };
const stroll = { on: false, x: 0, z: 0, y: 0, th: 0, cy: 0, cp: .2, dist: 6.5, cur: 6.5, v: 0, swing: 0, keys: {}, jx: 0, jy: 0, jr: false, drag: null };
const drive = { on: false, x: 0, z: 0, y: 0, th: 0, cth: 0, v: 0, st: 0, dist: 0, up: 0, keys: {}, cars: {} };
const overview = () => { const tall = innerHeight > innerWidth; return { x: 0, z: tall ? 18 : 12, d: clamp(townR * (tall ? 1.5 : 1.75), 230, 900), yaw: .42, pitch: tall ? .32 : .25, lift: tall ? .1 : .12 }; };
Object.assign(goal, overview());
const VALLEY = townR + 130; // the camera never leaves this circle, and the mountains only start beyond it
// on a home screen iPhone reports a height short of the real screen, so the true full height is measured
const fullProbe = document.createElement('div'); fullProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none'; document.body.append(fullProbe);
const appMode = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; if (appMode) document.documentElement.classList.add('app');
const viewH = () => appMode ? Math.max(innerHeight, Math.round(fullProbe.getBoundingClientRect().height)) : innerHeight;
const shR = new THREE.Vector3(), shU = new THREE.Vector3(), shT = new THREE.Vector3();
function placeCamera() {
  if (drive.on) driveCam(); else if (stroll.on) strollCam(); else {
  const sy = Math.sin(view.yaw), cy = Math.cos(view.yaw), b = view.x * sy + view.z * cy, cc = view.x * view.x + view.z * view.z - VALLEY * VALLEY;
  const reach = Math.min(Math.cos(view.pitch) * view.d, -b + Math.sqrt(Math.max(0, b * b - cc))), px = view.x + sy * reach, pz = view.z + cy * reach;
  let py = Math.sin(view.pitch) * view.d; py = Math.max(py, height(px, pz) + 8);
  camera.position.set(px, py, pz); camera.lookAt(view.x, 2 + view.d * view.lift, view.z);
  }
  { const nr = stroll.on ? .4 : drive.on ? 1 : clamp(view.d * .08, 1, 90); if (Math.abs(camera.near - nr) > nr * .12) { camera.near = nr; camera.updateProjectionMatrix(); } } // the nearer the near plane is to the town, the less the road layers fight each other
  const s = 50 * 1.12 ** Math.ceil(Math.log(clamp(view.d * .85, 50, 340) / 50) / Math.log(1.12)); // shadow scale moves in steps, so zooming does not make shadows swim
  const cam = sun.shadow.camera; if (cam.right !== s) { cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.far = s * 6; cam.updateProjectionMatrix(); }
  { const tex = 2 * s / sun.shadow.mapSize.x; shR.crossVectors(shU.set(0, 1, 0), sunDir).normalize(); shU.crossVectors(sunDir, shR); shT.set(view.x, 0, view.z); const a = Math.round(shT.dot(shR) / tex) * tex, b = Math.round(shT.dot(shU) / tex) * tex, c = shT.dot(sunDir); sun.target.position.set(0, 0, 0).addScaledVector(shR, a).addScaledVector(shU, b).addScaledVector(sunDir, c); } // shadows step on whole texels, so they stay still while the camera pans
  sun.position.copy(sun.target.position).addScaledVector(sunDir, s * 3);
}
function resize() { const w = innerWidth, h = viewH(); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const ptrs = new Map(); let drag = null, gest = null;
const bounds = () => { const R = townR + 20, l = Math.hypot(goal.x, goal.z); if (l > R) { goal.x *= R / l; goal.z *= R / l; } goal.d = clamp(goal.d, 22, clamp(townR * 2.4, 420, 1000)); goal.pitch = clamp(goal.pitch, .2, 1.42); };
canvas.addEventListener('pointerdown', e => { if (drive.on) return; if (stroll.on) { canvas.setPointerCapture(e.pointerId); stroll.drag = { x: e.clientX, y: e.clientY, moved: 0 }; return; } canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, moved: 0, rot: e.button === 2 || e.shiftKey }; gest = null; });
canvas.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  const prev = ptrs.get(e.pointerId), dx = e.clientX - prev[0], dy = e.clientY - prev[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (room.walk) { if (drag) drag.moved += Math.abs(dx) + Math.abs(dy); walk.gy += dx * .0045; walk.gp = clamp(walk.gp + dy * .0035, -1, 1); return; }
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
    if (gest) { goal.d *= gest.dist / dist; goal.yaw += ang - gest.ang; goal.pitch += dy * .002; }
    gest = { dist, ang }; drag && (drag.moved = 99); bounds(); return;
  }
  if (!drag) return;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.rot) { goal.yaw -= dx * .006; goal.pitch += dy * .004; }
  else { const k = view.d * .0021, s = Math.sin(view.yaw), c = Math.cos(view.yaw); goal.x -= (dx * c + dy * s / Math.max(.35, Math.sin(view.pitch))) * k; goal.z -= (-dx * s + dy * c / Math.max(.35, Math.sin(view.pitch))) * k; }
  bounds();
});
const up = e => {
  if (drag && drag.moved < 8 && ptrs.size === 1) tap(e.clientX, e.clientY);
  ptrs.delete(e.pointerId); if (ptrs.size < 2) gest = null; if (!ptrs.size) drag = null;
};
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; gest = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); if (room.on || drive.on) return; if (stroll.on) { stroll.dist = clamp(stroll.dist * Math.exp(e.deltaY * .0012), 3.2, 16); return; } goal.d *= Math.exp(e.deltaY * .0012); bounds(); }, { passive: false });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -3), hit = new THREE.Vector3();
function tap(cx, cy) {
  if (tapPerson(cx, cy)) return;
  if (room.on) { ndc.set(cx / innerWidth * 2 - 1, -(cy / viewH()) * 2 + 1); ray.setFromCamera(ndc, room.cam); const hit = ray.intersectObjects(room.hit)[0]; if (hit) say(hit.object.userData.say); return; }
  ndc.set(cx / innerWidth * 2 - 1, -(cy / viewH()) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(ground, hit)) return;
  if (Math.abs(hit.x) < 68 && hit.z < -550 && hit.z > -720) return openMall();
  let best = null, bd = 64; for (const h of lots) { const d = (h.x - hit.x) ** 2 + (h.z - hit.z) ** 2; if (d < bd) { bd = d; best = h; } }
  if (best) best.plot ? selectPlot(best) : select(best);
}

/* ---------- labels: only the nearest names on screen are drawn ---------- */
const MAXL = innerWidth < 600 ? 16 : 26, labelBox = $('labels'), pool = [];
for (let i = 0; i < MAXL; i++) { const b = document.createElement('div'); b.className = 'pin'; b.hidden = true; b.addEventListener('click', () => b._h && select(b._h)); labelBox.append(b); pool.push(b); }
const pv = new THREE.Vector3();
function updateLabels() {
  const cand = [], W = innerWidth, H = viewH();
  for (const h of houses) {
    const dist = (h.x - camera.position.x) ** 2 + (h.z - camera.position.z) ** 2; if (dist > (stroll.on ? 2500 : 360000) && (h.id > 1 || stroll.on) && h !== selected) continue;
    pv.set(h.x, h === selected ? 14.6 : 10.5, h.z).project(camera); if (Math.abs(pv.x) > 1 || Math.abs(pv.y) > 1 || pv.z > 1) continue;
    cand.push({ h, x: (pv.x + 1) / 2 * W, y: (1 - pv.y) / 2 * H, dist: h === selected ? -2 : h.id === 1 ? -1 : (dist + (h.h % 800) * (view.d / 3)) * (friendsOf(h.key) >= 1 ? .35 : 1) }); // people who invited a friend are seen first
  }
  cand.sort((a, b) => a.dist - b.dist);
  const placed = []; let n = 0;
  for (const c of cand) {
    if (n >= MAXL) break;
    if (placed.some(p => Math.abs(p.x - c.x) < 92 && Math.abs(p.y - c.y) < 25)) continue;
    placed.push(c); const b = pool[n++]; if (b._h !== c.h) { b._h = c.h; b.textContent = c.h.nick; }
    b.className = `pin${c.h === selected ? ' me' : c.h.id === 1 ? ' mayor' : friendsOf(c.h.key) >= 1 ? ' friend' : ''}`; b.hidden = false; b.style.transform = `translate(${Math.round(c.x)}px,${Math.round(c.y)}px) translate(-50%,-100%)`;
  }
  for (; n < MAXL; n++) { pool[n].hidden = true; pool[n]._h = null; }
}

/* ---------- interface ---------- */
let selected = null;
const pop = houses.length.toLocaleString('en-US');
/* the big scoreboard on the square: real residents and how many are left to 10,000 */
const TOWN_GOAL = 10000, scoreboard = (() => {
  const n = houses.length, left = Math.max(0, TOWN_GOAL - n), share = Math.min(1, n / TOWN_GOAL), paint = (x, w, h) => {
    x.fillStyle = '#17302a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#f2c14e'; x.lineWidth = 14; x.strokeRect(14, 14, w - 28, h - 28); x.textAlign = 'center'; x.textBaseline = 'middle'; const f = s => `400 ${s}px 'Lilita One', 'Arial Black', system-ui, sans-serif`;
    x.fillStyle = '#fff'; x.font = f(h * .1); x.fillText((CFG.name || 'DREAM CITY').toUpperCase() + ' RESIDENTS', w / 2, h * .15); x.fillStyle = '#f6c81e'; x.font = f(h * .36); x.fillText(n.toLocaleString('en-US'), w / 2, h * .42);
    const bx = w * .09, by = h * .68, bw = w * .82, bh = h * .09; x.fillStyle = '#0d1f1a'; x.fillRect(bx, by, bw, bh); x.fillStyle = '#7fd66a'; x.fillRect(bx + 4, by + 4, Math.max(8, (bw - 8) * share), bh - 8);
    x.fillStyle = '#fff'; x.font = f(h * .095); x.fillText(left ? `${left.toLocaleString('en-US')} TO GO UNTIL ${TOWN_GOAL.toLocaleString('en-US')}` : `${TOWN_GOAL.toLocaleString('en-US')} REACHED!`, w / 2, h * .87);
  }, m = mallSign(24, 13.5, paint), g = new Geo(), wx = 24, wz = -31; m.position.set(wx, 11.2, wz + .26); scene.add(m);
  for (const s of [-1, 1]) { g.box(wx + s * 10, 0, wz, .9, 10, .9, '#5e3b26'); g.box(wx + s * 10, 0, wz, 1.9, .6, 1.9, '#8f8778'); } g.box(wx, 4.1, wz, 24.8, 14.2, .4, '#3a2a1c'); g.box(wx, 18.3, wz, 25.6, .4, 1.2, '#d6b13c'); const q = g.mesh(solid); q.castShadow = true; scene.add(q); return { m, paint };
})();
try { document.fonts.load('60px "Lilita One"').then(() => scoreboard.m.userData.redraw(scoreboard.paint)); } catch {}
$('tn').textContent = CFG.name;
document.title = CFG.name;
$('pop').textContent = `Population ${pop} \u00B7 ${plots.length.toLocaleString('en-US')} free plots`;
document.title = CFG.name;
const lvName = h => CFG.levels[h.lvl - 1][0];
function setHash(v) { try { history.replaceState(null, '', v ? `#${encodeURIComponent(v)}` : location.pathname + location.search); } catch {} }
// choose a view of the front door that the church does not block
function clearYaw(p, d, pitch) {
  const base = p.flip > 0 ? 0 : Math.PI, reach = Math.cos(pitch) * d;
  for (const o of [.42, -.42, .85, -.85]) {
    const yaw = base + o, ex = p.x + Math.sin(yaw) * reach, ez = p.z + Math.cos(yaw) * reach; let ok = true;
    for (const [cx, cz] of [[-22, 2], [-22, -12]]) {
      const dx = ex - p.x, dz = ez - p.z, t = clamp(((cx - p.x) * dx + (cz - p.z) * dz) / (dx * dx + dz * dz), 0, 1);
      if (Math.hypot(p.x + dx * t - cx, p.z + dz * t - cz) < 17) ok = false;
    }
    if (ok) return yaw;
  }
  return base + .42;
}
function select(h, fly = true) {
  $('nb').hidden = false; document.querySelector('.acts').hidden = false; $('bBuild').hidden = false; $('claim').hidden = true; selected = h; drawDoor(h); document.body.classList.add('sel'); $('card').hidden = false; $('news').hidden = true; $('vote').hidden = true; $('hint').hidden = true;
  $('q').value = h.nick; $('cn').textContent = h.nick; $('ca').textContent = `${h.num} ${h.street}`;
  $('cs').textContent = `${h.id === 1 ? 'Mayor' : `Resident ${h.id.toLocaleString('en-US')} of ${pop}`} \u00B7 ${lvName(h)}, level ${h.lvl} of 3${CFG.levels[h.lvl] ? ` \u00B7 ${friendsOf(h.key)} of ${CFG.levels[h.lvl][1]} friends` : ''}`;
  const nb = $('nb'); nb.replaceChildren();
  houses.filter(o => o !== h).map(o => [(o.x - h.x) ** 2 + (o.z - h.z) ** 2, o]).sort((a, b) => a[0] - b[0]).slice(0, 4).forEach(([, o]) => {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = o.nick; b.onclick = () => select(o); nb.append(b);
  });
  marker.position.set(h.x, 15, h.z); marker.visible = true; setBoard(h); setHash(h.nick);
  if (fly) Object.assign(goal, { x: h.x, z: h.z + 2 * h.flip, d: 54, pitch: .74, yaw: clearYaw(h, 54, .74), lift: -.08 });
}
const isMine = h => store.get('me') === h.key, unlocked = h => !h.claimed || h.followed; // houses from comments are open; a claimed house opens once its owner follows
function drawDoor(h) {
  const b = $('bEnter'), open = unlocked(h); b.hidden = false; b.classList.toggle('locked', !open); $('mine').hidden = !isMine(h);
  b.textContent = open ? 'Enter house' : isMine(h) ? '\u{1F512} Follow us to open your door' : '\u{1F512} Door locked';
}
function selectPlot(p) {
  $('mine').hidden = true; selected = null; document.body.classList.add('sel'); $('card').hidden = false; $('news').hidden = true; $('vote').hidden = true; $('hint').hidden = true;
  let s = (CFG && CFG.settings) || (live && live.settings) || {};
  if (!s.claimText) { try { const cached = localStorage.getItem('DC_SETTINGS'); if (cached) s = { ...s, ...JSON.parse(cached) }; } catch {} }
  const enabled = s.claimEnabled !== undefined ? !!s.claimEnabled : true;
  const cText = s.claimText || 'Claim it on Instagram';
  const cUrl = s.claimUrl || 'https://www.instagram.com/dreamcity/';
  const cDesc = s.claimDesc || 'Comment HOUSE under our latest post and your home goes up here.';

  $('cn').textContent = 'Free plot'; $('ca').textContent = `${p.num} ${p.street}`; $('cs').textContent = cDesc;
  $('nb').hidden = true; document.querySelector('.acts').hidden = true; $('bBuild').hidden = true; $('bEnter').hidden = true;
  
  const cEl = $('claim');
  if (cEl) {
    cEl.textContent = cText;
    cEl.href = cUrl;
    cEl.hidden = !enabled;
  }
  marker.position.set(p.x, 8, p.z); marker.visible = true; setHash('');
  Object.assign(goal, { x: p.x, z: p.z + 2 * p.flip, d: 54, pitch: .74, yaw: clearYaw(p, 54, .74), lift: -.08 });
}
function clearSel() { selected = null; document.body.classList.remove('sel'); marker.visible = false; setBoard(houses[0]); $('card').hidden = true; $('news').hidden = false; $('vote').hidden = false; setHash(''); }
function dist(a, b) { const d = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return d[b.length]; }
$('search').addEventListener('submit', e => {
  e.preventDefault(); const v = $('q').value.trim().replace(/^@/, '').toLowerCase(), hint = $('hint'); if (!v) return;
  const h = byKey.get(v);
  if (h) {
    $('q').blur(); const ref = store.get('ref');
    if (ref && ref !== h.key && !store.get('joined')) askJoin(h, ref); else arrive(h);
    return;
  }
  const near = houses.map(o => [o.key.includes(v) ? 0 : dist(o.key, v), o]).filter(x => x[0] <= 3).sort((a, b) => a[0] - b[0]).slice(0, 4);
  hint.replaceChildren(); hint.hidden = false;
  const canClaim = CFG.selfClaim && store.get('ref'); hint.append(canClaim ? `No house for ${v} yet.` : `No house for ${v} yet. Just followed? Your house will be ready tomorrow. New houses arrive every day. Want something special? Comment it under the latest video.`);
  if (canClaim) { const g = el('button', 'btn', 'Get this house now'); g.style.cssText = 'display:block;width:100%;margin-top:8px'; g.onclick = () => { hint.hidden = true; claimSheet($('q').value.trim().replace(/^@/, '')); }; hint.append(g); }
  if (near.length) { const s = document.createElement('div'); s.className = 'sugg'; near.forEach(([, o]) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = o.nick; b.onclick = () => { $('q').value = o.nick; select(o); }; s.append(b); }); hint.append(s); }
});
const STYLES = [['Chalet', 0], ['A-frame cabin', 1], ['Stone cottage', 2], ['Modern', 3], ['Farmhouse', 4], ['Town house', 5], ['Lodge', 6], ['Turret house', 7]];
function freeLot(ref) { // the nearest free plot to the friend who invited you, otherwise the next free plot
  const r = ref && byKey.get(ref), list = r ? [...plots].sort((a, b) => Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z)) : plots; return list;
}
function claimSheet(prefill = '') {
  openSheet(p => {
    const ref = store.get('ref'), inviter = ref && byKey.get(ref); let style = Math.floor(Math.random() * 8);
    p.append(el('h2', '', inviter ? `Move in next to ${inviter.nick}` : 'Get your house'), el('p', '', 'Free. Your house goes up right now, with your name on the sign.'));
    const l = el('label', 'field', 'Your TikTok or Instagram nickname'), i = el('input'); i.id = 'claimNick'; i.value = prefill; i.maxLength = 30; i.autocapitalize = 'off'; i.spellcheck = false; l.append(i);
    const box = el('div', 'styles'); STYLES.forEach(([n, id]) => { const b = el('button', id === style ? 'on' : '', n); b.type = 'button'; b.onclick = () => { style = id; box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }; box.append(b); });
    const w = el('label', 'field', 'Dream extras (optional)'), t = el('input'); t.id = 'claimWish'; t.maxLength = 120; t.placeholder = 'pool, tree house, giant cat...'; w.append(t);
    const go = el('button', 'btn', 'Build my house'), note = el('small', '', 'One house per person. By claiming, your nickname appears on this public site.'), cancel = el('button', 'btn ghost', 'Not now');
    cancel.onclick = closeSheet;
    go.onclick = async () => {
      const nick = i.value.trim().replace(/^@/, ''); if (nick.length < 2) { toast('Type your nickname first'); return; }
      go.disabled = true; go.textContent = 'Building...';
      let msg = 'Could not build it. Try again.';
      for (const lot of freeLot(ref).slice(0, 4)) {
        try {
          const r = await send('/api/claim', { nick, style, wish: t.value, device: deviceId(), ref: ref || '', lot: { k: lot.k, side: lot.side, i: lot.i } });
          if (r.ok) { store.set('me', nick.toLowerCase()); store.set('fresh', '1'); store.set('joined', '1'); location.hash = encodeURIComponent(nick); location.reload(); return; }
          if (r.reason === 'lot') continue;
          msg = { invite: 'You need a friend\'s invite link to get a house.', name: 'Please choose a different nickname', taken: 'That nickname already has a house. Search for it instead.', device: 'This device already has a house', limit: 'Too many houses from this network today', invalid: 'Something went wrong. Refresh and try again.' }[r.reason] || msg; break;
        } catch { break; }
      }
      go.disabled = false; go.textContent = 'Build my house'; toast(msg);
    };
    p.append(l, box, w, go, note, cancel);
  });
}
$('getHouse').onclick = () => claimSheet($('q').value.trim().replace(/^@/, ''));
if (store.get('me') || !CFG.selfClaim || !store.get('ref')) $('getHouse').hidden = true;
function followSheet(h) {
  openSheet(p => {
    p.append(el('h2', '', 'Open your door'), el('p', '', 'Follow Dream City on Instagram or TikTok, then come back here. One is enough.'));
    let platform = ''; const done = el('button', 'btn', "I've followed"); done.hidden = true;
    for (const [id, name, url] of [['instagram', 'Follow on Instagram', 'https://www.instagram.com/dreamcity/'], ['tiktok', 'Follow on TikTok', 'https://www.tiktok.com/@dreamcity']]) { const a = el('a', 'btn', name); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.style.cssText = 'display:block;text-align:center;text-decoration:none;margin-bottom:8px'; a.onclick = () => { platform = id; done.hidden = false; }; p.append(a); }
    done.onclick = async () => {
      done.disabled = true; let msg = 'Could not open it. Try again.';
      try { const r = await send('/api/follow', { nick: h.key, device: deviceId(), platform }); if (r.ok) { h.followed = true; closeSheet(); toast('Your door is open!'); select(h); return; } if (r.reason === 'invalid') msg = 'Open this on the phone you built your house with'; } catch {}
      done.disabled = false; toast(msg);
    };
    const later = el('button', 'btn ghost', 'Later'); later.onclick = closeSheet; p.append(done, later);
  });
}
function arrive(h) {
  if (!store.get('me')) store.set('me', h.key);
  store.set(`lvl:${h.key}`, h.lvl);
  const first = !store.get(`built:${h.key}`); store.set(`built:${h.key}`, '1');
  if (first && !reduced) playBuild(h); else select(h);
}
const deviceId = () => { let d = store.get('dev'); if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).slice(0, 36); store.set('dev', d); } return d; };
const apiTarget = u => { const b = (CFG && CFG.apiUrl) ? CFG.apiUrl.replace(/\/+$/, '') : ''; return b && u.startsWith('/api/') ? `${b}${u}` : u; };
const send = (url, body) => fetch(apiTarget(url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
function askJoin(h, ref) {
  const inviter = byKey.get(ref);
  openSheet(p => {
    p.append(el('h2', '', `Is ${h.nick} your house?`), el('p', '', `You came through ${inviter ? inviter.nick : ref}'s link. Say yes and their house gets one friend closer to its next level.`));
    const yes = el('button', 'btn', 'Yes, this is mine'), no = el('button', 'btn ghost', 'No, just looking');
    yes.onclick = async () => {
      yes.disabled = true; store.set('joined', '1');
      let msg = 'Could not save that. Try again later.';
      try { const r = await send('/api/join', { inviter: ref, nick: h.key, device: deviceId() }); if (r.ok) { live.friends[ref] = r.friends; msg = `Friend counted for ${inviter ? inviter.nick : ref}. Total: ${r.friends}`; } else if (r.reason === 'already') msg = 'This house has already been counted'; else if (r.reason === 'device') msg = 'This device has already been counted'; else if (r.reason === 'limit') msg = 'Too many tries today. Come back tomorrow.'; } catch {}
      closeSheet(); toast(msg); arrive(h);
    };
    no.onclick = () => { closeSheet(); select(h); };
    p.append(yes, no);
  });
}
$('q').addEventListener('input', () => { $('hint').hidden = true; });
$('x').onclick = clearSel;
$('bTown').onclick = () => { clearSel(); Object.assign(goal, overview()); };
$('bIn').onclick = () => { goal.d *= .7; bounds(); };
$('bOut').onclick = () => { goal.d /= .7; bounds(); };
$('clock').onclick = () => { const i = manual === null ? 0 : PHASES.findIndex(p => p[1] === manual) + 1; manual = i < PHASES.length ? PHASES[i][1] : null; applyTime(hourNow()); };

$('wx').onclick = () => { wxMode = { auto: 'rain', rain: 'dry', dry: 'auto' }[wxMode]; applyTime(hourNow()); };
const sheet = $('sheet'), panel = $('panel');
function openSheet(build) { panel.replaceChildren(); build(panel); sheet.hidden = false; }
const closeSheet = () => { sheet.hidden = true; };
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
const el = (t, cls, txt) => { const n = document.createElement(t); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const closeBtn = () => { const b = el('button', 'btn ghost', 'Close'); b.onclick = closeSheet; return b; };
function toast(t) { const b = $('toast'); b.textContent = t; b.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { b.hidden = true; }, 2200); }

$('bUp').onclick = () => {
  const h = selected; if (!h) return;
  openSheet(p => {
    const next = CFG.levels[h.lvl];
    p.append(el('h2', '', 'Invite a friend'));
    p.append(el('p', '', `Your friend gets a house right next to ${isMine(h) ? 'yours' : h.nick + "'s"}. One friend opens the door of the house.`));
    p.append(el('p', '', next ? `Send your link to friends. When ${next[1]} friends move in and open their doors, this home becomes a ${next[0]}.` : 'This is the top level: side wing, garden, hot tub, car and hedge.'));
    if (next) p.append(el('p', '', `So far: ${friendsOf(h.key)} of ${next[1]} friends.`)); if (!friendsOf(h.key)) p.append(el('p', '', 'Invite your first friend and your name tag glows green.'));
    CFG.levels.forEach((l, i) => { const r = el('div', `lv${i + 1 === h.lvl ? ' on' : ''}`); r.append(el('span', '', l[0]), el('span', '', i ? `${l[1]} friends` : 'Free')); p.append(r); });
    const link = `${location.origin}${location.pathname}#${encodeURIComponent(h.nick)}`, copy = el('button', 'btn', 'Copy my invite link');
    copy.onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { s.hidden = false; } };
    const s = el('p', '', link); s.hidden = true; s.style.overflowWrap = 'anywhere'; s.style.userSelect = 'all';
    p.append(copy, s);
    if (CFG.preview) p.append(el('small', '', 'Friend counting starts soon.'));
    p.append(closeBtn());
  });
};
function openMall(fly) { if (fly) { clearSel(); Object.assign(goal, { x: 0, z: -575, d: 170, pitch: .42, lift: .1, yaw: .2 }); } const go = () => openSheet(p => { const box = el('div'), today = new Date().toISOString().slice(0, 10); const draw = () => { box.replaceChildren(); const n = mallLikes(), s = mallStage(n), next = mallSteps[s], prev = s ? mallSteps[s - 1] : 0, pc = next ? Math.min(100, (n - prev) / (next - prev) * 100) : 100, done = store.get('mallDay') === today, bar = el('div', 'mallBar'), fill = document.createElement('i'), list = el('ul', 'mallSteps'); fill.style.width = `${pc}%`; bar.append(fill); mallSteps.forEach((v, i) => list.append(el('li', n >= v ? 'done' : '', `${v} likes: ${mallNames[i + 1]}`))); box.append(el('p', '', next ? `Stage ${s} of 5: ${mallNames[s]}. Every like builds it. ${n} of ${next} likes to the next stage.` : `Open! ${n} likes built this mall.`), bar, list); if (next) { const b = el('button', 'btn', done ? 'Liked today. Come back tomorrow' : 'Like to build'); b.disabled = done; b.onclick = async () => { b.disabled = true; try { const r = await send('/api/like', { device: deviceId() }); if (r.ok || r.reason === 'today') { store.set('mallDay', today); if (typeof r.likes === 'number') live.mall = r.likes; const was = mallBuilt; buildMall(mallStage(mallLikes())); drawBoard(); toast(mallBuilt > was ? `Stage ${mallBuilt} reached: ${mallNames[mallBuilt]}` : r.ok ? 'Thanks! Your like built a little more' : 'You already liked today'); } else toast(r.reason === 'limit' ? 'Too many likes from this network today' : 'Could not save. Try again'); } catch { toast('Could not save. Try again'); } draw(); }; box.append(b); } }; p.append(el('h2', '', CFG.mall.name), box); draw(); p.append(closeBtn()); }); if (fly) setTimeout(go, 1500); else go(); }
$('mallGo').onclick = () => openMall(true);
$('vote').onclick = () => openSheet(p => {
  p.append(el('h2', '', 'What do we build next?'), el('p', '', 'The plot on the square is scaffolded and waiting. Pick one. The winner goes up in the next episode.'));
  const box = el('div'); box.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  const draw = () => {
    box.replaceChildren(); const saved = store.get('vote'), total = voteOptions.reduce((a, o) => a + (live.votes[o] || 0), 0);
    voteOptions.forEach(o => {
      const n = live.votes[o] || 0, pc = total ? Math.round(n / total * 100) : 0, b = el('button', `opt${saved === o ? ' on' : ''}`);
      const name = el('span', '', o), count = el('span', '', `${pc}%`); b.style.display = 'flex'; b.style.justifyContent = 'space-between'; b.append(name, count);
      if (saved !== o) b.style.background = `linear-gradient(90deg,#3a6053 ${pc}%,var(--pine-2) ${pc}%)`;
      b.onclick = async () => {
        try { const r = await send('/api/vote', { option: o, device: deviceId() }); if (r.ok) { store.set('vote', o); live.votes = r.votes; toast(`Vote saved: ${o}`); draw(); } else toast(r.reason === 'limit' ? 'Too many votes from this network today' : 'Could not save your vote'); }
        catch { toast('Could not save your vote'); }
      };
      box.append(b);
    });
    tot.textContent = `${total.toLocaleString('en-US')} ${total === 1 ? 'vote' : 'votes'} so far`;
  };
  const tot = el('small'); draw(); p.append(box, tot, closeBtn());
});

/* story image: a real render of the house with the caption drawn on top */
$('bStory').onclick = async () => {
  const h = selected; if (!h) return;
  try { await document.fonts.load('60px "Lilita One"'); } catch {}
  const W = 720, H = 1280, pr = renderer.getPixelRatio(), keep = { ...view }, asp = camera.aspect;
  const lab = labelBox.style.visibility; marker.visible = false;
  Object.assign(view, { x: h.x, z: h.z, d: 46, pitch: .66, yaw: clearYaw(h, 46, .66), lift: .02 });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); placeCamera(); updateDetail(); renderer.render(scene, camera);
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920; const x = cv.getContext('2d');
  x.drawImage(canvas, 0, 0, 1080, 1920);
  Object.assign(view, keep); renderer.setPixelRatio(pr); camera.aspect = asp; resize(); marker.visible = true; labelBox.style.visibility = lab;
  const g = x.createLinearGradient(0, 0, 0, 620); g.addColorStop(0, 'rgba(12,28,24,.82)'); g.addColorStop(1, 'rgba(12,28,24,0)'); x.fillStyle = g; x.fillRect(0, 0, 1080, 620);
  x.textAlign = 'left'; x.fillStyle = '#f3f7f6'; x.font = '84px "Lilita One", Arial Black, sans-serif'; x.fillText('I live in', 80, 210);
  x.fillStyle = '#f6c81e'; x.font = '112px "Lilita One", Arial Black, sans-serif'; let s = 112; while (x.measureText(CFG.name).width > 920 && s > 60) { s -= 4; x.font = `${s}px "Lilita One", Arial Black, sans-serif`; } x.fillText(CFG.name, 80, 330);
  x.fillStyle = '#f6c81e'; x.beginPath(); x.moveTo(60, 1390); x.lineTo(930, 1390); x.lineTo(1020, 1490); x.lineTo(930, 1590); x.lineTo(60, 1590); x.closePath(); x.fill();
  x.fillStyle = '#14201b'; s = 74; x.font = `${s}px "Lilita One", Arial Black, sans-serif`; while (x.measureText(h.nick).width > 820 && s > 34) { s -= 3; x.font = `${s}px "Lilita One", Arial Black, sans-serif`; } x.fillText(h.nick, 96, 1480);
  x.font = '800 40px Figtree, Arial, sans-serif'; x.fillText(`${h.num} ${h.street}`, 96, 1546);
  x.textAlign = 'center'; x.lineJoin = 'round'; x.font = '84px "Lilita One", Arial Black, sans-serif'; x.lineWidth = 12; x.strokeStyle = '#14201b'; x.strokeText('Come live next to me!', 540, 1330); x.fillStyle = '#fff'; x.fillText('Come live next to me!', 540, 1330);
  x.font = '800 40px Figtree, Arial, sans-serif'; x.fillStyle = 'rgba(20,32,27,.82)'; x.fillRect(150, 1616, 780, 66); x.fillStyle = '#f6c81e'; x.fillText(`Get your house: ${CFG.handle}`, 540, 1663); x.textAlign = 'left';
  const url = cv.toDataURL('image/jpeg', .9), inApp = /TikTok|musical_ly|Bytedance|Instagram|FBAN|FBAV/i.test(navigator.userAgent);
  const file = await new Promise(res => cv.toBlob(b => res(b ? new File([b], `dream-city-${h.key.replace(/[^a-z0-9]+/g, '-')}.jpg`, { type: 'image/jpeg' }) : null), 'image/jpeg', .9));
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  openSheet(p => {
    const im = el('img'); im.src = url; im.alt = `Story image of ${h.nick}'s house`; p.append(el('h2', '', 'Your Story is ready'), im);
    if (canShare) {
      const b = el('button', 'btn', 'Share to Story');
      b.onclick = async () => { try { await navigator.share({ files: [file], title: CFG.name, text: `Come live next to me in ${CFG.name}!` }); } catch (e) { if (e && e.name !== 'AbortError') toast('Sharing failed. Press and hold the picture to save it.'); } };
      p.append(b, el('small', '', 'Choose Instagram or TikTok in the share menu, or save the image and add it to your Story.'));
    } else p.append(el('p', '', 'Tap Save picture, then add it to your Story.'));
    if (file) { const save = el('a', canShare ? 'btn ghost' : 'btn', 'Save picture'), blobUrl = URL.createObjectURL(file); save.href = blobUrl; save.download = file.name; save.style.cssText = 'display:block;text-align:center;text-decoration:none'; p.append(save); }
    if (inApp) {
      const link = `${location.origin}/#${encodeURIComponent(h.nick)}`, c = el('button', 'btn ghost', 'Copy link to my house');
      c.onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied. Paste it into Safari or Chrome.'); } catch { toast(link); } };
      p.append(el('small', '', 'Saving may not work inside the TikTok or Instagram app. Open the menu and choose Open in browser, or copy the link.'), c);
    }
    p.append(closeBtn());
  });
};

/* music: soft generated bells, no audio files */
let ac = null, mTimer = 0;
function bell(f, t, v) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + 2.6); o.connect(g).connect(ac.out); o.start(t); o.stop(t + 2.7); }
function phrase() { const S = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33], r = Math.random, t0 = ac.currentTime + .05; for (let i = 0; i < 6; i++) if (r() > .25) { const f = S[Math.floor(r() * S.length)]; bell(f, t0 + i * .62, .1); if (r() > .7) bell(f * 1.5, t0 + i * .62, .05); } bell(130.81, t0, .08); mTimer = setTimeout(phrase, 3720); }
$('bMusic').onclick = () => {
  const b = $('bMusic'), on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on);
  if (on) {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume();
    if (!ac.out) { const d = ac.createDelay(1), f = ac.createGain(); ac.out = ac.createGain(); d.delayTime.value = .46; f.gain.value = .36; ac.out.connect(ac.destination); ac.out.connect(d); d.connect(f); f.connect(d); d.connect(ac.destination); }
    ac.out.gain.value = .9; phrase();
  } else { clearTimeout(mTimer); ac.out.gain.value = 0; }
};

/* news */
const free = plots.length.toLocaleString('en-US');
// Jokes are about the town and its animals, never about a real resident by name.
const JOKES = [
  'Marmot arrested for stealing carrots. Claims he was "just holding them".',
  'Cow crosses bridge without paying. Police are looking for witnesses. The cow is looking at the police.',
  'The Mayor has declared Monday illegal. Nobody has noticed yet.',
  'Local goat elected to the parking committee. Parking gets worse.',
  'Someone built a castle. The neighbors would like to know who ordered the moat.',
  'Resident asks for a black house. Real estate agent can no longer find it at night.',
  'Pigeon appointed Head of Security. Has so far secured one chip.',
  'The river has been asked to keep the noise down after 10pm.',
  'Town clock is seven minutes late. The Mayor blames the mountains.',
  'Fountain closes for a day after a sheep tried to take a bath.',
  'Traffic report: one car, going slowly, looking for somewhere to go.',
  'The army is still holding the line at the edge of town. The zombies have not read the memo.',
  'Zombies spotted in the forest again. Soldiers say they are slow but very committed.',
  `BREAKING: the army is holding back the zombie attack on every side of ${CFG.name}.`,
  'Front line update: the defenses are holding. Soldiers say only a few zombies are left.',
  'The General says the battle is nearly won. Just a little longer.',
  'Almost there: the last zombies are being pushed back into the forest.',
  'The army thanks all residents for staying calm. The cows have not been told.',
  'Cheese shop robbed. Police say the case is full of holes.',
  'Yodeling practice canceled after the mountain answered back.',
  'Crane driver asks for a day off. Crane refuses.',
  'Cowbell rehearsals moved to Tuesdays. Cows have not been told.',
  'Weather forecast: snow on the peaks, rain on your laundry.',
  'Free plots still available. The Mayor says they are "very quiet and rarely complain".',
  `New study: 100% of residents live in ${CFG.name}.`,
  'Soccer field opens. Cows already 3-0 up.',
  'Local marmot denies everything. Nobody has asked him anything yet.',
  'The Mayor asks residents to stop feeding cheese to the pigeons. The pigeons have hired a lawyer.',
  `Population now ${pop}. The line at the fountain is getting serious.`,
  `Dream Mall: ${mallLikes()} likes so far. Every like adds another brick.`,
  `${free} free plots left. The sheep have started looking at them.`,
  `The vote is open: ${voteOptions.join(', ')}. Tap the button below to have your say.`,
  ...((CFG.opened || []).includes('Bakery') ? ['The Bakery is open on the square. You voted for it, so the crumbs are your fault.'] : []),
];
const shuffled = JOKES.map(j => [Math.random(), j]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
{ const war = /army|zombie|front line|General/i, army = shuffled.filter(n => war.test(n)), rest = shuffled.filter(n => !war.test(n)), mixed = []; rest.forEach((n, i) => { if (i % 2 === 0 && army.length) mixed.push(army.shift()); mixed.push(n); }); $('ticker').textContent = mixed.concat(army).join('   \u00B7   '); } // while the attack lasts, every other headline is about it
$('ticker').style.animationDuration = `${Math.round($('ticker').textContent.length * .17)}s`;

/* ---------- the moment your house gets built ---------- */
renderer.localClippingEnabled = true;
const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const clipOld = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), solidOld = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, clippingPlanes: [clipOld], clipShadows: true }), glowOld = new THREE.MeshBasicMaterial({ clippingPlanes: [clipOld] }); glowOld.color = glow.color;
const solidClip = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, clippingPlanes: [clip], clipShadows: true });
const glowClip = new THREE.MeshBasicMaterial({ clippingPlanes: [clip] }); glowClip.color = glow.color;
function hideInTown(h, on) { // the finished house lives inside a merged chunk, so its triangles are moved out of sight
  const home = chunks.get(`${Math.floor(h.x / 150)},${Math.floor(h.z / 150)}`); if (on) nearBuild(home); if (!h.slice) return; const { c } = h.slice;
  for (const [m, k] of [[c.nm, 'g'], [c.nw, 'w'], [c.nd, 'd']]) {
    if (!m) continue; const [a, b] = h.slice[k]; if (b <= a) continue;
    const attr = m.geometry.attributes.position, arr = attr.array, key = `keep_${k}`;
    if (on) { h.slice[key] = arr.slice(a * 3, b * 3); for (let i = a * 3 + 1; i < b * 3; i += 3) arr[i] -= 400; }
    else { arr.set(h.slice[key], a * 3); }
    attr.needsUpdate = true;
  }
}
const CONF = 180, confPos = new Float32Array(CONF * 3), confCol = new Float32Array(CONF * 3), confVel = [];
const confGeo = new THREE.BufferGeometry(); confGeo.setAttribute('position', new THREE.BufferAttribute(confPos, 3)); confGeo.setAttribute('color', new THREE.BufferAttribute(confCol, 3));
const confetti = new THREE.Points(confGeo, new THREE.PointsMaterial({ size: .55, vertexColors: true })); confetti.frustumCulled = false; confetti.visible = false; scene.add(confetti);
{ const pal = ['#f6c81e', '#d8352b', '#48bcd0', '#ffffff', '#5fbf6a'].map(rgb); for (let i = 0; i < CONF; i++) confCol.set(pal[i % pal.length], i * 3); }
/* building site kit: tower crane, workers and materials, made once and reused */
let kit = null;
function makeWorker(vest, skin, hat) {
  const part = f => { const g = new Geo(); f(g); const m = g.mesh(solid); m.castShadow = true; return m; }, root = new THREE.Group();
  root.add(part(g => { g.box(0, .82, 0, .54, .66, .3, vest); g.box(0, 1.08, .16, .56, .08, .02, '#f3f1ea'); g.box(0, 1.5, 0, .3, .3, .3, skin); g.box(0, 1.76, 0, .4, .09, .44, hat); g.box(0, 1.84, -.02, .3, .1, .32, hat); }));
  const limb = (x, y, f) => { const m = part(f); m.position.set(x, y, 0); root.add(m); return m; };
  const legL = limb(-.14, .86, g => g.box(0, -.86, 0, .2, .86, .24, '#2f4058')), legR = limb(.14, .86, g => g.box(0, -.86, 0, .2, .86, .24, '#2f4058'));
  const armL = limb(-.35, 1.42, g => { g.box(0, -.58, 0, .15, .58, .17, vest); g.box(0, -.72, 0, .13, .14, .14, skin); }), armR = limb(.35, 1.42, g => { g.box(0, -.58, 0, .15, .58, .17, vest); g.box(0, -.72, 0, .13, .14, .14, skin); });
  const bag = part(g => g.box(0, 0, 0, .62, .24, .4, '#d9cbaa')); bag.position.set(0, 1.98, .02); root.add(bag);
  return { root, legL, legR, armL, armR, bag };
}
function makeKit() {
  const root = new THREE.Group(), Y = '#e8ae1f', K = '#2d3a35', C = '#a39f95';
  const st = new Geo(); // cement bags on pallets, a timber stack, a sand heap
  for (const [cx, cz] of [[-4.6, -8.4], [4, 6]]) { st.box(cx, 0, cz, 2.5, .22, 1.9, '#9a7446'); for (let y = 0; y < 3; y++) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) st.box(cx - .78 + i * .78, .24 + y * .3, cz - .42 + j * .84, .72, .28, .76, y % 2 ? '#d9cbaa' : '#e6dcc1'); }
  for (let y = 0; y < 5; y++) for (let i = 0; i < 4; i++) st.box(4.8 + (i - 1.5) * .46, .1 + y * .24, -8.4, .4, .2, 4.2, y % 2 ? '#c29a5f' : '#b58a50');
  st.add(new THREE.ConeGeometry(1.9, 1.3, 7), '#d8bf86', -7, .65, 5.6);
  const stuff = st.mesh(solid); stuff.castShadow = true; root.add(stuff);
  const wheel = (g, x, z, r = .52) => { g.add(new THREE.CylinderGeometry(r, r, .36, 14).rotateX(Math.PI / 2), '#1c1f21', x, r, z); g.add(new THREE.CylinderGeometry(r * .5, r * .5, .38, 10).rotateX(Math.PI / 2), '#c9ccce', x, r, z); };
  const shell = g => { const m = g.mesh(solid); m.castShadow = true; return m; };
  // the crew's van, nose along +x
  const van = new THREE.Group(), vg = new Geo(); vg.box(-.3, .55, 0, 4.4, 1.75, 2.1, '#f3f1ea'); vg.box(2.2, .55, 0, 1, 1.15, 2.1, '#f3f1ea'); vg.box(0, 1.1, 0, 5.42, .22, 2.13, '#ee7a1c'); vg.box(1.42, 1.5, 0, .5, .62, 2.14, '#3a5a6a'); vg.box(2.72, .85, 0, .06, .16, 1.7, '#f6c81e'); vg.box(-.3, 2.32, 0, 3.4, .1, 1.4, '#a39f95'); vg.box(-.3, 2.45, 0, 3.6, .16, .4, '#e8ae1f');
  for (const x of [1.7, -1.7]) for (const z of [-1, 1]) wheel(vg, x, z, .46);
  van.add(shell(vg)); root.add(van);
  // the cement mixer, the drum turns while it works
  const mixer = new THREE.Group(), mg = new Geo(); mg.box(-.2, .72, 0, 7.5, .34, 2.2, '#2d3a35'); mg.box(2.9, 1, 0, 1.75, 1.75, 2.3, '#d8352b'); mg.box(3.42, 1.75, 0, .74, .72, 2.32, '#3a5a6a'); mg.box(3.8, .95, 0, .08, .2, 1.9, '#f6c81e'); mg.box(1.85, 1, 0, .34, 2.5, 1.6, '#a39f95'); mg.box(-3.5, 1.05, 0, .5, 1.5, 1.5, '#a39f95'); mg.box(-3.82, 2.5, 0, 1.2, .14, .56, '#a39f95'); mg.box(-4.32, 1.55, 0, .16, 1, .56, '#8a8780'); mg.box(.1, 3, 0, .22, .2, .22, '#ff9d1e');
  for (const [x, z] of [[2.9, -1.05], [2.9, 1.05], [-1.2, -1.05], [-1.2, 1.05], [-2.6, -1.05], [-2.6, 1.05]]) wheel(mg, x, z); mixer.add(shell(mg));
  const dg = new Geo(), hoop = (a, b, x, w, c) => dg.add(new THREE.CylinderGeometry(a, b, w, 18).rotateZ(Math.PI / 2), c, x, 0, 0); hoop(.8, 1.12, 1.45, .9, '#e8e4dc'); hoop(1.12, 1.18, .65, .7, '#d8352b'); hoop(1.18, 1.18, -.05, .7, '#e8e4dc'); hoop(1.18, 1.12, -.75, .7, '#d8352b'); hoop(1.12, .75, -1.55, .9, '#e8e4dc'); for (let i = 0; i < 3; i++) { const a = i * 2.094; dg.box(0, Math.sin(a) * 1.1 - .12, Math.cos(a) * 1.1, 2.6, .24, .3, '#2d3a35'); }
  const drum = shell(dg); drum.position.set(-.5, 2.1, 0); mixer.add(drum);
  const pour = new THREE.Mesh(new THREE.BoxGeometry(.6, 1, .6).translate(0, -.5, 0), new THREE.MeshLambertMaterial({ color: 0x5f5d58 })); pour.position.set(-4.35, 1.1, 0); mixer.add(pour); root.add(mixer);
  // the mobile crane: truck, turret, boom, hook
  const crane = new THREE.Group(), cg = new Geo(), Yc = '#e8ae1f'; cg.box(-.2, .75, 0, 8, .5, 2.4, Yc); cg.box(3.2, 1.2, 0, 1.6, 1.5, 2.3, Yc); cg.box(3.62, 1.8, 0, .7, .66, 2.32, '#3a5a6a'); cg.box(-3.5, 1.25, 0, 1.2, .7, 2, '#a39f95'); cg.box(3.2, 2.72, 0, .24, .2, .24, '#ff9d1e');
  for (const [x, z] of [[3, -1.1], [3, 1.1], [1.1, -1.1], [1.1, 1.1], [-2, -1.1], [-2, 1.1], [-3.3, -1.1], [-3.3, 1.1]]) wheel(cg, x, z); crane.add(shell(cg));
  const legs = [-2.6, 2].flatMap(x => [-1, 1].map(z => { const g = new Geo(); g.box(0, 0, z * .8, .34, .34, 1.6, K); g.box(0, -.9, z * 1.45, .3, 1.1, .3, K); g.box(0, -.98, z * 1.45, .8, .08, .8, C); const m = shell(g); m.position.set(x, 1, z * .9); crane.add(m); m.userData.z = z; return m; }));
  const turret = new THREE.Group(); turret.position.set(-.8, 1.25, 0); crane.add(turret); { const g = new Geo(); g.box(0, 0, 0, 2.5, .9, 2.2, Yc); g.box(-.9, .9, .68, 1, 1, .9, '#f3f1ea'); g.box(-.42, 1.2, .68, .08, .5, .78, '#3a5a6a'); turret.add(shell(g)); }
  const boom = new THREE.Group(); boom.position.y = .95; turret.add(boom); { const g = new Geo(); g.box(6.75, -.32, 0, 13.5, .64, .7, Yc); for (let x = .8; x < 13.2; x += 1.3) g.box(x, -.36, 0, .08, .72, .74, K); g.box(13.5, -.4, 0, .6, .8, .5, K); boom.add(shell(g)); }
  const trolley = new THREE.Group(); turret.add(trolley);
  const cable = new THREE.Mesh(new THREE.BoxGeometry(.07, 1, .07), new THREE.MeshBasicMaterial({ color: 0x2d3a35 })); cable.geometry.translate(0, -.5, 0); trolley.add(cable);
  const lg = new Geo(); lg.box(0, -.34, 0, .42, .3, .42, K); lg.box(0, -.6, 0, 3, .24, .24, '#c29a5f'); lg.box(0, -.86, 0, 3, .24, .24, '#b58a50'); lg.box(.1, -.6, .28, 3, .24, .24, '#b58a50');
  const load = shell(lg); trolley.add(load); root.add(crane);
  const slabG = new Geo(); slabG.box(0, 0, 0, 11, .26, 11, '#9c9a93'); slabG.box(0, .26, 0, 11.4, .02, .1, '#7c7a74'); const slab = shell(slabG); root.add(slab);
  // workers: three carriers, two on the scaffold, one inside
  const S = ['#e0b08c', '#8a5a3a', '#f0c8a6', '#c58c5e', '#6e4a2e', '#e8bb96'], V = ['#ee7a1c', '#c8dc2e', '#ee7a1c', '#2f7fbf', '#c8dc2e', '#ee7a1c'], T = ['#f6c81e', '#f3f1ea', '#d8352b', '#f6c81e', '#f3f1ea', '#f6c81e'];
  const crew = S.map((c, i) => { const w = makeWorker(V[i], c, T[i]); root.add(w.root); return w; });
  [[[-4.6, -7], [-2.6, -5.4]], [[3.9, -6.2], [1.9, -5.3]], [[3.2, 4.8], [.9, 4.9]]].forEach((p, i) => Object.assign(crew[i], { path: p, go: 1, wait: i * .3, carry: true }));
  Object.assign(crew[3], { fix: [-3, 6.8], face: Math.PI, lift: true }); Object.assign(crew[4], { fix: [2.8, -6.8], face: 0, lift: true }); Object.assign(crew[5], { fix: [.6, .4], face: 2.2, lift: false });
  crew.forEach((w, i) => { w.t0 = 2.1 + i * .24; w.home = w.path ? w.path[0] : w.fix; });
  return { root, stuff, van, mixer, drum, pour, crane, legs, turret, boom, trolley, cable, load, slab, crew };
}
const LINE = [[-3.4, 6], [-2, 6.6], [-.7, 6.2], [.7, 6.6], [2, 6.1], [3.3, 6.5]];
function resetKit(h) {
  kit = kit || makeKit(); kit.root.position.set(h.x, 0, h.z); kit.root.rotation.y = h.flip > 0 ? 0 : Math.PI; kit.root.visible = true; scene.add(kit.root); if (kit.demo) kit.demo.group.visible = false; kit.van.visible = kit.mixer.visible = kit.crane.visible = kit.stuff.visible = kit.slab.visible = false;
  kit.crew.forEach(w => { w.root.position.set(8, 0, 6.2); w.root.visible = false; w.there = false; w.root.rotation.set(0, 0, 0); w.go = 1; w.wait = kit.crew.indexOf(w) * .3; w.bag.visible = !!w.path; w.cheer = false; w.legL.rotation.x = w.legR.rotation.x = w.armL.rotation.x = w.armR.rotation.x = 0; });
}
const heading = (dx, dz) => Math.atan2(-dz, dx); // vehicles are modelled nose along +x
const BE = (a, b, c, u) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * b + u * u * c;
function stepKit(t, dt, level, finished) {
  const k = kit, ease = smooth;
  k.van.visible = true; k.van.position.set(-38 + ease(0, 2, t) * 46, Math.abs(Math.sin(t * 9)) * .03 * (t < 2 ? 1 : 0), 7.6);
  k.stuff.scale.setScalar(Math.max(.001, backOut(clamp((t - 2.6) / .45, 0, 1)))); k.stuff.visible = t > 2.6;
  // the mixer comes down the road, reverses onto the plot, pours, and drives away
  const mx = k.mixer, P = [9, 11, .5, 11.5, .5, 8.2], U = u => [BE(P[0], P[2], P[4], u), BE(P[1], P[3], P[5], u)]; mx.visible = t > 2.9 && t < 11;
  if (t < 4.6) { mx.position.set(-40 + ease(3, 4.6, t) * 49, 0, 11); mx.rotation.y = 0; }
  else if (t < 8.6) { const u = ease(4.7, 6, t), [x, z] = U(u), [a, b] = U(Math.min(1, u + .02)), [c, d] = U(Math.max(0, u - .02)); mx.position.set(x, 0, z); mx.rotation.y = heading(c - a, d - b); }
  else if (t < 9.4) { const u = 1 - ease(8.6, 9.4, t), [x, z] = U(u), [a, b] = U(Math.min(1, u + .02)), [c, d] = U(Math.max(0, u - .02)); mx.position.set(x, 0, z); mx.rotation.y = heading(c - a, d - b); }
  else { mx.position.set(9 + (t - 9.4) ** 2 * 9, 0, 11); mx.rotation.y = 0; }
  k.drum.rotation.x = t * (t > 6 && t < 8.4 ? 9 : 3.4); k.pour.visible = t > 6.1 && t < 8; k.pour.scale.y = 1.05 + Math.sin(t * 30) * .03; k.pour.scale.x = .85 + Math.sin(t * 23) * .15;
  k.slab.visible = t > 6.1 && t < 10.2; k.slab.scale.y = Math.max(.02, smooth(6.1, 8, t)) * (1 - smooth(9.4, 10.2, t)) + .001; { const g = .45 + .55 * smooth(6.1, 7.6, t); k.slab.scale.x = k.slab.scale.z = g; k.slab.position.z = (1 - g) * 5.5; }
  // the crane arrives, plants its legs, raises the boom, and backs out when the roof is on
  const cr = k.crane, cx = -8, cz = 7.6; cr.visible = t > 5; cr.position.set(cx - (1 - ease(5.2, 7, t)) * 34 - smooth(15.8, 17.6, t) * 40, 0, cz);
  const out = smooth(7, 7.5, t) * (1 - smooth(15.2, 15.7, t)); k.legs.forEach(m => { m.position.z = m.userData.z * (.9 + out * .95); m.position.y = 1 + (1 - out) * .95; });
  const up = smooth(7.4, 8.5, t) * (1 - smooth(14.5, 15.3, t)), e = .03 + up * .68; k.turret.rotation.y = up * (.76 + Math.sin(t * .6) * .36); k.boom.rotation.z = e; const reach = .55 + .45 * up; k.boom.scale.x = reach; // the boom telescopes out once it is up
  const L = 13.5 * reach, tx = Math.cos(e) * L, ty = .95 + Math.sin(e) * L - .4, hookY = clamp(Math.max(level + 1.7, 3) - 1.25, .9, ty - 1.3), drop = ty - hookY; k.trolley.position.set(tx, ty, 0); k.trolley.visible = up > .3; k.cable.scale.y = Math.max(.1, drop); k.load.position.y = -drop; k.load.rotation.y = t * .25; k.load.visible = t < 13.6;
  k.crew.forEach((w, i) => {
    const r = w.root;
    if (t < w.t0) return; r.visible = true;
    if (finished) { // everyone gathers on the lawn and celebrates
      const [x, z] = LINE[i]; r.position.x += (x - r.position.x) * .1; r.position.z += (z - r.position.z) * .1;
      r.position.y = Math.abs(Math.sin(t * 6.5 + i * .9)) * .55; r.rotation.y = 0; w.bag.visible = false;
      w.legL.rotation.x = w.legR.rotation.x = 0; w.armL.rotation.x = w.armR.rotation.x = Math.PI - .2 + Math.sin(t * 13 + i) * .25; return;
    }
    if (!w.there) { // jump out of the van and jog to the job
      const [tx, tz] = w.home, dx = tx - r.position.x, dz = tz - r.position.z, d = Math.hypot(dx, dz), v = 5 * dt;
      if (d < v) { r.position.x = tx; r.position.z = tz; r.position.y = 0; w.there = true; r.rotation.y = w.face || 0; w.bag.visible = !!w.path; } else { r.position.x += dx / d * v; r.position.z += dz / d * v; r.rotation.y = Math.atan2(dx, dz); r.position.y = Math.abs(Math.sin(t * 13)) * .14; const sw = Math.sin(t * 15 + i) * .85; w.legL.rotation.x = sw; w.legR.rotation.x = -sw; w.armL.rotation.x = -sw; w.armR.rotation.x = sw; w.bag.visible = false; }
      return;
    }
    if (w.path) { // carry a bag to the wall, walk back for the next one, always facing the way they walk
      if (w.wait > 0) { w.wait -= dt; w.legL.rotation.x = w.legR.rotation.x = 0; return; }
      const [tx, tz] = w.path[w.go], dx = tx - r.position.x, dz = tz - r.position.z, d = Math.hypot(dx, dz), v = 2.1 * dt;
      if (d < v) { r.position.x = tx; r.position.z = tz; w.go ^= 1; w.wait = .45; w.bag.visible = w.go === 1; }
      else { r.position.x += dx / d * v; r.position.z += dz / d * v; r.rotation.y = Math.atan2(dx, dz); }
      const sw = Math.sin(t * 11 + i) * .68, up = w.bag.visible; w.legL.rotation.x = sw; w.legR.rotation.x = -sw; w.armL.rotation.x = w.armR.rotation.x = up ? Math.PI - .25 : 0; if (!up) { w.armL.rotation.x = -sw * .8; w.armR.rotation.x = sw * .8; }
    } else { // hammering, on the scaffold level just below the rising wall
      if (w.lift) { const y = Math.max(0, Math.min(Math.floor(level / 2.4) * 2.4, 7.2)); r.position.y += (y - r.position.y) * .08; }
      w.armR.rotation.x = -1.7 + Math.sin(t * 12 + i) * .65;
    }
  });
}
/* ---------- an upgrade starts with the old house coming down: wrecking ball, rubble, bulldozer ---------- */
const DEMO = { end: 10, hits: [3.4, 4.4, 5.4, 6.4], left: [.72, .46, .2, 0], stages: [[0, 'The wrecking ball is coming'], [2.6, 'Knocking it down'], [7, 'Clearing the rubble']] }, DEBRIS = 64, PUFFS = 24;
function makeDemo(root) {
  const group = new THREE.Group(), Y = '#e8ae1f', K = '#2d3a35', shell = g => { const m = g.mesh(solid); m.castShadow = true; return m; };
  const wrecker = new THREE.Group(), wg = new Geo(); for (const z of [-1.3, 1.3]) { wg.box(0, 0, z, 6, .95, .8, K); for (let x = -2.6; x < 2.8; x += .75) wg.box(x, .95, z, .4, .06, .84, '#4a4f4c'); } wg.box(0, .7, 0, 4.4, .4, 2, '#4a4f4c'); wrecker.add(shell(wg));
  const turret = new THREE.Group(); turret.position.y = 1.1; wrecker.add(turret); { const g = new Geo(); g.box(-.5, 0, 0, 4, 1.1, 2.6, Y); g.box(-2.2, .2, 0, 1, 1.5, 2.4, '#a39f95'); g.box(1, 1.1, .75, 1.3, 1.25, 1, '#f3f1ea'); g.box(1.66, 1.45, .75, .06, .75, .86, '#3a5a6a'); g.box(1, 1.75, 1.26, 1.1, .5, .04, '#3a5a6a'); g.box(1, 2.4, .75, .2, .16, .2, '#ff9d1e'); turret.add(shell(g)); }
  const boom = new THREE.Group(); boom.position.set(.8, 1.1, -.5); turret.add(boom); { const g = new Geo(), L = 13; for (const y of [-.5, .5]) for (const z of [-.4, .4]) g.box(L / 2, y - .06, z, L, .12, .12, Y); for (let x = .6; x < L; x += 1.1) { g.box(x, -.5, 0, .1, 1, .9, Y); } g.box(L, -.6, 0, .7, 1.2, 1, K); boom.add(shell(g)); }
  const swing = new THREE.Group(); turret.add(swing); const rope = new THREE.Mesh(new THREE.BoxGeometry(.1, 1, .1).translate(0, -.5, 0), new THREE.MeshBasicMaterial({ color: 0x1d2220 })); swing.add(rope);
  const ball = new THREE.Group(); { const m = new THREE.Mesh(new THREE.SphereGeometry(1.5, 22, 14), new THREE.MeshStandardMaterial({ color: '#2a2c2e', roughness: .35, metalness: .85 })); m.castShadow = true; ball.add(m); const c = new THREE.Mesh(new THREE.CylinderGeometry(.14, .22, .4, 8), new THREE.MeshLambertMaterial({ color: 0x4a4f4c })); c.position.y = 1.6; ball.add(c); } swing.add(ball); group.add(wrecker);
  const dozer = new THREE.Group(), dg = new Geo(); for (const z of [-1.25, 1.25]) { dg.box(0, 0, z, 4.2, 1, .8, K); for (let x = -1.9; x < 2; x += .62) dg.box(x, 1, z, .34, .06, .84, '#4a4f4c'); } dg.box(-.2, .7, 0, 3.8, 1.2, 1.9, Y); dg.box(-.9, 1.9, 0, 1.6, 1.3, 1.7, Y); dg.box(-.1, 2.15, 0, .06, .8, 1.5, '#3a5a6a'); dg.box(-.9, 3.2, 0, 1.8, .12, 1.9, K); dg.box(1.4, 1.9, .6, .18, .8, .18, K); for (const z of [-1.2, 1.2]) dg.box(2.3, .8, z, 1.6, .22, .22, K); dg.box(3.1, .05, 0, .36, 1.75, 4.2, '#d8a51c'); dg.box(3.32, .05, 0, .1, .2, 4.3, '#a39f95'); dozer.add(shell(dg)); group.add(dozer);
  const hg = new Geo(); hg.add(new THREE.ConeGeometry(5.6, 1, 9), '#9a9184', 0, .5, 0); hg.add(new THREE.ConeGeometry(3.4, 1.6, 7), '#a8836a', -1.2, .8, .9); const heap = shell(hg); group.add(heap);
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), DEBRIS); debris.frustumCulled = false; debris.castShadow = true; group.add(debris);
  const dust = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 9), new THREE.MeshBasicMaterial({ color: '#d9cfbd', transparent: true, opacity: .24, depthWrite: false }), PUFFS); dust.frustumCulled = false; group.add(dust);
  root.add(group); return { group, wrecker, turret, boom, swing, rope, ball, dozer, heap, debris, dust };
}
const demoM = new THREE.Matrix4(), demoQ = new THREE.Quaternion(), demoE = new THREE.Euler(), demoV = new THREE.Vector3(), demoS = new THREE.Vector3(), demoC = new THREE.Color();
function startDemo(s, g) {
  const K = kit.demo = kit.demo || makeDemo(kit.root), r = Math.random; K.group.visible = true; s.bits = []; s.puffs = []; s.hit = 0; s.left = 1;
  for (let i = 0; i < DEBRIS; i++) { const v = Math.floor(r() * g.n) * 3; demoC.setRGB(g.c[v], g.c[v + 1], g.c[v + 2]); K.debris.setColorAt(i, demoC); s.bits.push({ on: false, x: 0, y: -9, z: 0, vx: 0, vy: 0, vz: 0, r: r() * 6, sp: 2 + r() * 7, k: .22 + r() * .6 }); }
  K.debris.instanceColor.needsUpdate = true; for (let i = 0; i < PUFFS; i++) s.puffs.push({ a: 9, x: 0, y: 0, z: 0, k: 1 });
  K.wrecker.visible = K.dozer.visible = true; K.heap.scale.set(.01, .01, .01);
}
function stepDemo(s, dt) {
  const K = kit.demo, t = s.t, H = DEMO.hits, r = Math.random, top = s.topOld; goal.yaw += dt * .012;
  for (const [a, x] of DEMO.stages) if (t >= a && t - dt < a) $('bt').textContent = x;
  // the wrecking machine: drives in, raises the boom, swings
  const wx = -14, wz = 9.8; K.wrecker.position.set(wx - (1 - smooth(0, 2.2, t)) * 32 - smooth(7.6, 9.6, t) * 36, 0, wz);
  const up = smooth(2.1, 2.9, t) * (1 - smooth(7, 7.6, t)), e = .1 + up * .74, A = .38; K.turret.rotation.y = up * A; K.boom.rotation.z = e;
  const tipX = .8 + Math.cos(e) * 13, tipY = 2.2 + Math.sin(e) * 13 - .6, amp = smooth(2.5, 3.4, t) * (1 - smooth(6.5, 7.2, t)), th = amp * (-.38 + .6 * Math.cos(6.283 * (t - H[0]))), L = 7.2 + smooth(H[0], H[3], t) * 1.6;
  K.swing.position.set(tipX, tipY, -.5); K.swing.rotation.z = th; K.rope.scale.y = L; K.ball.position.y = -L - 1.4;
  // each hit knocks the top off what is left
  if (s.hit < H.length && t >= H[s.hit]) {
    const n = s.hit; s.hit++; s.shake = 1; let made = 0, was = s.left * top; s.left = DEMO.left[n];
    for (const b of s.bits) { if (made >= 15 || b.on) continue; made++; const a = r() * 6.283, q = 2 + r() * 3.4; b.on = true; b.x = Math.cos(a) * q - 2.4; b.z = Math.sin(a) * q + 2.4; b.y = s.left * top + r() * Math.max(1, was - s.left * top); b.vx = 2 + r() * 5 + Math.cos(a) * 3; b.vz = -2 + r() * 2 + Math.sin(a) * 3; b.vy = 3 + r() * 6; }
    made = 0; for (const p of s.puffs) { if (made >= 7 || p.a < 1) continue; made++; p.a = 0; p.x = r() * 9 - 4.5; p.z = r() * 9 - 4.5; p.y = .8 + s.left * top * r(); p.k = .7 + r() * .9; }
  }
  s.shake = Math.max(0, (s.shake || 0) - dt * 3.4);
  const prev = s.hit ? (s.hit > 1 ? DEMO.left[s.hit - 2] : 1) : 1, now = s.hit ? DEMO.left[s.hit - 1] : 1, f = s.hit ? smooth(H[s.hit - 1], H[s.hit - 1] + .5, t) : 0; clipOld.constant = (prev + (now - prev) * f) * (top + .3); s.old.visible = clipOld.constant > .02;
  s.old.position.set((r() - .5) * .3 * s.shake, 0, (r() - .5) * .3 * s.shake);
  const gone = 1 - (prev + (now - prev) * f), clear = smooth(7.1, 9.7, t), hs = Math.max(.01, gone * (1 - clear)); K.heap.scale.set(hs * .95, hs * 1.2, hs * .95);
  // the bulldozer shoves the rubble out, two passes
  const D = K.dozer, pass = t < 7 ? 22 : t < 8 ? 22 - smooth(7, 8, t) * 22 : t < 8.5 ? 0 + smooth(8, 8.5, t) * 14 : t < 9.2 ? 14 - smooth(8.5, 9.2, t) * 13 : 1 + smooth(9.2, 10, t) * 26, dx = t < 8.1 ? -2.4 : 2.4 * smooth(8.1, 8.5, t);
  D.visible = t > 6.8; D.position.set(dx, 0, pass); D.rotation.y = Math.PI / 2; const blade = pass - 3.2;
  for (let i = 0; i < DEBRIS; i++) {
    const b = s.bits[i]; if (b.on) { if (b.y > .25 || b.vy > 0) { b.vy -= 22 * dt; b.x += b.vx * dt; b.y = Math.max(.25, b.y + b.vy * dt); b.z += b.vz * dt; b.r += b.sp * dt; if (b.y <= .25) { b.vy = 0; b.vx = b.vz = 0; } } if (t > 7 && Math.abs(b.x - dx) < 2.4 && b.z > blade - .4 && b.z < blade + 1.5) b.z = blade - .4; }
    const k = b.on ? b.k * Math.max(.001, 1 - smooth(8.9, 9.8, t)) : .001; demoE.set(b.r, b.r * .7, b.r * .4); demoQ.setFromEuler(demoE); demoS.setScalar(k); demoM.compose(demoV.set(b.x, b.y, b.z), demoQ, demoS); K.debris.setMatrixAt(i, demoM);
  }
  K.debris.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < PUFFS; i++) { const p = s.puffs[i]; p.a += dt / 1.5; const live = p.a < 1, q = live ? p.k * (.4 + p.a * 2.2) : .001; p.y += dt * .9; demoS.setScalar(q); demoM.compose(demoV.set(p.x, live ? p.y : -9, p.z), demoQ.identity(), demoS); K.dust.setMatrixAt(i, demoM); }
  K.dust.instanceMatrix.needsUpdate = true;
}
function endDemo(s) { if (!s.old) return; scene.remove(s.old); s.old.traverse(o => o.geometry && o.geometry.dispose()); s.old = null; kit.demo.group.visible = false; }
let show = null;
function playBuild(h, up = false) {
  if (show || reduced) return;
  select(h); { const d = innerHeight > innerWidth ? 62 : 44; Object.assign(goal, { d, pitch: .52, yaw: clearYaw(h, d, .52), lift: .075 }); } if (up) Object.assign(view, goal, { d: goal.d * 1.5 }); resetKit(h); document.body.classList.add('building'); marker.visible = false; board.visible = false; $('banner').hidden = false;
  $('bt').textContent = up ? `Upgrading to a ${lvName(h)}` : 'Building your house'; $('bs').textContent = `${h.num} ${h.street}`;
  hideInTown(h, true);
  const g = new Geo(), w = new Geo(), d = new Geo(); g.at(h.x, h.z, h.flip); w.at(h.x, h.z, h.flip); det = d.at(h.x, h.z, h.flip); house(g, w, h); det = null;
  const grp = new THREE.Group(), a = g.mesh(solidClip), b = w.mesh(glowClip), c = d.mesh(solidClip); a.castShadow = true; a.receiveShadow = c.receiveShadow = true; grp.add(a, b, c); scene.add(grp);
  let top = 0; for (let i = 1; i < g.n * 3; i += 3) top = Math.max(top, g.p[i]);
  const sc = new Geo().at(h.x, h.z), col = '#d4a12d', S = 6.6;
  for (const x of [-S, S]) for (const z of [-S, S]) sc.box(x, 0, z, .24, top + 1.2, .24, col);
  for (let y = 2.4; y < top + 1; y += 2.4) { for (const z of [-S, S]) sc.box(0, y, z, S * 2, .18, .18, col); for (const x of [-S, S]) sc.box(x, y, 0, .18, .18, S * 2, col); for (const z of [-S, S]) sc.box(0, y - .1, z * 1.03, S * 2, .08, 1, '#a8824a'); }
  const scaf = sc.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })); scaf.castShadow = true; scene.add(scaf);
  const base = new THREE.Vector3(h.x, 0, h.z); scaf.geometry.translate(-h.x, 0, -h.z); scaf.position.copy(base); scaf.scale.set(1, .001, 1);
  clip.constant = 0; show = { h, grp, scaf, top, t: 0, done: false, up };
  if (up) { // rebuild the old house so it can be knocked down first
    const was = up === true ? Math.max(1, h.lvl - 1) : up, og = new Geo(), ow = new Geo(), od = new Geo(), old = { ...h, lvl: was }; og.at(h.x, h.z, h.flip); ow.at(h.x, h.z, h.flip); det = od.at(h.x, h.z, h.flip); house(og, ow, old); det = null;
    const oldG = new THREE.Group(), m = og.mesh(solidOld), n = ow.mesh(glowOld), q = od.mesh(solidOld); m.castShadow = true; m.receiveShadow = q.receiveShadow = true; oldG.add(m, n, q); scene.add(oldG); let ht = 0; for (let i = 1; i < og.n * 3; i += 3) ht = Math.max(ht, og.p[i]);
    Object.assign(show, { old: oldG, topOld: ht }); grp.visible = false; clipOld.constant = ht + 1; startDemo(show, og);
  }
}
const backOut = t => { const c = 2.2; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
function burst(h) {
  const r = Math.random; confetti.visible = true; confVel.length = 0;
  for (let i = 0; i < CONF; i++) { confPos.set([h.x + (r() - .5) * 5, 9 + r() * 3, h.z + (r() - .5) * 5], i * 3); const a = r() * 6.283, s = 4 + r() * 11; confVel.push([Math.cos(a) * s, 11 + r() * 13, Math.sin(a) * s]); }
}
function endBuild() {
  const s = show; if (!s) return; show = null;
  endDemo(s); scene.remove(s.grp); scene.remove(s.scaf); scene.remove(kit.root); s.grp.traverse(o => o.geometry && o.geometry.dispose()); s.scaf.geometry.dispose();
  hideInTown(s.h, false); board.scale.setScalar(1); board.visible = true; marker.visible = true; confetti.visible = false;
  document.body.classList.remove('building'); $('banner').hidden = true; Object.assign(goal, { d: 54, pitch: .74, lift: -.08 });
  if (isMine(s.h) && !unlocked(s.h)) setTimeout(() => followSheet(s.h), 900);
}
const BUILD = { walls: 8.8, done: 14.2, end: 18.6 }, STAGES = [[2.1, 'The crew has arrived'], [4.7, 'The cement is here'], [6.1, 'Pouring the foundations'], [7, 'The crane is here'], [8.8, 'Raising the walls'], [12.4, 'Putting the roof on']];
function stepBuild(dt) {
  const s = show; s.t += dt; if (s.up && s.t < DEMO.end) return stepDemo(s, dt);
  if (s.old) { endDemo(s); s.grp.visible = true; $('bt').textContent = `Building your ${lvName(s.h)}`; }
  const t = s.t - (s.up ? DEMO.end : 0), { walls, done, end } = BUILD; goal.yaw += dt * (s.up ? .012 : .03);
  for (const [a, x] of STAGES) if (t >= a && t - dt < a) $('bt').textContent = x;
  s.scaf.scale.y = t < done ? Math.max(.001, smooth(walls - .9, walls - .1, t)) : Math.max(.001, 1 - smooth(done, done + .5, t)); s.scaf.visible = t > walls - .9 && t < done + .5;
  const level = smooth(walls, done - .2, t) * (s.top + .2); clip.constant = level + (t > done - .2 ? 3 : 0);
  stepKit(t, dt, level, s.done);
  if (t > done && !s.done) { s.done = true; burst(s.h); setBoard(s.h); board.visible = true; $('bt').textContent = s.up ? `${s.h.nick} now owns a ${lvName(s.h)}!` : `Welcome to ${CFG.name}, ${s.h.nick}!`; $('bs').textContent = `Resident ${s.h.id.toLocaleString('en-US')} of ${pop}`; }
  if (s.done) {
    board.scale.setScalar(Math.max(.01, backOut(clamp((t - done) / .5, 0, 1))));
    for (let i = 0; i < CONF; i++) { const v = confVel[i], j = i * 3; v[1] -= 20 * dt; confPos[j] += v[0] * dt; confPos[j + 1] = Math.max(.1, confPos[j + 1] + v[1] * dt); confPos[j + 2] += v[2] * dt; }
    confGeo.attributes.position.needsUpdate = true;
  }
  if (t > end) endBuild();
}
canvas.addEventListener('pointerdown', () => { if (show && show.t > .6) endBuild(); });
$('bBuild').onclick = () => selected && playBuild(selected);

/* ---------- inside a house: first example, the Mayor's living room ---------- */
const room = { on: false, scene: null, cam: new THREE.PerspectiveCamera(58, 1, .1, 80), yaw: 0, pitch: -.08, gYaw: 0, gPitch: -.08, hit: [], fire: null, flames: null, tail: null };
function say(t) { const b = $('roomSay'); b.textContent = t; b.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { b.hidden = true; }, 3800); }
/* ---------- the Mayor's residence: a walkable minimalist apartment, separate from the small house rooms ---------- */
const walk = { sets: {}, keys: new Set(), joy: { x: 0, y: 0 }, yaw: 0, pitch: 0, gy: 0, gp: 0, px: -1.5, pz: -5.6, bob: 0, cam: new THREE.PerspectiveCamera(66, 1, .05, 240), solids: [], hit: [], flames: [] };
function buildMayor() {
  const sc = new THREE.Scene(), H = 3.3, TEX = (w, h, fn, rx = 1, ry = 1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; }, R = rng(4242);
  const oakT = TEX(1024, 1024, (x, w, h) => { const C = ['#b89468', '#b08c60', '#bd9a70', '#a98559', '#c0a077']; for (let r = 0; r < 8; r++) { let a = -((r * 197) % 512); for (let i = 0; i < 4; i++) { const pw = 512, y = r * h / 8; x.fillStyle = C[Math.floor(R() * 5)]; x.fillRect(a, y, pw, h / 8); x.strokeStyle = 'rgba(70,45,20,.1)'; for (let g = 0; g < 30; g++) { const gy = y + R() * h / 8; x.beginPath(); x.moveTo(a, gy); x.bezierCurveTo(a + 150, gy + R() * 5, a + 320, gy - R() * 5, a + pw, gy + R() * 3); x.stroke(); } x.fillStyle = 'rgba(60,40,20,.35)'; x.fillRect(a, y, 2, h / 8); a += pw; } x.fillStyle = 'rgba(60,40,20,.28)'; x.fillRect(0, r * h / 8, w, 2); } }, 3, 3);
  const walnutT = TEX(512, 512, (x, w, h) => { x.fillStyle = '#4b3122'; x.fillRect(0, 0, w, h); for (let g = 0; g < 180; g++) { x.strokeStyle = `rgba(${R() < .5 ? '28,16,10' : '110,76,50'},${.1 + R() * .22})`; const a = R() * w; x.beginPath(); x.moveTo(a, 0); x.bezierCurveTo(a + R() * 18 - 9, h * .33, a + R() * 18 - 9, h * .66, a + R() * 8 - 4, h); x.stroke(); } });
  const marbleT = TEX(1024, 1024, (x, w, h) => { x.fillStyle = '#e9e4da'; x.fillRect(0, 0, w, h); for (let v = 0; v < 26; v++) { let a = R() * w, b = R() * h; x.strokeStyle = `rgba(${R() < .3 ? '176,146,92' : '132,130,132'},${.05 + R() * .16})`; x.lineWidth = .5 + R() * 1.5; x.beginPath(); x.moveTo(a, b); for (let i = 0; i < 24; i++) { a += R() * 44 - 12; b += R() * 44 - 22; x.lineTo(a, b); } x.stroke(); } });
  const travT = TEX(1024, 1024, (x, w, h) => { x.fillStyle = '#d6c7ad'; x.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { const y = R() * h; x.fillStyle = `rgba(${R() < .5 ? '168,148,116' : '232,222,202'},${.08 + R() * .2})`; x.fillRect(0, y, w, 1 + R() * 6); } x.fillStyle = 'rgba(120,102,78,.3)'; for (let r = 1; r < 4; r++) x.fillRect(0, r * h / 4, w, 2); });
  const plasterT = TEX(512, 512, (x, w, h) => { x.fillStyle = '#e4dccf'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${R() < .5 ? '255,252,246' : '205,196,182'},.014)`; const r = 2 + R() * 16; x.beginPath(); x.ellipse(R() * w, R() * h, r * 2, r, R() * 3, 0, 7); x.fill(); } }, 3, 1.5);
  const rugT = TEX(512, 512, (x, w, h) => { x.fillStyle = '#c3b9a7'; x.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${R() < .5 ? '240,234,224' : '176,166,150'},.2)`; x.fillRect(R() * w, R() * h, 2, 2); } x.strokeStyle = 'rgba(150,120,80,.45)'; x.lineWidth = 3; x.strokeRect(24, 24, w - 48, h - 48); });
  const std = o => new THREE.MeshStandardMaterial({ envMapIntensity: .42, ...o }), M = { oak: std({ map: oakT, roughness: .42 }), plaster: std({ map: plasterT, roughness: .92 }), trim: std({ color: '#e2dacd', roughness: .7 }), marble: std({ map: marbleT, roughness: .16 }), marbleF: std({ map: marbleT.clone(), roughness: .2 }), trav: std({ map: travT, roughness: .55 }), walnut: std({ map: walnutT, roughness: .42 }), black: std({ color: '#1b1a19', roughness: .38, metalness: .5 }), brass: std({ color: '#d0a95f', roughness: .26, metalness: 1, envMapIntensity: 1.2 }), linen: std({ color: '#cfc7b8', roughness: .95 }), linen2: std({ color: '#bfb3a1', roughness: .95 }), sofa: std({ color: '#b9ad9a', roughness: .96 }), leather: std({ color: '#7a5233', roughness: .5 }), rug: std({ map: rugT, roughness: 1 }), plant: std({ color: '#49683f', roughness: .7 }), white: std({ color: '#e8e4dc', roughness: .22 }), stone: std({ color: '#b9b2a6', roughness: .75 }), water: std({ color: '#5fb3c9', roughness: .08, metalness: .2, envMapIntensity: 1.3 }) }; M.marbleF.map.repeat.set(2, 2); M.marbleF.map.needsUpdate = true;
  const glow = new THREE.MeshBasicMaterial({ color: '#ffe9c6' }), glass = new THREE.MeshStandardMaterial({ color: '#dfeef2', roughness: .05, metalness: .1, transparent: true, opacity: .13, depthWrite: false, envMapIntensity: 1.4 }), g = new THREE.Group(); sc.add(g);
  const B = (w, h, d, m, x, y, z, ry = 0) => { const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); e.position.set(x, y, z); e.rotation.y = ry; g.add(e); return e; }, C = (a, b, h, m, x, y, z, n = 28) => { const e = new THREE.Mesh(new THREE.CylinderGeometry(a, b, h, n), m); e.position.set(x, y, z); g.add(e); return e; }, S = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const e = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), m); e.position.set(x, y, z); e.scale.set(sx, sy, sz); g.add(e); return e; }, solid2 = (x0, z0, x1, z1) => walk.solids.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]), tag = (x, y, z, w, h, d, say) => { const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false })); e.position.set(x, y, z); e.userData.say = say; sc.add(e); walk.hit.push(e); };
  const X0 = -10, X1 = 11, Z0 = -7, Z1 = 7, floorM = M.oak.clone(); { const f = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), floorM); f.rotation.x = -Math.PI / 2; f.position.set(.5, 0, 0); g.add(f); const c = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), M.trim); c.rotation.x = Math.PI / 2; c.position.set(.5, H, 0); g.add(c); const bf = new THREE.Mesh(new THREE.PlaneGeometry(4, 7), M.marbleF); bf.rotation.x = -Math.PI / 2; bf.position.set(9, .006, -3.5); g.add(bf); }
  const wall = (x0, z0, x1, z1, gaps = [], m = M.plaster) => { const horiz = z0 === z1, L = horiz ? x1 - x0 : z1 - z0, seg = (a, b) => { if (b - a < .01) return; const mid = (a + b) / 2; if (horiz) { B(b - a, H, .2, m, mid, H / 2, z0); B(b - a, .09, .22, M.trim, mid, .045, z0); solid2(a, z0 - .1, b, z0 + .1); } else { B(.2, H, b - a, m, x0, H / 2, mid); B(.22, .09, b - a, M.trim, x0, .045, mid); solid2(x0 - .1, a, x0 + .1, b); } }; let a = horiz ? x0 : z0; for (const [p, q] of gaps) { seg(a, p); if (horiz) B(q - p, H - 2.5, .2, m, (p + q) / 2, (H + 2.5) / 2, z0); else B(.2, H - 2.5, q - p, m, x0, (H + 2.5) / 2, (p + q) / 2); a = q; } seg(a, horiz ? x1 : z1); return L; };
  wall(-10, 0, -3, 0); wall(-3, 0, 0, 0, [[-2.4, -.6]]); wall(0, 0, 11, 0); wall(-3, 0, -3, 7, [[1.6, 5.4]]); wall(-3, -7, -3, 0, [[-4.4, -2.9]]); wall(0, -7, 0, 0, [[-4.4, -2.9]]); wall(7, -7, 7, 0, [[-3.6, -2.1]]); wall(-10, -7, -10, 7); wall(-3, -7, 0, -7); wall(7, -7, 11, -7, [], M.marble); wall(11, -7, 11, 0, [], M.marble);
  for (const [a, b, c, d] of [[7.1, -6.9, 7.1, -.1], [10.9, -6.9, 10.9, -.1]]) B(.02, H - .02, 6.8, M.marble, a, H / 2, -3.5); B(3.8, H - .02, .02, M.marble, 9, H / 2, -.11);
  const pane = (x0, z0, x1, z1) => { const horiz = z0 === z1, L = horiz ? x1 - x0 : z1 - z0; const n = Math.ceil(L / 2.2), s = L / n; for (let i = 0; i < n; i++) { const c = (horiz ? x0 : z0) + (i + .5) * s; if (horiz) { const e = B(s - .05, H, .03, glass, c, H / 2, z0); e.renderOrder = 5; } else { const e = B(.03, H, s - .05, glass, x0, H / 2, c); e.renderOrder = 5; } const q = (horiz ? x0 : z0) + i * s; if (horiz) B(.05, H, .08, M.black, q, H / 2, z0); else B(.08, H, .05, M.black, x0, H / 2, q); } if (horiz) { B(L, .05, .1, M.black, (x0 + x1) / 2, .025, z0); B(L, .05, .1, M.black, (x0 + x1) / 2, H - .025, z0); solid2(x0, z0 - .08, x1, z0 + .08); } else { B(.1, .05, L, M.black, x0, .025, (z0 + z1) / 2); B(.1, .05, L, M.black, x0, H - .025, (z0 + z1) / 2); solid2(x0 - .08, z0, x0 + .08, z1); } };
  pane(-10, 7, 11, 7); pane(11, 0, 11, 7); pane(-10, -7, -3, -7); pane(0, -7, 7, -7);
  // cove light above every wall line, the only ceiling detail
  for (const [x, z, w, d] of [[-6.5, -.26, 6.6, .05], [-6.5, .26, 6.6, .05], [4, .26, 13.6, .05], [3.5, -.26, 6.6, .05], [-.2 - 2.75, -3.5, .05, 6.6]]) { const e = B(w, .02, d, glow, x, H - .02, z); e.castShadow = false; }
  // front door at the head of the hall
  B(1.3, 2.5, .08, M.walnut, -1.5, 1.25, -6.88); B(.03, .8, .05, M.brass, -1.05, 1.1, -6.82); tag(-1.5, 1.25, -6.8, 1.4, 2.5, .2, 'The front door. Everyone is welcome. Mostly.');
  /* living room: travertine wall, long fire, low sofa */
  B(8.6, H, .1, M.trav, 5.2, H / 2, .16); B(5.2, .34, .13, M.black, 5.2, .72, .17); const fL = new THREE.PointLight('#ff9d55', 5, 8, 2); fL.position.set(5.2, .8, .8); sc.add(fL); walk.fire = fL; for (let i = 0; i < 16; i++) { const e = new THREE.Mesh(new THREE.ConeGeometry(.1, .3, 6).translate(0, .15, 0), new THREE.MeshBasicMaterial({ color: i % 3 ? '#ffb24d' : '#ffe9a0', toneMapped: false })); e.position.set(2.9 + i * .31, .57, .21); e.userData.h = .9 + (i * 37 % 10) / 14; g.add(e); walk.flames.push(e); } B(5.3, .03, .4, M.brass, 5.2, .55, .3); tag(5.2, .75, .3, 5.2, .6, .2, 'Gas fire. The Mayor calls it a budget item.');
  { const x = 5.2, z = 3.5; B(3.7, .36, 1.05, M.sofa, x, .3, z, 0); B(3.7, .58, .25, M.sofa, x, .68, z + .55); for (const s of [-1, 1]) B(.25, .46, 1.3, M.sofa, x + s * 1.97, .46, z + .1); for (const s of [-1, 0, 1]) { B(1.16, .17, .98, M.linen, x + s * 1.2, .57, z - .03); B(1.1, .44, .17, M.linen, x + s * 1.2, .86, z + .35).rotation.x = -.15; } B(1.6, .36, 1.1, M.sofa, x + 2.7, .3, z - 1); solid2(x - 2.2, z - .55, x + 3.5, z + .7); B(.5, .34, .34, M.linen2, x - .9, .85, z + .24); C(.62, .62, .05, M.marble, x - .45, .36, 1.75); C(.04, .04, .34, M.brass, x - .45, .17, 1.75, 12); C(.42, .42, .05, M.marble, x + .55, .46, 1.9); C(.04, .04, .44, M.brass, x + .55, .22, 1.9, 12); solid2(x - 1.1, 1.1, x + 1, 2.35); const r = B(7, .012, 4.4, M.rug, x, .008, 2.4); r.receiveShadow = true; tag(x, .7, z, 3.8, 1.2, 1.3, 'Seats six. The Mayor sits in the same spot every evening.'); B(.04, 1.9, .04, M.brass, 1.2, .95, 5.9); C(.3, .3, .03, M.black, 1.2, .02, 5.9); C(.36, .24, .24, M.linen, 1.2, 2, 5.9, 24); solid2(.9, 5.6, 1.5, 6.2); }
  { const x = 9.8, z = 1; C(.42, .32, .62, M.stone, x, .31, z); C(.05, .08, 1.7, M.walnut, x, 1.3, z, 8); for (let i = 0; i < 34; i++) { const a = i * 2.39, r = .22 + (i % 7) * .08, e = S(.15, M.plant, x + Math.cos(a) * r, 1.7 + (i % 9) * .13, z + Math.sin(a) * r, 1.3, .2, .6); e.rotation.set(a, a * .7, .5); } solid2(x - .42, z - .42, x + .42, z + .42); B(.05, 1.6, 1.15, M.black, 10.85 - 8.6 - .2 + 6, 1.7, .25).visible = false; }
  { const c = TEX(640, 400, (x, w, h) => { x.fillStyle = '#f0ebe1'; x.fillRect(0, 0, w, h); x.fillStyle = '#c8a367'; x.beginPath(); x.arc(w * .34, h * .46, 92, 0, 7); x.fill(); x.fillStyle = '#39302a'; x.fillRect(w * .5, h * .18, 8, h * .62); x.strokeStyle = '#8c7f70'; x.lineWidth = 3; x.beginPath(); x.moveTo(40, h * .78); x.bezierCurveTo(w * .3, h * .58, w * .6, h * .94, w - 40, h * .66); x.stroke(); }); B(1.96, 1.26, .04, M.black, -1.5, 1.6, 6.9).visible = false; const a = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.9), new THREE.MeshStandardMaterial({ map: c, roughness: .9 })); a.position.set(-2.87, 1.65, 6.15 - 2.9 + .001); a.visible = false; g.add(a); const art = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ map: c, roughness: .9 })); art.position.set(5.2, 2.1, .245); art.userData.keep = true; g.add(art); B(2.46, 1.56, .03, M.brass, 5.2, 2.1, .21); }
  /* kitchen: walnut wall, marble island */
  { B(.62, 3.2, 6.8, M.walnut, -9.6, 1.6, 3.5); B(.03, .62, 3.6, M.marble, -9.27, 1.24, 3.7); B(.64, .9, 3.6, M.walnut, -9.6, .45, 3.7); solid2(-10, .1, -9.2, 6.9); for (let i = 0; i < 6; i++) B(.012, 3.1, .008, M.black, -9.285, 1.6, .9 + i * .96).visible = i < 1 || i > 4; B(.03, .012, .66, M.black, -9.28, .92, 3.2); C(.015, .02, .34, M.brass, -9.32, 1.1, 4.4, 12); B(.22, .02, .02, M.brass, -9.22, 1.26, 4.4); const c = [-6.5, 3.5]; B(3.8, .9, 1.25, M.walnut, c[0], .45, c[1]); B(3.95, .07, 1.4, M.marble, c[0], .935, c[1]); solid2(c[0] - 2, c[1] - .72, c[0] + 2, c[1] + .72); C(.2, .1, .1, M.black, c[0] - 1, 1.03, c[1], 24); for (let i = 0; i < 5; i++) S(.06, std({ color: ['#d9a23a', '#c8562b', '#8ba23d'][i % 3], roughness: .5 }), c[0] - 1 + Math.cos(i * 1.3) * .09, 1.1, c[1] + Math.sin(i * 1.3) * .09); for (const dx of [-1.2, 0, 1.2]) { C(.2, .2, .05, M.leather, c[0] + dx, .68, c[1] + 1.05, 24); C(.02, .02, .66, M.black, c[0] + dx, .33, c[1] + 1.05, 10); C(.17, .17, .015, M.black, c[0] + dx, .01, c[1] + 1.05, 20); solid2(c[0] + dx - .2, c[1] + .85, c[0] + dx + .2, c[1] + 1.25); } for (const dx of [-1.2, 0, 1.2]) { B(.006, H - 1.95 - .05, .006, M.black, c[0] + dx, (H + 1.95) / 2, c[1]); C(.11, .17, .18, M.brass, c[0] + dx, 1.86, c[1], 24); S(.05, glow, c[0] + dx, 1.8, c[1]); } tag(c[0], 1, c[1], 3.9, 1, 1.3, 'Solid marble. It took eleven people and one apology to the lift engineer.'); tag(-9.4, 1.3, 3.5, .5, 2.4, 6, 'No handles. Nobody can find the fridge. Nobody minds.'); }
  /* study: desk, walnut wall, town model */
  { B(.36, 3.3, 6.8, M.walnut, -9.72, H / 2, -3.5); for (let r = 0; r < 4; r++) for (let i = 0; i < 2; i++) { const z = -5.1 + i * 3.2, y = .9 + r * .62; B(.04, .52, 2.5, M.black, -9.52, y, z); for (let k = 0; k < 18; k++) { const h2 = .34 + (k * 7 % 5) * .03; if ((k + r) % 7 === 0) continue; B(.2, h2, .05, std({ color: ['#e4ddd0', '#7a5233', '#2e2c2a', '#bfb3a1', '#c8a367'][(k * 3 + r) % 5], roughness: .7 }), -9.42, y - .22 + h2 / 2, z - 1.05 + k * .118); } } solid2(-10, -7, -9.4, 0); const x = -6.3, z = -3.6; B(2.5, .06, 1, M.walnut, x, .75, z); for (const s of [-1, 1]) B(.06, .74, .9, M.brass, x + s * 1.2, .37, z); B(.34, .012, .22, M.black, x, .79, z + .05); B(.34, .22, .01, M.black, x, .9, z - .08).rotation.x = -.2; C(.05, .08, .02, M.brass, x + .85, .79, z - .2, 16); C(.012, .012, .32, M.brass, x + .85, .95, z - .2, 8); S(.07, glow, x + .85, 1.14, z - .2); solid2(x - 1.3, z - .55, x + 1.3, z + .55); B(.62, .08, .62, M.leather, x, .46, z + .95); B(.62, .72, .08, M.leather, x, .84, z + 1.25); C(.03, .03, .42, M.black, x, .21, z + .95, 10); C(.3, .3, .02, M.black, x, .01, z + .95, 18); solid2(x - .34, z + .65, x + .34, z + 1.3); tag(x, 1, z, 2.6, .8, 1.1, 'The Mayor signs everything here. Today: forty-one parking permits and a cheese ruling.'); const px = -4.2, pz = -1.3; B(1, .9, 1, M.trav, px, .45, pz); B(.96, .03, .96, M.oak, px, .92, pz); const r2 = rng(7); for (let i = 0; i < 26; i++) B(.08 + r2() * .08, .05 + r2() * .22, .08 + r2() * .08, std({ color: ['#c76a45', '#e8e0d0', '#3c5c50'][i % 3], roughness: .6 }), px - .36 + r2() * .72, 1, pz - .36 + r2() * .72); C(.03, .03, .24, M.brass, px, 1.05, pz, 8); solid2(px - .52, pz - .52, px + .52, pz + .52); tag(px, 1, pz, 1, .5, 1, `A scale model of ${CFG.name}. Every resident gets a tiny house here too.`); B(1.1, .02, .03, M.brass, -3.14, 2.15, -1.3).visible = false; }
  /* bedroom: fabric headboard wall, low bed */
  { const x = 3.5; B(5.6, 1.5, .1, M.linen2, x, .95, -.16); B(5.6, .02, .12, M.brass, x, 1.71, -.16); const bz = -1.45; B(2.3, .14, 2.4, M.walnut, x, .13, bz); B(2.2, .3, 2.25, M.white, x, .34, bz); B(2.26, .1, 1.4, M.linen, x, .48, bz - .52); for (const s of [-1, 1]) { B(.82, .2, .46, M.white, x + s * .5, .6, -.5); B(.76, .17, .4, M.linen2, x + s * .5, .68, -.68); B(.56, .12, .56, M.walnut, x + s * 1.6, .32, -.48); C(.008, .008, 1.5, M.black, x + s * 1.6, H - .75, -.48, 6); S(.1, glow, x + s * 1.6, H - 1.55, -.48); } solid2(x - 1.2, -2.7, x + 1.2, -.2); B(1.6, .42, .46, M.leather, x, .24, -3.2); solid2(x - .85, -3.45, x + .85, -2.95); const r = B(4.4, .012, 4, M.rug, x, .008, -2.8); tag(x, .5, bz, 2.3, .5, 2.4, 'The Mayor wakes at six. The cat wakes the Mayor at five.'); for (const s of [0, 1]) { B(1.4, H - .08, .05, std({ color: '#efe8dc', roughness: .95, transparent: true, opacity: .55 }), .9 + s * 5.2, H / 2, -6.82); } B(2.2, 2.5, .6, M.walnut, 5.8, 1.25, -.4).visible = false; const cx = 5.6, cz = -5.9; B(.9, .34, .9, M.linen2, cx, .17, cz); S(.2, std({ color: '#d9892f', roughness: .85 }), cx, .5, cz, 1.25, .9, 1); S(.13, std({ color: '#d9892f', roughness: .85 }), cx + .22, .62, cz + .05); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(.04, .1, 5), std({ color: '#c47a26', roughness: .85 })); e.position.set(cx + .22, .76, cz + .05 + s * .07); g.add(e); } solid2(cx - .46, cz - .46, cx + .46, cz + .46); tag(cx, .5, cz, .9, .7, .9, "This is Councillor Whiskers. He's on the council. He has never voted."); }
  /* bathroom: marble box, freestanding tub, floating vanity */
  { const x = 9, tz = -5.35, tub = new THREE.Mesh(new THREE.CylinderGeometry(.82, .68, .58, 36), M.white); tub.scale.set(1.15, 1, .78); tub.position.set(x, .3, tz); g.add(tub); const w = new THREE.Mesh(new THREE.CylinderGeometry(.74, .74, .02, 36), M.water); w.scale.set(1.15, 1, .78); w.position.set(x, .57, tz); g.add(w); C(.02, .02, .95, M.brass, x + 1.15, .47, tz, 12); B(.26, .02, .02, M.brass, x + 1.02, .95, tz); solid2(x - .98, tz - .68, x + .98, tz + .68); tag(x, .6, tz, 2, .7, 1.4, 'One slab of stone, carved by hand. The view is included.'); const vz = -1.2; B(.6, .42, 2.4, M.walnut, 10.65, .78, vz); B(.64, .05, 2.5, M.marble, 10.63, 1.015, vz); solid2(10.3, vz - 1.25, 10.9, vz + 1.25); for (const s of [-.62, .62]) { C(.2, .15, .1, M.white, 10.62, 1.09, vz + s, 24); C(.012, .012, .2, M.brass, 10.84, 1.13, vz + s, 10); const mr = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .02, 40), std({ color: '#ffffff', roughness: .03, metalness: 1, envMapIntensity: 1.5 })); mr.rotation.z = Math.PI / 2; mr.position.set(10.87, 1.72, vz + s); g.add(mr); const ring = new THREE.Mesh(new THREE.TorusGeometry(.44, .012, 8, 48), glow); ring.rotation.y = Math.PI / 2; ring.position.set(10.86, 1.72, vz + s); g.add(ring); } tag(10.6, 1.3, vz, .6, 1.6, 2.5, 'Two sinks. One Mayor. It is a matter of principle.'); B(.02, H - .1, 1.6, glass, 7.15 + 1.5, H / 2, -1.3).visible = false; const e = B(1.7, H, .03, glass, 8, H / 2, -2.25 - .75 + .75); e.visible = false; { const sh = B(.03, 2.2, 1.5, glass, 8.5, 1.1, -5.75 + 4.4); sh.renderOrder = 5; sh.position.set(8.5, 1.1, -1.05); B(1.46, .02, 1.7, M.marbleF, 7.8, .02, -1.05); C(.13, .13, .012, M.brass, 7.8, 2.32, -1.05, 28); C(.012, .012, .3, M.brass, 7.8, 2.48, -1.05, 8); solid2(8.47, -1.8, 8.53, -.3); tag(7.8, 1.2, -1.05, 1.4, 2.4, 1.6, 'Rain shower. The only rain the Mayor approves of.'); } B(.08, .92, .5, M.brass, 7.16, 1.3, -5).visible = false; const ww = B(1.4, .02, .4, M.linen, 9, .05, -3.6); ww.visible = true; }
  /* a small terrace beyond the glass, then the town */
  { walk.deck = M.trav.clone(); B(14, .3, 2.4, walk.deck, 4, -.16, 8.2); for (let i = 0; i < 7; i++) { const e = B(1.95, 1.05, .02, glass, -2 + i * 2, .52, 9.38); e.renderOrder = 5; } for (const x of [-2.98, 10.98]) { const e = B(.02, 1.05, 2.36, glass, x, .52, 8.2); e.renderOrder = 5; } const v = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, 8), M.black); v.visible = false; g.add(v); walk.pano = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 80, 48, 1, true), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false })); walk.pano.position.y = 14; sc.add(walk.pano); const d = new THREE.Mesh(new THREE.CircleGeometry(120, 32), new THREE.MeshBasicMaterial({ color: '#6f9c5b' })); d.rotation.x = -Math.PI / 2; d.position.y = -8; sc.add(d); walk.ground = d; }
  /* the small things that make a room feel lived in */
  { const clay = std({ color: '#b5694a', roughness: .75 }), sage = std({ color: '#7f8f78', roughness: .85 }), cream = std({ color: '#e9e2d4', roughness: .6 }), ink = std({ color: '#2b2a29', roughness: .5 }), pot = std({ color: '#d7cdbd', roughness: .35 }), veil = std({ color: '#efe7da', roughness: 1, transparent: true, opacity: .62 });
    // living room
    for (const [x, z, m] of [[3.5, 3.72, clay], [4.1, 3.75, sage], [6.8, 3.72, clay], [6.25, 3.76, cream]]) { const e = S(.27, m, x, .94, z, 1, .95, .42); e.rotation.x = -.2; } for (let i = 0; i < 4; i++) B(.42 - i * .03, .035, .3 - i * .02, [ink, cream, clay, sage][i], 4.75, .405 + i * .036, 1.75, i * .22); C(.07, .11, .26, pot, 5.75, .62, 1.9, 20); for (let i = 0; i < 7; i++) { const a = i * 1.1, e = C(.004, .006, .5, M.walnut, 5.75 + Math.cos(a) * .05, .96, 1.9 + Math.sin(a) * .05, 5); e.rotation.set(Math.sin(a) * .2, 0, Math.cos(a) * .2); S(.04, sage, 5.75 + Math.cos(a) * .15, 1.2, 1.9 + Math.sin(a) * .15, 1, 1.5, 1); } for (const x of [-2.7, 2.6, 3.1]) for (let i = 0; i < 8; i++) C(.07, .07, H - .1, veil, x + i * .14 * (x < 0 ? 1 : 0) + (x > 0 ? (x - 2.6) * 0 : 0), H / 2, 6.8).visible = x < 0; for (let i = 0; i < 10; i++) C(.075, .085, H - .08, veil, 10.72, H / 2, 6.8 - i * .17, 8); B(.14, .06, 2.1, M.black, 10.72, H - .1, 6);
    B(1.1, .02, .34, M.brass, 2.6, 1.6 - 1.6 + .01, 2.4).visible = false; B(.5, .45, .5, M.trav, 1.05, .23, 3.4); C(.1, .13, .3, clay, 1.05, .6, 3.4, 20); solid2(.8, 3.15, 1.3, 3.65);
    // kitchen
    B(.34, .04, 3.4, M.walnut, -9.1, 1.95, 3.7); for (const [z, h2, m] of [[2.4, .3, cream], [2.75, .22, ink], [3.05, .36, clay], [4.4, .26, pot], [4.75, .2, sage], [5.1, .32, cream]]) C(.075, .085, h2, m, -9.1, 1.97 + h2 / 2, z, 18); B(.3, .38, .3, M.black, -9.15, 1.13, 2.4); C(.06, .06, .04, M.brass, -9.05, 1.2, 2.4, 14); for (const z of [3.1, 3.3]) { B(.34, .012, .17, M.black, -9.08, .932, z + .1); } C(.1, .11, .26, pot, -5.4, 1.1, 3.3, 22); for (let i = 0; i < 9; i++) { const a = i * .7, h2 = .3 + (i % 3) * .1; const e = C(.004, .006, h2, M.plant, -5.4 + Math.cos(a) * .04, 1.25 + h2 / 2, 3.3 + Math.sin(a) * .04, 5); e.rotation.set(Math.sin(a) * .22, 0, Math.cos(a) * .22); S(.05, M.plant, -5.4 + Math.cos(a) * .11, 1.3 + h2, 3.3 + Math.sin(a) * .11, 1.6, .5, .8); } B(.42, .035, .26, M.walnut, -7.7, .985, 3.25); S(.05, std({ color: '#d9c49a', roughness: .8 }), -7.7, 1.04, 3.25, 1.6, .7, 1);
    // dining table by the window
    { const x = -6.5, z = 5.95, w = std({ map: walnutT, roughness: .35 }); w.map = walnutT; B(2.4, .05, .9, M.walnut, x, .74, z); for (const a of [-1, 1]) B(.05, .72, .8, M.black, x + a * 1.05, .36, z); solid2(x - 1.25, z - .5, x + 1.25, z + .55); for (const a of [-.8, .8]) { B(.42, .05, .42, M.leather, x + a, .45, z - .68); B(.42, .4, .04, M.leather, x + a, .68, z - .87); C(.02, .02, .43, M.black, x + a, .22, z - .68, 8); solid2(x + a - .22, z - .9, x + a + .22, z - .48); } C(.05, .06, .3, pot, x, .92, z, 18); }
    // study
    B(3.4, .012, 2.4, M.rug, -6.3, .008, -3.3); C(.26, .26, .02, M.brass, -3.7, .01, -5.9); C(.02, .02, 1.5, M.brass, -3.7, .76, -5.9, 8); S(.24, std({ color: '#3b5a6b', roughness: .35 }), -3.7, 1.72, -5.9); solid2(-3.95, -6.15, -3.45, -5.65); tag(-3.7, 1.5, -5.9, .6, 1, .6, 'A globe. The Mayor has marked exactly one place on it.'); B(.02, 1.2, .8, std({ color: '#2f6f5e', roughness: .9 }), -3.22, 1.75, -6.2).visible = true; for (let i = 0; i < 6; i++) B(.24, .05, .3, [clay, ink, cream, sage][i % 4], -5.4 + (i % 2) * .02, .8 + i * .05, -3.3);
    // bedroom wardrobe and curtains
    B(.62, H - .1, 3.6, M.walnut, 6.56, H / 2 - .05, -5.1); for (let i = 1; i < 3; i++) B(.012, H - .2, .01, M.black, 6.24, H / 2, -6.9 + i * 1.2); for (const z of [-6.3, -5.1, -3.9]) B(.03, .9, .02, M.brass, 6.23, 1.2, z + .55); solid2(6.2, -6.9, 7, -3.3); tag(6.5, 1.5, -5.1, .7, 2.8, 3.6, 'A walk-in wardrobe. Twelve identical grey suits. The Mayor likes decisions made.'); for (const [x, m] of [[2, cream], [5, clay]]) B(.28, .04, .2, m, x, .4, -.48); C(.04, .05, .15, pot, 5.05, .49, -.45, 14); { const c = TEX(500, 360, (x, w, h) => { x.fillStyle = '#e9e2d4'; x.fillRect(0, 0, w, h); x.fillStyle = '#7f8f78'; x.beginPath(); x.moveTo(0, h); x.lineTo(w * .3, h * .35); x.lineTo(w * .55, h * .7); x.lineTo(w * .75, h * .28); x.lineTo(w, h); x.fill(); x.fillStyle = '#c8a367'; x.beginPath(); x.arc(w * .72, h * .25, 34, 0, 7); x.fill(); }), e = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.05), new THREE.MeshStandardMaterial({ map: c, roughness: .9 })); e.position.set(3.5, 2.42, -.24); e.rotation.y = Math.PI; e.userData.keep = true; g.add(e); B(1.56, 1.11, .03, M.black, 3.5, 2.42, -.2); }
    // bathroom
    B(.03, .02, 1.1, M.brass, 7.2, 1.2, -5); B(.05, .85, .9, cream, 7.22, .82, -5); B(.45, .42, .45, M.walnut, 7.65, .21, -6.45); C(.13, .13, .02, M.brass, 7.65, .43, -6.45); for (const [z, h2, m] of [[-1.7, .14, ink], [-1.55, .17, pot], [-.75, .14, ink], [-.6, .17, cream]]) C(.03, .035, h2, m, 10.75, 1.04 + h2 / 2, z, 14); for (let i = 0; i < 3; i++) B(.42, .08, .28, i % 2 ? cream : sage, 10.65, .62 - i * .09 + .1 - .2, -1.2).visible = false; B(1.5, .03, .32, M.walnut, 9, .615, -5.35); C(.05, .05, .08, cream, 8.7, .67, -5.35, 16); C(.045, .05, .15, clay, 9.2, .7, -5.35, 16); S(.04, glow, 8.7, .75, -5.35, 1, 1.5, 1); { const x = 7.5, z = -6.4, e = C(.18, .13, .34, pot, x + 3.05, .17, z + .1, 18); for (let i = 0; i < 11; i++) { const a = i * 1.9, r = S(.1, M.plant, x + 3.05 + Math.cos(a) * .13, .5 + (i % 4) * .12, z + .1 + Math.sin(a) * .13, 1.1, .22, .6); r.rotation.set(a, a, .5); } solid2(x + 2.85, z - .1, x + 3.25, z + .3); }
  }
  { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), q = x.createRadialGradient(64, 64, 18, 64, 64, 64); q.addColorStop(0, 'rgba(30,20,12,.62)'); q.addColorStop(1, 'rgba(30,20,12,0)'); x.fillStyle = q; x.fillRect(0, 0, 128, 128); const mt = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }); for (const [px, pz, w, d] of [[5.2, 3.6, 6.8, 2.8], [-6.5, 3.5, 5.2, 2.6], [-6.3, -3.6, 3.6, 2.4], [3.5, -1.5, 3.6, 3.8], [9, -5.35, 3, 2.3], [7.6, -.5, 0, 0], [-4.2, -1.3, 1.9, 1.9], [9.8, 1, 1.4, 1.4]]) { if (!w) continue; const e = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mt); e.rotation.x = -Math.PI / 2; e.position.set(px, .014, pz); e.renderOrder = 2; g.add(e); } const a = document.createElement('canvas'); a.width = 8; a.height = 64; const ax = a.getContext('2d'), ag = ax.createLinearGradient(0, 0, 0, 64); ag.addColorStop(0, 'rgba(40,28,18,.34)'); ag.addColorStop(1, 'rgba(40,28,18,0)'); ax.fillStyle = ag; ax.fillRect(0, 0, 8, 64); const am = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(a), transparent: true, depthWrite: false, side: THREE.DoubleSide }); for (const [x0, z0, x1, z1] of [[-9.88, -6.88, -3.12, -6.88], [-9.88, .12, -3.12, .12], [-9.88, -.12, -3.12, -.12], [-2.88, .12, 10.9, .12], [.12, -.12, 6.88, -.12], [-2.88, -.12, -.12, -.12], [-3.12, -6.88, -3.12, -.12], [-2.88, -6.88, -2.88, -.12], [-.12, -6.88, -.12, -.12], [.12, -6.88, .12, -.12], [6.88, -6.88, 6.88, -.12], [7.12, -6.88, 7.12, -.12], [10.88, -6.88, 10.88, -.12], [7.12, -6.88, 10.88, -6.88], [7.12, -.12, 10.88, -.12], [-9.88, .12, -9.88, 6.88], [-3.12, .12, -3.12, 6.88], [-2.88, .12, -2.88, 6.88]]) { const L = Math.hypot(x1 - x0, z1 - z0), e = new THREE.Mesh(new THREE.PlaneGeometry(L, .7), am); e.position.set((x0 + x1) / 2, H - .35, (z0 + z1) / 2); e.rotation.y = z0 === z1 ? 0 : Math.PI / 2; e.renderOrder = 2; g.add(e); const f = new THREE.Mesh(new THREE.PlaneGeometry(L, .45), am); f.position.set((x0 + x1) / 2, .225, (z0 + z1) / 2); f.rotation.set(Math.PI, z0 === z1 ? 0 : Math.PI / 2, 0); f.renderOrder = 2; g.add(f); } }
  bakeRoom(sc, g, glow);
  walk.hemi = new THREE.HemisphereLight('#fff1dc', '#8e7a62', .42); walk.sun = new THREE.DirectionalLight('#fff0d8', 2.8); walk.sun.position.set(6, 16, 26); walk.sun.target.position.set(1, 0, 0); walk.sun.castShadow = true; walk.sun.shadow.mapSize.set(2048, 2048); Object.assign(walk.sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 60 }); walk.sun.shadow.bias = -.0005; walk.sun.shadow.normalBias = .03; walk.bulbs = [[-6.5, 2.6, 3.5, 4], [3.5, 2.8, -3, 4], [9, 2.7, -3.5, 3], [-6.3, 2.7, -3.5, 4]].map(([x, y, z, i]) => { const l = new THREE.PointLight('#ffdcb0', i, 11, 1.8); l.position.set(x, y, z); sc.add(l); return l; }); sc.add(walk.hemi, walk.sun, walk.sun.target); walk.scene = sc;
}
function bakeRoom(sc, g, glow) {
  // merge all static parts by material, so a phone only draws a few dozen batches
  sc.updateMatrixWorld(true); const byMat = new Map(), keep = []; g.traverse(o => { if (!o.isMesh) return; if (!o.visible) return; if (walk.flames.includes(o) || o.material.transparent || o.userData.keep) { keep.push(o); return; } if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(o); });
  const merged = new THREE.Group(); for (const [m, list] of byMat) { const P = [], Nn = [], U = [], v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3(); for (const o of list) { const q = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, p = q.attributes.position, nr = q.attributes.normal, uv = q.attributes.uv; nm.getNormalMatrix(o.matrixWorld); const s = new THREE.Vector3(); o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); P.push(v.x, v.y, v.z); n.fromBufferAttribute(nr, i).applyMatrix3(nm).normalize(); Nn.push(n.x, n.y, n.z); if (uv) { const big = Math.abs(n.y) > .5 ? [v.x / 4, v.z / 4] : Math.abs(n.x) > .5 ? [v.z / 4, v.y / 4] : [v.x / 4, v.y / 4]; if (m.map) U.push(big[0], big[1]); else U.push(uv.getX(i), uv.getY(i)); } else U.push(0, 0); } } const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); gg.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); const e = new THREE.Mesh(gg, m); e.castShadow = !m.transparent && m !== glow; e.receiveShadow = m !== glow; merged.add(e); } sc.remove(g); for (const o of keep) { o.parent && o.parent.remove(o); sc.add(o); o.position.setFromMatrixPosition(o.matrixWorld); } sc.add(merged);
  const em = new THREE.Scene(), grad = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 p; void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 p; void main(){float t=p.y*.5+.5; gl_FragColor=vec4(mix(vec3(.55,.47,.38),vec3(1.4,1.35,1.3),t),1.);}' })); em.add(grad); const pm = new THREE.PMREMGenerator(renderer); sc.environment = pm.fromScene(em, .04).texture; pm.dispose();
}
/* ---------- a resident's home: hall, living room, kitchen, bedroom, bathroom ---------- */
const HOME_TINTS = [['#f2dfc4', '#2f6b57', '#b9674a'], ['#dfe8ea', '#3a5d8f', '#3f6f7d'], ['#f4d8c4', '#a8483c', '#5f7a6a'], ['#efe0bf', '#c08a2e', '#44586b'], ['#dfe8d2', '#6b4f8a', '#7a5a3c'], ['#efe2d6', '#2e7d8c', '#8a5a3c']];
const homeRooms = [['Living room', -6, 0, 1.5, 4], ['Kitchen', 1.5, 0, 6, 4], ['Hall', -1, -4, 1.5, 0], ['Bedroom', -6, -4, -1, 0], ['Bathroom', 1.5, -4, 6, 0]];
function buildHome() {
  const sc = new THREE.Scene(), H = 2.8, R = rng(777), g = new THREE.Group(); sc.add(g);
  const TEX = (w, h, fn, rx = 1, ry = 1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; };
  const floorT = TEX(1024, 1024, (x, w, h) => { const C = ['#a8784c', '#9f7044', '#b08254', '#96683e', '#ad7e50']; for (let r = 0; r < 8; r++) { let a = -((r * 197) % 512); const y = r * h / 8; for (let i = 0; i < 4; i++) { x.fillStyle = C[Math.floor(R() * 5)]; x.fillRect(a, y, 512, h / 8); x.strokeStyle = 'rgba(60,36,16,.12)'; for (let k = 0; k < 24; k++) { const gy = y + R() * h / 8; x.beginPath(); x.moveTo(a, gy); x.bezierCurveTo(a + 150, gy + R() * 5, a + 320, gy - R() * 5, a + 512, gy + R() * 3); x.stroke(); } x.fillStyle = 'rgba(50,30,14,.35)'; x.fillRect(a, y, 2, h / 8); a += 512; } x.fillStyle = 'rgba(50,30,14,.3)'; x.fillRect(0, y, w, 2); } }, 3, 3);
  const woodT = TEX(512, 512, (x, w, h) => { x.fillStyle = '#6b4529'; x.fillRect(0, 0, w, h); for (let k = 0; k < 160; k++) { x.strokeStyle = `rgba(${R() < .5 ? '36,20,10' : '150,104,66'},${.1 + R() * .2})`; const a = R() * w; x.beginPath(); x.moveTo(a, 0); x.bezierCurveTo(a + R() * 18 - 9, h * .33, a + R() * 18 - 9, h * .66, a + R() * 8 - 4, h); x.stroke(); } });
  const plasterT = TEX(512, 512, (x, w, h) => { x.fillStyle = '#f6f2ea'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2200; i++) { x.fillStyle = `rgba(${R() < .5 ? '255,255,255' : '214,206,194'},.018)`; const r = 2 + R() * 14; x.beginPath(); x.ellipse(R() * w, R() * h, r * 2, r, R() * 3, 0, 7); x.fill(); } }, 3, 1.5);
  const tileT = TEX(512, 512, (x, w, h) => { const n = 4, s = w / n; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { const v = 226 + Math.floor(R() * 14); x.fillStyle = `rgb(${v},${v - 2},${v - 8})`; x.fillRect(a * s, b * s, s, s); } x.fillStyle = 'rgba(120,112,100,.6)'; for (let i = 0; i <= n; i++) { x.fillRect(i * s - 1.5, 0, 3, h); x.fillRect(0, i * s - 1.5, w, 3); } }, 2.5, 2.5);
  const rugT = TEX(512, 512, (x, w, h) => { x.fillStyle = '#d9cdb8'; x.fillRect(0, 0, w, h); for (let i = 0; i < 8000; i++) { x.fillStyle = `rgba(${R() < .5 ? '246,240,228' : '180,166,142'},.22)`; x.fillRect(R() * w, R() * h, 2, 2); } x.strokeStyle = 'rgba(120,90,60,.55)'; x.lineWidth = 8; x.strokeRect(30, 30, w - 60, h - 60); });
  const std = o => new THREE.MeshStandardMaterial({ envMapIntensity: .42, ...o });
  const M = { floor: std({ map: floorT, roughness: .5 }), wood: std({ map: woodT, roughness: .5 }), wall: std({ map: plasterT, roughness: .92 }), ceil: std({ color: '#efe8dc', roughness: .9 }), trim: std({ color: '#f1ebdf', roughness: .65 }), tile: std({ map: tileT, roughness: .24 }), tileW: std({ map: tileT.clone(), roughness: .2 }), accent: std({ roughness: .94 }), cab: std({ roughness: .5 }), linen: std({ color: '#e6dfd0', roughness: .95 }), rug: std({ map: rugT, roughness: 1 }), white: std({ color: '#ece8e0', roughness: .2 }), stone: std({ color: '#a9a297', roughness: .7 }), top: std({ color: '#d9d4c9', roughness: .24 }), black: std({ color: '#1f1d1b', roughness: .45, metalness: .4 }), steel: std({ color: '#c9ccce', roughness: .28, metalness: 1, envMapIntensity: 1.2 }), brass: std({ color: '#cfa85e', roughness: .3, metalness: 1, envMapIntensity: 1.2 }), plant: std({ color: '#4f7445', roughness: .7 }), pot: std({ color: '#b5674a', roughness: .7 }), water: std({ color: '#7fc4d6', roughness: .08, metalness: .2, envMapIntensity: 1.3 }), mirror: std({ color: '#d6dee2', roughness: .04, metalness: 1, envMapIntensity: 1.6 }), cat: std({ color: '#d9892f', roughness: .9 }), glow: new THREE.MeshBasicMaterial({ color: '#ffe9c6' }) };
  const glass = new THREE.MeshStandardMaterial({ color: '#dfeef2', roughness: .05, metalness: .1, transparent: true, opacity: .1, depthWrite: false, envMapIntensity: 1.4 });
  const B = (w, h, d, m, x, y, z, ry = 0) => { const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); e.position.set(x, y, z); e.rotation.y = ry; g.add(e); return e; };
  const C = (a, b, h, m, x, y, z, n = 20) => { const e = new THREE.Mesh(new THREE.CylinderGeometry(a, b, h, n), m); e.position.set(x, y, z); g.add(e); return e; };
  const S = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const e = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), m); e.position.set(x, y, z); e.scale.set(sx, sy, sz); g.add(e); return e; };
  const solid = (x0, z0, x1, z1) => walk.solids.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  const tag = (x, y, z, w, h, d, text) => { const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false })); e.position.set(x, y, z); e.userData.say = text; sc.add(e); walk.hit.push(e); };
  const flat = (w, d, m, x, y, z) => { const e = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); e.rotation.x = -Math.PI / 2; e.position.set(x, y, z); g.add(e); return e; };
  /* wall from a to b; each opening is [from, to, bottom, top]: bottom 0 is a doorway, above 0 a window with glass */
  const wall = (x0, z0, x1, z1, ops = []) => { const horiz = z0 === z1, along = (a, b, y0, y1, m = M.wall, t = .16) => { const mid = (a + b) / 2; if (horiz) B(b - a, y1 - y0, t, m, mid, (y0 + y1) / 2, z0); else B(t, y1 - y0, b - a, m, x0, (y0 + y1) / 2, mid); }, seg = (a, b) => { if (b <= a) return; along(a, b, 0, H); along(a, b, 0, .1, M.trim, .19); if (horiz) solid(a, z0 - .08, b, z0 + .08); else solid(x0 - .08, a, x0 + .08, b); }; let a = horiz ? x0 : z0; for (const [p, q, lo, hi] of ops) { seg(a, p); if (hi < H) along(p, q, hi, H); if (lo > 0) { along(p, q, 0, lo); along(p - .06, q + .06, lo - .03, lo + .03, M.wood, .26); along(p, q, hi - .04, hi, M.wood, .2); const m = (p + q) / 2; for (const c of [p, m, q]) along(c - .025, c + .025, lo, hi, M.wood, .1); if (horiz) { const e = B(q - p, hi - lo, .02, glass, m, (lo + hi) / 2, z0); e.renderOrder = 5; solid(p, z0 - .08, q, z0 + .08); } else { const e = B(.02, hi - lo, q - p, glass, x0, (lo + hi) / 2, m); e.renderOrder = 5; solid(x0 - .08, p, x0 + .08, q); } } else { along(p - .05, p, 0, hi, M.wood, .2); along(q, q + .05, 0, hi, M.wood, .2); along(p - .05, q + .05, hi, hi + .05, M.wood, .2); } a = q; } seg(a, horiz ? x1 : z1); };
  flat(12, 8, M.floor, 0, 0, 0); flat(4.5, 4, M.tile, 3.75, .004, -2); flat(4.5, 4, M.tile, 3.75, .004, 2);
  { const c = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), M.ceil); c.rotation.x = Math.PI / 2; c.position.set(0, H, 0); g.add(c); }
  wall(-6, -4, 6, -4); wall(-6, 4, 6, 4, [[-4.8, -1, .8, 2.2], [2.6, 5, 1.1, 2.2]]); wall(-6, -4, -6, 4, [[-3.2, -1, .8, 2.2]]); wall(6, -4, 6, 4, [[-2.5, -1.5, 1.3, 2.1]]);
  wall(-6, 0, 6, 0, [[-.7, 1.2, 0, 2.3]]); wall(-1, -4, -1, 0, [[-2.6, -1.7, 0, 2.1]]); wall(1.5, -4, 1.5, 0, [[-2.6, -1.7, 0, 2.1]]); wall(1.5, 2.6, 1.5, 4);
  /* hall */
  B(1.05, 2.1, .06, M.wood, .25, 1.05, -3.9); S(.04, M.brass, .65, 1.05, -3.85); B(1.1, .012, .7, M.rug, .25, .008, -3.3); B(.9, .1, .06, M.wood, 1.38, 1.6, -3.2, Math.PI / 2); for (const z of [-3.5, -3.2, -2.9]) S(.03, M.brass, 1.33, 1.6, z); { const e = B(.52, 1.1, .05, M.accent, 1.3, 1.02, -3.2, Math.PI / 2); e.scale.z = 1; }
  tag(.25, 1, -3.85, 1, 2.1, .2, 'The front door. Nobody here ever locks it.');
  /* living room */
  { const x = -2.7; B(2.5, .4, .9, M.accent, x, .24, .72); B(2.5, .82, .24, M.accent, x, .5, .3); for (const a of [-1.3, 1.3]) B(.22, .62, 1.02, M.accent, x + a, .32, .68); for (const a of [-.62, .62]) B(1.18, .14, .78, M.accent, x + a, .5, .76); B(.42, .4, .14, M.linen, x - .8, .75, .55, .3); B(.42, .4, .14, M.linen, x + .85, .75, .55, -.25); solid(x - 1.42, .1, x + 1.42, 1.2); tag(x, .6, .75, 2.8, 1, 1, 'Sit down. This town is not going anywhere.');
    B(3.2, .014, 2.1, M.rug, x, .01, 2.05); B(1.15, .05, .62, M.wood, x, .38, 2.05); for (const [a, b] of [[-.5, -.24], [.5, -.24], [-.5, .24], [.5, .24]]) B(.05, .37, .05, M.wood, x + a, .185, 2.05 + b); solid(x - .6, 1.72, x + .6, 2.38); B(.3, .03, .22, M.linen, x - .2, .42, 2); S(.09, M.white, x + .28, .45, 2.1, 1, .6, 1); S(.05, M.pot, x + .28, .5, 2.1);
    S(.16, M.cat, x + .5, .78, .86, 1.5, .85, 1); S(.11, M.cat, x + .74, .88, .9); for (const s of [-.06, .06]) { const e = C(0, .045, .08, M.cat, x + .76, .99, .9 + s, 4); e.rotation.y = .8; } B(.3, .05, .05, M.cat, x + .2, .76, .95); tag(x + .55, .85, .88, .7, .5, .5, 'The town cat. Nobody invited him. He stays anyway.'); }
  B(.5, 1.3, 1.9, M.stone, -5.72, .65, 2); B(.06, .72, 1.06, M.black, -5.46, .4, 2); B(.56, .08, 2.1, M.wood, -5.68, 1.34, 2); B(.14, .1, .72, M.wood, -5.4, .1, 2, .1); B(.14, .1, .72, M.wood, -5.38, .16, 1.96, -.1); solid(-6, 1, -5.35, 3);
  { const f = new THREE.PointLight('#ff9d55', 5, 7, 2); f.position.set(-4.9, .7, 2); sc.add(f); walk.fire = f; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(.09, .34, 6).translate(0, .17, 0), new THREE.MeshBasicMaterial({ color: ['#ff8a2a', '#ffb23e', '#ff6a1e'][i % 3] })); m.position.set(-5.38, .18, 1.72 + i * .11); m.userData.h = 1 + (i % 3) * .3; g.add(m); walk.flames.push(m); } tag(-5.5, .5, 2, .6, .9, 1.4, 'The fire is lit. It smells of pine and toast.'); }
  { const c = document.createElement('canvas'); c.width = 768; c.height = 192; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; walk.plate = { ctx: c.getContext('2d'), tex: t }; const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false }); B(.05, .62, 1.62, M.wood, -5.9, 1.86, 2); const a = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .375), m); a.rotation.y = Math.PI / 2; a.position.set(-5.86, 1.86, 2); a.userData.keep = true; g.add(a); B(.04, .4, 1.1, M.wood, -.92, 1.65, -.95); const b = new THREE.Mesh(new THREE.PlaneGeometry(1, .25), m); b.rotation.y = Math.PI / 2; b.position.set(-.89, 1.65, -.95); b.userData.keep = true; g.add(b); tag(-5.8, 1.86, 2, .2, .6, 1.6, 'Your name on the wall. It makes the place yours.'); }
  B(2.1, 2.1, .3, M.wood, .3, 1.05, 3.8); for (let s = 0; s < 4; s++) { B(2, .03, .26, M.ceil, .3, .4 + s * .5, 3.65); let x = -.62; while (x < 1.2) { const w = .05 + R() * .05, h = .28 + R() * .12; B(w, h, .2, [M.accent, M.cab, M.linen, M.black, M.pot][Math.floor(R() * 5)], x, .42 + s * .5 + h / 2, 3.62); x += w + .012; } } solid(-.8, 3.6, 1.4, 4); tag(.3, 1.2, 3.6, 2, 2, .3, 'A shelf of good books. The dog-eared one is about cheese.');
  { C(.17, .12, .32, M.pot, -5.5, .16, .5, 14); for (let i = 0; i < 12; i++) { const a = i * 1.9, e = S(.13, M.plant, -5.5 + Math.cos(a) * .15, .46 + (i % 4) * .17, .5 + Math.sin(a) * .15, 1.2, .24, .6); e.rotation.set(a, a, .5); } solid(-5.7, .3, -5.3, .7); C(.012, .012, 1.5, M.black, -.3, .75, .5, 8); C(.16, .22, .05, M.black, -.3, .03, .5, 16); C(.12, .2, .24, M.linen, -.3, 1.56, .5, 16); }
  /* kitchen */
  B(.62, .86, 3, M.cab, 5.68, .43, 2.34); B(.66, .04, 3.08, M.top, 5.66, .88, 2.34); B(.36, .72, 2.96, M.cab, 5.8, 1.86, 2.34); for (const z of [1.34, 2.34, 3.34]) { B(.012, .8, .95, M.cab, 5.365, .44, z); S(.015, M.steel, 5.35, .7, z + .35); } B(.52, .012, .6, M.black, 5.64, .906, 2.9); for (const [a, b] of [[-.12, -.15], [.12, -.15], [-.12, .15], [.12, .15]]) C(.07, .07, .006, M.steel, 5.64 + a, .916, 2.9 + b, 14); B(.44, .012, .56, M.steel, 5.64, .904, 1.6); C(.012, .012, .26, M.steel, 5.86, 1.03, 1.6, 8); B(.2, .02, .02, M.steel, 5.76, 1.16, 1.6); C(.11, .13, .16, M.black, 5.64, 1, 2.75, 16);
  B(.02, .6, 3.06, M.tileW, 5.905, 1.2, 2.34); for (const z of [1.34, 2.34, 3.34]) { B(.012, .68, .95, M.cab, 5.615, 1.86, z); B(.014, .02, .3, M.steel, 5.605, 1.56, z); } for (let i = 0; i < 3; i++) C(.05, .05, .15 + i * .03, [M.pot, M.linen, M.wood][i], 5.8, .98 + i * .015, 3.42 + i * .12, 12); B(.3, .02, .42, M.wood, 5.62, .91, 2.05); S(.05, M.plant, 5.62, .95, 2.15, 1, .7, 1); C(.09, .07, .14, M.pot, 5.8, .97, 1.08, 12); for (let i = 0; i < 7; i++) { const a = i * 2.1; S(.06, M.plant, 5.8 + Math.cos(a) * .06, 1.08 + (i % 3) * .05, 1.08 + Math.sin(a) * .06, 1.2, .3, .6); } B(1.5, .012, 1.5, M.rug, 3.5, .012, 2.2);
  B(.72, 1.95, .7, M.white, 5.62, .975, .44); B(.02, .4, .03, M.steel, 5.25, 1.3, .68); solid(5.26, .08, 6, 3.9); tag(5.6, 1, .44, .75, 1.9, .7, "Milk, butter and half a wheel of cheese. It's enough."); tag(5.6, 1, 2.9, .6, .3, .8, 'The hob is still warm. Someone made soup.');
  B(.03, .5, .03, M.brass, 3.5, 2.54, 2.2); S(.14, M.glow, 3.5, 2.26, 2.2); C(.09, .3, .2, M.black, 3.5, 2.34, 2.2, 16); C(.62, .62, .04, M.wood, 3.5, .74, 2.2, 28); C(.05, .05, .72, M.wood, 3.5, .36, 2.2, 10); C(.26, .3, .03, M.black, 3.5, .02, 2.2, 16); S(.16, M.white, 3.5, .79, 2.2, 1, .45, 1); for (const [a, b, m] of [[-.05, .05, M.pot], [.07, -.03, M.plant], [0, -.07, M.cat]]) S(.055, m, 3.5 + a, .83, 2.2 + b); solid(2.85, 1.55, 4.15, 2.85); tag(3.5, .8, 2.2, 1.3, .3, 1.3, 'Fresh fruit from the market. The cat is not allowed on this table.');
  for (const [x, z, r] of [[2.65, 2.2, 0], [4.35, 2.2, Math.PI]]) { B(.42, .04, .42, M.wood, x, .46, z); B(.04, .46, .36, M.wood, x + (r ? .2 : -.2), .7, z); for (const [a, b] of [[-.17, -.17], [.17, -.17], [-.17, .17], [.17, .17]]) B(.035, .44, .035, M.wood, x + a, .22, z + b); }
  /* bedroom */
  { const x = -3.7; B(1.8, .3, 2.1, M.wood, x, .17, -2.86); B(1.68, .24, 2.02, M.linen, x, .42, -2.86); B(1.7, .08, 1.36, M.accent, x, .55, -2.5); B(.68, .13, .42, M.white, x - .4, .6, -3.56); B(.68, .13, .42, M.white, x + .4, .6, -3.56); B(1.9, 1.05, .08, M.wood, x, .62, -3.88); solid(x - .9, -3.92, x + .9, -1.8); tag(x, .6, -2.8, 1.8, .8, 2.1, 'A proper bed. The best view in town is the inside of your eyelids.');
    for (const a of [-1.3, 1.3]) { B(.5, .5, .42, M.wood, x + a, .25, -3.66); C(.06, .09, .24, M.linen, x + a, .63, -3.66, 12); S(.07, M.glow, x + a, .64, -3.66, 1, 1.2, 1); solid(x + a - .27, -3.9, x + a + .27, -3.42); }
    B(3.2, .014, 2.2, M.rug, x, .008, -1.9); B(2.2, 2.2, .56, M.wood, -4.6, 1.1, -.34); for (const a of [-.55, .55]) { B(1.04, 2.1, .012, M.cab, -4.6 + a, 1.1, -.625); S(.018, M.brass, -4.6 + (a < 0 ? -.08 : .08), 1.1, -.64); } solid(-5.72, -.64, -3.5, -.04); tag(-4.6, 1.1, -.6, 2.2, 2.2, .2, 'Everything you own, folded by someone who cares.');
    B(1, .68, .03, M.wood, -3.7, 1.72, -3.9); B(.9, .58, .02, M.accent, -3.7, 1.72, -3.88); S(.14, M.glow, -3.5, 1.78, -3.865, 1, 1, .1); B(1, .012, .3, M.rug, -2.4, .012, -.45, .3); }
  /* bathroom */
  { for (const [w, d, x, z] of [[4.42, .02, 3.75, -3.91], [4.42, .02, 3.75, -.09], [.02, 1.14, 1.59, -3.33], [.02, 1.66, 1.59, -.86], [.02, 3.82, 5.91, -2]]) B(w, 1.3, d, M.tileW, x, .65, z); B(4.42, .03, .03, M.wood, 3.75, 1.31, -3.89); B(1.95, .56, .84, M.white, 4.92, .28, -3.46); B(1.7, .02, .6, M.water, 4.92, .54, -3.46); B(1.8, .012, .7, M.white, 4.92, .566, -3.46); B(1.68, .022, .58, M.water, 4.92, .57, -3.46); C(.016, .016, .36, M.steel, 5.8, .74, -3.46, 8); B(.16, .02, .02, M.steel, 5.72, .92, -3.46); solid(3.92, -3.92, 5.92, -3.02); tag(4.9, .6, -3.46, 1.9, .5, .8, 'A hot bath. Bubbles are extra, and also free.');
    B(.9, .78, .46, M.wood, 3.1, .39, -.32); B(.96, .04, .5, M.top, 3.1, .8, -.32); C(.2, .15, .1, M.white, 3.1, .85, -.32, 18); C(.012, .012, .16, M.steel, 3.1, .92, -.14, 8); B(.75, .85, .02, M.mirror, 3.1, 1.75, -.085).userData.keep = true; B(.81, .91, .015, M.wood, 3.1, 1.75, -.092); solid(2.62, -.58, 3.58, -.06); tag(3.1, 1.6, -.1, .8, .9, .1, 'You look great. The town agrees.');
    B(.42, .42, .58, M.white, 5.6, .21, -.72); B(.44, .05, .6, M.white, 5.6, .44, -.72); B(.42, .62, .18, M.white, 5.6, .72, -.3); solid(5.36, -1.04, 5.92, -.08); B(.04, .02, 1.2, M.steel, 1.62, 1.2, -.9); B(.03, .9, .5, M.accent, 1.63, .78, -.9); B(1, .02, .6, M.accent, 4.4, .014, -2.55); B(.5, .34, .78, M.wood, 2.1, .17, -3.5); for (let i = 0; i < 3; i++) B(.42, .08, .66, i % 2 ? M.linen : M.accent, 2.1, .39 + i * .085, -3.5); solid(1.82, -3.92, 2.38, -3.08); C(.1, .08, .16, M.pot, 3.72, .9, -.3, 12); for (let i = 0; i < 6; i++) { const a = i * 2.1; S(.07, M.plant, 3.4 + Math.cos(a) * .05, 1 + (i % 3) * .05, -.2 + Math.sin(a) * .05, 1.2, .3, .6); } }
  /* soft contact shadows, so the furniture sits on the floor */
  { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), q = x.createRadialGradient(64, 64, 18, 64, 64, 64); q.addColorStop(0, 'rgba(30,20,12,.55)'); q.addColorStop(1, 'rgba(30,20,12,0)'); x.fillStyle = q; x.fillRect(0, 0, 128, 128); const mt = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }); for (const [px, pz, w, d] of [[-2.7, .8, 3.6, 1.8], [-2.7, 2.05, 1.8, 1.2], [3.5, 2.2, 2, 2], [-3.7, -2.8, 2.7, 3], [-4.6, -.5, 3, 1.1], [.3, 3.7, 3, .9], [4.9, -3.45, 2.8, 1.5], [3.1, -.4, 1.5, .9], [5.6, -.7, 1, 1.2], [5.5, 2, 1.2, 4.2]]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mt); e.rotation.x = -Math.PI / 2; e.position.set(px, .02, pz); e.renderOrder = 2; g.add(e); } }
  { const c = document.createElement('canvas'); c.width = 8; c.height = 64; const x = c.getContext('2d'), q = x.createLinearGradient(0, 0, 0, 64); q.addColorStop(0, 'rgba(46,30,18,.42)'); q.addColorStop(1, 'rgba(46,30,18,0)'); x.fillStyle = q; x.fillRect(0, 0, 8, 64); const P = [], U = [], o = .085, Y0 = H - .01, Y1 = H - .6; for (const [x0, z0, x1, z1] of [[-6, -4, 6, -4], [-6, 4, 6, 4], [-6, -4, -6, 4], [6, -4, 6, 4], [-6, 0, 6, 0], [-1, -4, -1, 0], [1.5, -4, 1.5, 0], [1.5, 2.6, 1.5, 4]]) for (const k of [-1, 1]) { const dx = x0 === x1 ? k * o : 0, dz = z0 === z1 ? k * o : 0; P.push(x0 + dx, Y0, z0 + dz, x1 + dx, Y0, z1 + dz, x1 + dx, Y1, z1 + dz, x0 + dx, Y0, z0 + dz, x1 + dx, Y1, z1 + dz, x0 + dx, Y1, z0 + dz); U.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0); } const q2 = new THREE.BufferGeometry(); q2.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); q2.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); const e = new THREE.Mesh(q2, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, side: THREE.DoubleSide })); e.renderOrder = 3; g.add(e); }
  for (const [x, z] of [[-2.7, 2], [-3.7, -2]]) { C(.2, .2, .03, M.trim, x, H - .02, z, 20); C(.17, .17, .012, M.glow, x, H - .04, z, 20); } C(.12, .12, .02, M.glow, 3.7, H - .02, -2, 16); C(.12, .12, .02, M.glow, .25, H - .02, -2, 16);
  walk.pano = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 80, 48, 1, true), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false })); walk.pano.position.y = 14; sc.add(walk.pano); walk.ground = new THREE.Mesh(new THREE.CircleGeometry(120, 32), new THREE.MeshBasicMaterial({ color: '#6f9c5b' })); walk.ground.rotation.x = -Math.PI / 2; walk.ground.position.y = -8; sc.add(walk.ground);
  bakeRoom(sc, g, M.glow);
  walk.hemi = new THREE.HemisphereLight('#fff1dc', '#8e7a62', .42); walk.sun = new THREE.DirectionalLight('#fff0d8', 2.8); walk.sun.position.set(-5, 14, 22); walk.sun.target.position.set(0, 0, 0); walk.sun.castShadow = true; walk.sun.shadow.mapSize.set(1536, 1536); Object.assign(walk.sun.shadow.camera, { left: -10, right: 10, top: 8, bottom: -8, near: 1, far: 50 }); walk.sun.shadow.bias = -.0005; walk.sun.shadow.normalBias = .03;
  walk.bulbs = [[-2.7, 2.4, 2], [3.5, 2.2, 2], [-3.7, 2.4, -2], [3.5, 2.4, -2]].map(([x, y, z]) => { const l = new THREE.PointLight('#ffdcb0', 3, 8, 1.8); l.position.set(x, y, z); sc.add(l); return l; }); sc.add(walk.hemi, walk.sun, walk.sun.target);
  walk.tint = { wall: M.wall, accent: M.accent, cab: M.cab }; walk.scene = sc;
}
function dressHome(h) {
  const [w, a, c] = HOME_TINTS[(h.id || 0) % HOME_TINTS.length], { ctx: q, tex } = walk.plate, name = h.nick; walk.tint.wall.color.set(w); walk.tint.accent.color.set(a); walk.tint.cab.color.set(c);
  q.fillStyle = '#23302b'; q.fillRect(0, 0, 768, 192); q.strokeStyle = '#d6b13c'; q.lineWidth = 8; q.strokeRect(10, 10, 748, 172); q.fillStyle = '#f6c81e'; q.textAlign = 'center'; q.textBaseline = 'middle'; let s = 72; do { q.font = `400 ${s}px 'Lilita One', 'Arial Black', sans-serif`; s -= 4; } while (q.measureText(name).width > 700 && s > 22); q.fillText(name, 384, 100); tex.needsUpdate = true;
}
function paintPano() { const t = hourNow(), dark = t < 6 || t > 19.5, dusk = !dark && (t < 8 || t > 17.5), wetNow = wet > .5, c = document.createElement('canvas'); c.width = 2048; c.height = 512; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 330); if (dark) { g.addColorStop(0, '#0b1230'); g.addColorStop(1, '#2d3a68'); } else if (dusk) { g.addColorStop(0, '#5a79b6'); g.addColorStop(1, '#ffc48e'); } else if (wetNow) { g.addColorStop(0, '#8294a3'); g.addColorStop(1, '#c0ccd4'); } else { g.addColorStop(0, '#5aa8e2'); g.addColorStop(1, '#e2f0f4'); } x.fillStyle = g; x.fillRect(0, 0, 2048, 512); const r = rng(11), l = dark ? .32 : wetNow ? .72 : 1, col = (a, b, c2) => `rgb(${a * l | 0},${b * l | 0},${c2 * l | 0})`; if (dark) { x.fillStyle = '#fff'; for (let i = 0; i < 200; i++) x.fillRect(r() * 2048, r() * 200, 2, 2); } for (const [base, amp, cA, snow] of [[300, 150, col(176, 170, 192), true], [340, 90, col(112, 142, 120), false], [376, 42, col(106, 158, 92), false]]) { const pts = []; for (let i = 0; i <= 96; i++) { const a = i / 96 * 6.283; pts.push([i / 96 * 2048, base - amp * (.45 + .3 * Math.sin(a * 3 + 1) + .2 * Math.sin(a * 7) + .12 * Math.sin(a * 17 + 2))]); } x.fillStyle = cA; x.beginPath(); x.moveTo(0, 512); pts.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(2048, 512); x.fill(); if (snow) { x.fillStyle = col(250, 250, 255); for (const p of pts) if (p[1] < base - amp * .62) { x.beginPath(); x.moveTo(p[0] - 14, p[1] + 16); x.lineTo(p[0], p[1]); x.lineTo(p[0] + 14, p[1] + 16); x.fill(); } } } x.fillStyle = col(96, 150, 84); x.fillRect(0, 400, 2048, 112); for (let i = 0; i < 260; i++) { const a = r() * 2048, b = 395 + r() * 60, w = 5 + r() * 7; x.fillStyle = dark ? (r() < .5 ? '#ffd27a' : '#2b3550') : ['#a33a2c', '#3c5c50', '#c9b08e', '#5a4a3f'][Math.floor(r() * 4)]; x.fillRect(a, b, w, w * .7); } const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace; t2.wrapS = THREE.RepeatWrapping; if (walk.pano.material.map) walk.pano.material.map.dispose(); walk.pano.material.map = t2; walk.pano.material.needsUpdate = true; walk.ground.material.color.set(dark ? '#1f2a2c' : '#6f9c5b'); walk.sun.intensity = dark ? .05 : wetNow ? .7 : dusk ? 1.8 : 2.8; walk.sun.color.set(dusk ? '#ffc48e' : '#fff0d8'); walk.hemi.intensity = dark ? .16 : wetNow ? .32 : .42; walk.bulbs.forEach(l2 => { l2.intensity = dark ? walk.bulbI[1] : walk.bulbI[0]; }); if (walk.deck) { walk.deck.color.set(dark ? '#4c5262' : '#ffffff'); walk.deck.envMapIntensity = dark ? .25 : 1; } }
const walkRooms = [['Kitchen', -10, 0, -3, 7], ['Living room', -3, 0, 11, 7], ['Study', -10, -7, -3, 0], ['Hall', -3, -7, 0, 0], ['Bedroom', 0, -7, 7, 0], ['Bathroom', 7, -7, 11, 0]];
/* the view from the windows: one still of the real town, taken while the screen is black; no traffic in it */
function shootCity(h) {
  try {
    if (!walk.cube) {
      if (!renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) return false;
      const rt = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      walk.cube = new THREE.CubeCamera(1, 4200, rt);
    }
    if (!walk.view) {
      walk.view = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms: { town: { value: walk.cube.renderTarget.texture } }, vertexShader: 'varying vec3 d; void main(){ d = (modelMatrix * vec4(position, 0.)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: 'uniform samplerCube town; varying vec3 d; void main(){ gl_FragColor = vec4(textureCube(town, normalize(d)).rgb, 1.);\n#include <colorspace_fragment>\n}' }));
      walk.view.renderOrder = -5; walk.scene.add(walk.view); walk.set.view = walk.view;
    }
    walk.view.rotation.y = Math.atan2(-h.x, -h.z);
    if (walk.shot && walk.shot.id === h.id && performance.now() - walk.shot.at < 3e5 && Math.abs(walk.shot.wet - wet) < .3) return true;
    const hide = [heli.root, marker, board, rain, confetti, ...carKinds.flatMap(k => [k.body, k.trim]), ...boatKinds.flatMap(k => [k.body, k.trim]), ...buses.map(b => b.root), ...fleet.map(f => f.root)], was = hide.map(o => o.visible), auto = renderer.shadowMap.autoUpdate, sky = skyDome.position.clone();
    const starSize = stars.material.size; stars.material.size = 1.2; hide.forEach(o => { o.visible = false; }); nearAround(h.x, h.z, 240); for (const c of chunks.values()) if (c.nd) c.nd.visible = Math.hypot(c.cx - h.x, c.cz - h.z) < DETAIL_RANGE;
    const y = height(h.x, h.z) + walk.eye; skyDome.position.set(h.x, y, h.z); sun.target.position.set(h.x, 0, h.z); sun.position.copy(sun.target.position).addScaledVector(sunDir, 1000); sun.target.updateMatrixWorld();
    hideInTown(h, true); renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; walk.cube.position.set(h.x, y, h.z); walk.cube.update(renderer, scene); hideInTown(h, false);
    stars.material.size = starSize; renderer.shadowMap.autoUpdate = auto; hide.forEach((o, i) => { o.visible = was[i]; }); skyDome.position.copy(sky); updateDetail();
    walk.shot = { id: h.id, at: performance.now(), wet };
    return true;
  } catch (e) { return false; }
}
function enterHouse(h) {
  if (room.on) return; const kind = h.id === 1 ? 'mayor' : 'home', f = $('fade'); room.owner = h;
  Object.assign(goal, { x: h.x, z: h.z + 4 * h.flip, d: 13, pitch: .2, yaw: h.flip > 0 ? 0 : Math.PI, lift: .05 }); f.hidden = false; setTimeout(() => f.classList.add('on'), reduced ? 0 : 650);
  setTimeout(() => {
    if (!walk.sets[kind]) { walk.solids = []; walk.hit = []; walk.flames = []; walk.deck = walk.view = walk.plate = walk.tint = null; if (kind === 'mayor') buildMayor(); else buildHome(); walk.sets[kind] = { scene: walk.scene, solids: walk.solids, hit: walk.hit, flames: walk.flames, fire: walk.fire, hemi: walk.hemi, sun: walk.sun, bulbs: walk.bulbs, pano: walk.pano, ground: walk.ground, deck: walk.deck, plate: walk.plate, tint: walk.tint, view: null, rooms: kind === 'mayor' ? walkRooms : homeRooms, bulbI: kind === 'mayor' ? [2.4, 7] : [1.6, 4.5], start: kind === 'mayor' ? [-1.5, -5.6] : [.25, -3.1], eye: kind === 'mayor' ? 24 : 14 }; }
    walk.set = walk.sets[kind]; Object.assign(walk, walk.set); if (kind === 'home') dressHome(h); paintPano();
    const town = shootCity(h); if (walk.view) walk.view.visible = town; walk.pano.visible = walk.ground.visible = !town;
    room.scene = walk.scene; room.cam = walk.cam; room.hit = walk.hit; room.walk = true; room.on = true; walk.tm = renderer.toneMapping; walk.te = renderer.toneMappingExposure; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    Object.assign(walk, { px: walk.start[0], pz: walk.start[1], yaw: 0, gy: 0, pitch: 0, gp: 0, name: '', who: kind === 'home' ? h.nick : '' }); renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; document.body.classList.add('inroom', 'walking');
    $('roomT').textContent = kind === 'mayor' ? "The Mayor's Residence" : `${h.nick}'s House`; $('roomHint').textContent = 'Use the stick or WASD to walk. Drag to look. Tap things.'; $('roomUI').hidden = false; $('joy').hidden = false; f.classList.remove('on');
    say(kind === 'mayor' ? 'Welcome to the residence. Walk around, nobody minds.' : isMine(h) ? 'Welcome home! Have a look around.' : `Welcome to ${h.nick}'s house.`); setTimeout(() => { f.hidden = true; }, 500);
  }, reduced ? 50 : 1150);
}
function stepWalk(now) { const dt = Math.min(.05, (now - (walk.last || now)) / 1000); walk.last = now; const k = walk.keys, fw = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - walk.joy.y, st = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + walk.joy.x, len = Math.hypot(fw, st); if (len > .05) { const s = 2.7 * Math.min(1, len) * dt / Math.max(1, len), sy = Math.sin(walk.yaw), cy = Math.cos(walk.yaw), dx = (-st * cy + fw * sy) * s, dz = (st * sy + fw * cy) * s, r = .3, free = (x, z) => !walk.solids.some(b => x > b[0] - r && x < b[2] + r && z > b[1] - r && z < b[3] + r); if (free(walk.px + dx, walk.pz)) walk.px += dx; if (free(walk.px, walk.pz + dz)) walk.pz += dz; walk.bob += dt * 9; } walk.yaw += (walk.gy - walk.yaw) * .22; walk.pitch += (walk.gp - walk.pitch) * .22; const c = walk.cam; c.aspect = innerWidth / innerHeight; c.fov = c.aspect < .8 ? 78 : 66; c.updateProjectionMatrix(); c.rotation.order = 'YXZ'; c.rotation.set(walk.pitch, Math.PI + walk.yaw, 0); c.position.set(walk.px, 1.62 + Math.sin(walk.bob) * .012, walk.pz); const q = walk.rooms.find(b => walk.px > b[1] && walk.px < b[3] && walk.pz > b[2] && walk.pz < b[4]); if (q && q[0] !== walk.name) { walk.name = q[0]; $('roomT').textContent = walk.who ? `${walk.who} \u00B7 ${q[0]}` : q[0]; } walk.flames.forEach((m, i) => { m.scale.y = m.userData.h * (.8 + .3 * Math.sin(now / (80 + i * 9) + i * 2)); }); walk.fire.intensity = 5 + Math.sin(now / 70) * .8; }
{ const pad = $('joy'), nub = $('joyNub'); let id = null; const move = e => { const b = pad.getBoundingClientRect(), R = b.width / 2, x = clamp((e.clientX - b.left - R) / R, -1, 1), y = clamp((e.clientY - b.top - R) / R, -1, 1); walk.joy.x = x; walk.joy.y = y; nub.style.transform = `translate(${x * R * .55}px,${y * R * .55}px)`; }; pad.addEventListener('pointerdown', e => { id = e.pointerId; pad.setPointerCapture(id); move(e); e.stopPropagation(); }); pad.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); }); const end = () => { id = null; walk.joy.x = walk.joy.y = 0; nub.style.transform = ''; }; pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end); addEventListener('keydown', e => { if (room.walk) walk.keys.add(e.code); }); addEventListener('keyup', e => walk.keys.delete(e.code)); }
function leaveHouse() {
  const f = $('fade'); f.hidden = false; f.classList.add('on');
  setTimeout(() => { room.on = false; if (room.walk) { renderer.toneMapping = walk.tm; renderer.toneMappingExposure = walk.te; } room.walk = false; renderer.shadowMap.autoUpdate = true; renderer.shadowMap.needsUpdate = true; $('joy').hidden = true; walk.keys.clear(); document.body.classList.remove('inroom', 'walking'); $('roomUI').hidden = true; $('roomSay').hidden = true; if (selected) Object.assign(goal, { x: selected.x, z: selected.z + 2 * selected.flip, d: 54, pitch: .74, lift: -.08 }); f.classList.remove('on'); setTimeout(() => { f.hidden = true; }, 500); }, 450);
}
$('bEnter').onclick = () => {
  if (!selected) return;
  if (unlocked(selected)) return enterHouse(selected);
  if (isMine(selected)) return followSheet(selected);
  toast('This door is locked until the owner follows ' + CFG.name);
};
$('bExit').onclick = leaveHouse;
function stepRoom(now) { stepWalk(now); }

/* welcome sign: first thing a visitor from TikTok or Instagram sees */
function welcomeOff() { $('welcome').hidden = true; }
function welcome() {
  const cv = document.createElement('canvas'); cv.width = 760; cv.height = 560; paintWood(cv.getContext('2d'), 760, 560, '#94653a', 5, 12);
  document.querySelector('.wsign').style.backgroundImage = `url(${cv.toDataURL('image/jpeg', .82)})`;
  $('wsub').textContent = `${pop} residents \u00B7 one follower, one house`; $('welcome').hidden = false; setTimeout(() => { try { $('wq').focus({ preventScroll: true }); } catch {} }, 60);
}
$('wlook').onclick = welcomeOff;
$('wform').addEventListener('submit', e => {
  e.preventDefault(); const v = $('wq').value.trim().replace(/^@/, '').toLowerCase(), h = byKey.get(v), m = $('wmsg'); if (!v) return;
  if (h) { welcomeOff(); $('q').value = h.nick; arrive(h); return; }
  m.textContent = `No house for ${$('wq').value.trim()} yet. Follow us and comment what you want under the latest video. I'll build it!`; m.hidden = false;
});

/* ---------- start ---------- */
let last = performance.now(), frame = 0, timeTick = 0;
applyTime(hourNow());
let paused = false; // used only when recording video frames
let slowN = 0, slowSum = 0;
function loop(now) { if (!paused) drawFrame(now); requestAnimationFrame(loop); }
function drawFrame(now) {
  const real = Math.min(.5, (now - last) / 1000), dt = Math.min(.05, real); last = now; frame++;
  const k = reduced ? 1 : 1 - Math.exp(-dt * 3.4); if (drive.on) stepDrive(dt); if (stroll.on) stepStroll(dt, now);
  for (const a of ['x', 'z', 'd', 'yaw', 'pitch', 'lift']) view[a] += (goal[a] - view[a]) * k;
  placeCamera(); skyDome.position.copy(camera.position); waterU.t.value = now / 1000;
  if (!paused && (slowN += 1) && (slowSum += real) && slowN >= 150) { if (slowSum / slowN > .05 && maxRatio > 1) { maxRatio = maxRatio > 1.3 ? 1.3 : 1; renderer.setPixelRatio(Math.min(devicePixelRatio, maxRatio)); resize(); sun.shadow.mapSize.set(1024, 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } slowN = slowSum = 0; } // a slow device drops to the lighter picture by itself
  if (!reduced) { moveCars(dt); moveFleet(dt); moveBuses(dt); moveBoats(dt); moveHeli(dt); stepFront(dt); stepSite(dt); }
  if (show) stepBuild(dt);
  for (let i = 0; i < mallSpin.length; i++) mallSpin[i].rotation.y += dt * (i ? -.05 : .07);
  if (marker.visible) { marker.position.y = (selected ? 12.6 : 6.5) + Math.sin(now / 420) * .5; marker.rotation.y = now / 700; }
  const wetGoal = wantRain() ? 1 : 0;
  if (Math.abs(wetGoal - wet) > .001) { wet += clamp(wetGoal - wet, -real / 2.5, real / 2.5); applyTime(hourNow()); }
  rain.visible = wet > .02 && !reduced; rain.material.opacity = wet * .55; if (rain.visible) moveRain(now);
  if ((timeTick += dt) > 20) { timeTick = 0; applyTime(hourNow()); }
  if (room.on) { stepRoom(now); renderer.render(room.scene, room.cam); }
  else renderer.render(scene, camera);
  if (frame % 4 === 0 && !room.on) { updateLabels(); stepPeople(now); }
  if (frame % 12 === 1) updateDetail();
}
setBoard(houses[0]);
if (!location.hash) welcome();
try { document.fonts.load('60px "Lilita One"').then(() => { if (!selected) setBoard(houses[0]); }); } catch {}
let started = false;
const start = () => { const n = decodeURIComponent(location.hash.slice(1)).toLowerCase(), h = byKey.get(n); if (h) {
    if (!started && !store.get('ref') && !store.get('me') && h.id !== 1) { store.set('ref', h.key); if (CFG.selfClaim) { $('getHouse').hidden = false; setTimeout(() => claimSheet(), 1800); } } // arrived through someone's invite link
    select(h); if (!started) { Object.assign(view, goal, { d: goal.d * 2.2, pitch: .9 }); }
  }
  if (!started && h && isMine(h) && !store.get(`built:${h.key}`)) { store.set(`built:${h.key}`, '1'); store.set(`lvl:${h.key}`, h.lvl); setTimeout(() => playBuild(h), 900); }
  if (!started) { // a friend joined since last time: show the upgrade once
    const me = byKey.get(store.get('me')), was = me && Number(store.get(`lvl:${me.key}`));
    if (me && was && me.lvl > was) { store.set(`lvl:${me.key}`, me.lvl); setTimeout(() => playBuild(me, was), 1200); }
  }
  started = true; };
addEventListener('hashchange', start);
start(); for (let i = 0; i < 4; i++) updateDetail(); performance.mark('town-ready');
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); toast('The town ran out of memory. Refresh the page.'); });

/* ---------- the big white letters on the mountain ---------- */
const hillSign = (() => {
  const S = pts => { const q = new THREE.Shape(); pts.forEach((p, i) => i ? q.lineTo(p[0], p[1]) : q.moveTo(p[0], p[1])); return q; }, hole = pts => { const q = new THREE.Path(); pts.forEach((p, i) => i ? q.lineTo(p[0], p[1]) : q.moveTo(p[0], p[1])); return q; };
  const arcs = (cx, cy, rx, ry, a0, a1, n = 18) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
  const shapes = {
    A() { const q = S([[0, 0], [.21, 0], [.27, .2], [.53, .2], [.59, 0], [.8, 0], [.5, 1], [.3, 1]]); q.holes.push(hole([[.33, .37], [.47, .37], [.4, .68]])); return [q, .8]; },
    B() { const q = S([[0, 0], [.44, 0], ...arcs(.44, .25, .25, .25, -Math.PI / 2, Math.PI / 2), [.35, .5], ...arcs(.42, .75, .24, .25, -Math.PI / 2, Math.PI / 2), [0, 1]]); q.holes.push(hole([[.2, .18], ...arcs(.4, .25, .12, .12, -Math.PI / 2, Math.PI / 2), [.2, .38]])); q.holes.push(hole([[.2, .62], ...arcs(.38, .75, .12, .12, -Math.PI / 2, Math.PI / 2), [.2, .82]])); return [q, .74]; },
    C() { return [S([...arcs(.4, .5, .4, .5, .75, Math.PI * 2 - .75, 26), ...arcs(.4, .5, .21, .3, Math.PI * 2 - .75, .75, 26)]), .72]; },
    D() { const q = S([[0, 0], ...arcs(.33, .5, .39, .5, -Math.PI / 2, Math.PI / 2), [0, 1]]); q.holes.push(hole([[.2, .2], ...arcs(.32, .5, .17, .3, -Math.PI / 2, Math.PI / 2), [.2, .8]])); return [q, .72]; },
    E() { return [S([[0, 0], [.6, 0], [.6, .19], [.2, .19], [.2, .4], [.54, .4], [.54, .59], [.2, .59], [.2, .81], [.6, .81], [.6, 1], [0, 1]]), .6]; },
    F() { return [S([[0, 0], [.2, 0], [.2, .4], [.52, .4], [.52, .59], [.2, .59], [.2, .81], [.58, .81], [.58, 1], [0, 1]]), .58]; },
    G() { return [S([...arcs(.42, .5, .42, .5, .75, Math.PI * 2 - .75, 26), [.72, .48], [.45, .48], [.45, .3], [.72, .3], [.72, .22], ...arcs(.42, .5, .22, .3, Math.PI * 2 - .6, .75, 26)]), .76]; },
    H() { return [S([[0, 0], [.2, 0], [.2, .4], [.5, .4], [.5, 0], [.7, 0], [.7, 1], [.5, 1], [.5, .6], [.2, .6], [.2, 1], [0, 1]]), .7]; },
    I() { return [S([[0, 0], [.21, 0], [.21, 1], [0, 1]]), .21]; },
    J() { return [S([[.08, .32], [.26, .32], [.26, .24], ...arcs(.42, .24, .18, .18, Math.PI, 0, 14), [.6, .24], [.6, 1], [.8, 1], [.8, .22], ...arcs(.42, .22, .38, .38, 0, Math.PI, 18), [.08, .22]]), .72]; },
    K() { return [S([[0, 0], [.2, 0], [.2, .38], [.45, 0], [.72, 0], [.38, .49], [.7, 1], [.44, 1], [.2, .6], [.2, 1], [0, 1]]), .72]; },
    L() { return [S([[0, 0], [.6, 0], [.6, .2], [.2, .2], [.2, 1], [0, 1]]), .6]; },
    M() { return [S([[0, 0], [.19, 0], [.19, .62], [.4, .2], [.46, .2], [.67, .62], [.67, 0], [.86, 0], [.86, 1], [.67, 1], [.43, .5], [.19, 1], [0, 1]]), .86]; },
    N() { return [S([[0, 0], [.2, 0], [.5, .48], [.5, 0], [.7, 0], [.7, 1], [.5, 1], [.2, .52], [.2, 1], [0, 1]]), .7]; },
    O() { const q = S(arcs(.38, .5, .38, .5, 0, Math.PI * 2, 28)); q.holes.push(hole(arcs(.38, .5, .19, .31, 0, Math.PI * 2, 24))); return [q, .76]; },
    P() { const q = S([[0, 0], [.2, 0], [.2, .48], ...arcs(.38, .74, .28, .26, -Math.PI / 2, Math.PI / 2), [0, 1]]); q.holes.push(hole([[.2, .64], ...arcs(.36, .74, .14, .13, -Math.PI / 2, Math.PI / 2), [.2, .87]])); return [q, .68]; },
    Q() { const q = S(arcs(.38, .5, .38, .5, 0, Math.PI * 2, 28)); q.holes.push(hole(arcs(.38, .5, .19, .31, 0, Math.PI * 2, 24))); return [q, .76]; },
    R() { const q = S([[0, 0], [.2, 0], [.2, .38], [.32, .38], [.48, 0], [.72, 0], [.52, .42], ...arcs(.4, .7, .28, .3, -Math.PI / 2 + .35, Math.PI / 2), [0, 1]]); q.holes.push(hole([[.2, .56], ...arcs(.38, .68, .13, .12, -Math.PI / 2, Math.PI / 2), [.2, .8]])); return [q, .72]; },
    S() { return [S([[.1, .18], ...arcs(.34, .25, .26, .25, Math.PI, 0, 14), [.6, .35], ...arcs(.35, .72, .26, .26, 0, Math.PI, 14), [.08, .76], [.08, .92], ...arcs(.35, .75, .35, .25, Math.PI, 0, 16), [.7, .65], ...arcs(.35, .28, .35, .26, 0, Math.PI, 16)]), .7]; },
    T() { return [S([[.2, 0], [.41, 0], [.41, .81], [.62, .81], [.62, 1], [0, 1], [0, .81], [.2, .81]]), .62]; },
    U() { const q = S([[0, 1], [.2, 1], [.2, .38], ...arcs(.36, .38, .16, .22, Math.PI, 0, 14), [.52, .38], [.52, 1], [.72, 1], [.72, .38], ...arcs(.36, .38, .36, .38, 0, Math.PI, 18), [0, .38]]); return [q, .72]; },
    V() { return [S([[0, 1], [.21, 1], [.36, .22], [.51, 1], [.72, 1], [.46, 0], [.26, 0]]), .72]; },
    W() { return [S([[0, 1], [.18, 1], [.28, .26], [.39, .82], [.54, .82], [.65, .26], [.75, 1], [.93, 1], [.78, 0], [.59, 0], [.47, .56], [.35, 0], [.16, 0]]), .93]; },
    X() { return [S([[0, 0], [.2, 0], [.35, .38], [.5, 0], [.7, 0], [.45, .5], [.7, 1], [.5, 1], [.35, .62], [.2, 1], [0, 1], [.25, .5]]), .7]; },
    Y() { return [S([[.27, 0], [.47, 0], [.47, .4], [.74, 1], [.52, 1], [.37, .63], [.22, 1], [0, 1], [.27, .4]]), .74]; },
    Z() { return [S([[0, 0], [.65, 0], [.65, .18], [.22, .82], [.65, .82], [.65, 1], [0, 1], [0, .82], [.43, .18], [0, .18]]), .65]; },
    _default() { return [S([[0, 0], [.5, 0], [.5, 1], [0, 1]]), .5]; }
  };
  const H = 66, gap = .3, text = (CFG.name || 'Dream City').toUpperCase(), mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 0 }), back = new THREE.MeshLambertMaterial({ color: '#8b8d8c' }), root = new THREE.Group(); scene.add(root);
  const dirA = Math.atan2(-Math.sin(.42), -Math.cos(.42)), ray = a => { for (let r = townR + 150; r < townR + 800; r += 6) if (height(Math.sin(a) * r, Math.cos(a) * r) > 70) return r; return townR + 500; };
  let total = 0; const parts = [...text].map(c => { if (c === ' ') { total += .55; return null; } const fn = shapes[c] || shapes._default; const [shape, w] = fn(); const it = { shape, w, at: total }; total += w + gap; return it; }).filter(Boolean); total -= gap;
  const R = ray(dirA) + 16, A = total * H / R;
  for (const it of parts) {
    const a = dirA + ((total / 2 - it.at - it.w / 2) * H / R), x = Math.sin(a) * R, z = Math.cos(a) * R, wd = it.w * H / 2 / R, y = Math.max(...[-1, 0, 1].flatMap(u => [0, 14, 28, 44].map(b => height(Math.sin(a + u * wd) * (R - b), Math.cos(a + u * wd) * (R - b))))) + 1, slope = clamp(Math.atan((height(x * 1.03, z * 1.03) - height(x * .97, z * .97)) / (R * .06)), .12, .7), g = new THREE.ExtrudeGeometry(it.shape, { depth: .09, bevelEnabled: false, curveSegments: 10 });
    g.translate(-it.w / 2, 0, 0); g.scale(H, H, H); const m = new THREE.Mesh(g, [mat, back]), holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.y = Math.atan2(-x, -z); m.rotation.x = -slope * .35; holder.add(m); for (const u of [-.32, .32]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, H * .7, 1.6), back); b.position.set(u * it.w * H, H * .3, -H * .22); b.rotation.x = -slope * .35; holder.add(b); } root.add(holder);
  }
  return { root, mat, A };
})();

/* ---------- the front line: soldiers ring the town and hold the zombies back, all day, for everyone ---------- */
const front = { posts: [], men: [], dead: [], at: -1, bolts: [], on: 0 };
{
  const POSTS = 16, MEN = 7, PACK = 18, R = townR + 6, O = '#5a6a45', O2 = '#46533a', SK = '#e3b48f', BOOT = '#23261f', GUN = '#1f2226', BAG = '#b5a57e', BAG2 = '#a3936c', W = '#6b4a30', free = (x, z) => !(height(x, z) < -.3) && !(Math.abs(x - BASE.x) < BASE.W / 2 + 30 && Math.abs(z - BASE.z) < BASE.D / 2 + 30) && !(Math.abs(x - MALL.x) < MALL.W / 2 + 30 && Math.abs(z - MALL.z) < MALL.D / 2 + 30);
  for (let i = 0; i < POSTS; i++) { let a = (i + .5) / POSTS * Math.PI * 2, x, z; for (let k = 0; k < 40; k++) { x = Math.sin(a) * R; z = Math.cos(a) * R; if (free(x, z) && free(x * 1.05, z * 1.05)) break; a += .025; } const ox = x / R, oz = z / R; front.posts.push({ x, z, ox, oz, tx: oz, tz: -ox, ry: Math.atan2(ox, oz), y: Math.max(0, height(x, z)) }); }
  const g = new Geo(); for (const [row, y] of [[0, 0], [1, .34], [2, .68]]) for (let i = -7; i <= 7; i++) { if (row === 2 && Math.abs(i) > 5) continue; const x = i * 1 + (row % 2) * .5; g.box(x, y, 1.3 + Math.pow(Math.abs(x) / 7, 2) * -1.6, .96, .33, .62, (i + row) % 2 ? BAG : BAG2); }
  for (const [x, z] of [[-9, -4], [-9, -1], [-6, -4], [-6, -1]]) g.box(x, 0, z, .3, 7, .3, W); for (const y of [2.4, 4.8]) { g.box(-7.5, y, -4, 3.2, .16, .16, W); g.box(-7.5, y, -1, 3.2, .16, .16, W); }
  g.box(-7.5, 7, -2.5, 4.6, .24, 4.6, W); for (const [x, z, w, d] of [[-7.5, -.3, 4.6, .12], [-7.5, -4.7, 4.6, .12], [-9.8, -2.5, .12, 4.6], [-5.2, -2.5, .12, 4.6]]) g.box(x, 7.2, z, w, 1.1, d, O2); for (const [x, z] of [[-9.6, -.4], [-5.4, -.4], [-9.6, -4.6], [-5.4, -4.6]]) g.box(x, 7.2, z, .18, 2.6, .18, W); g.box(-7.5, 9.8, -2.5, 5.4, .22, 5.4, O);
  g.box(7.4, 0, -2.6, .16, 10, .16, '#d9d8d0'); g.box(8.6, 8.4, -2.6, 2.4, 1.4, .06, '#c8352b'); g.box(4.6, 0, -3.2, 1.4, .9, 1.1, W); g.box(6, 0, -4, 1.2, .8, 1, '#5e4630'); g.box(4.8, .9, -3.2, .9, .6, .8, O);
  g.box(0, .02, -2.4, 15, .02, 7, '#8a8467');
  { const wall = new Geo().at(0, 0), N = Math.round(R * Math.PI * 2 / 7), seg = new THREE.BoxGeometry(6.9, .95, .9), post = new THREE.CylinderGeometry(.09, .09, 2.2, 5); // a wall of sandbags right around the town, gaps only for the river, the base and the mall
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, x = Math.sin(a) * R, z = Math.cos(a) * R; if (!free(x, z)) continue; const c = seg.clone().rotateY(a); wall.add(c, i % 2 ? BAG : BAG2, x, .47, z); const x2 = Math.sin(a) * (R + 2.2), z2 = Math.cos(a) * (R + 2.2); wall.add(post, W, x2, 1.1, z2); wall.add(new THREE.BoxGeometry(.06, .06, 7).rotateY(a + Math.PI / 2), '#3b3f42', x2, 1.9, z2); wall.add(new THREE.BoxGeometry(.06, .06, 7).rotateY(a + Math.PI / 2), '#3b3f42', x2, 1.3, z2); }
    const m = wall.mesh(solid); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  { const Z = new THREE.Matrix4().makeScale(0, 0, 0); front0.pts.forEach(([x, z], i) => { if (front.posts.some(p => Math.hypot(x - p.x, z - p.z) < 46)) front0.pine.setMatrixAt(i, Z); }); front0.pine.instanceMatrix.needsUpdate = true; } // clear the ground so the fight can be seen
  const mesh = g.mesh(solid); mesh.castShadow = true; mesh.receiveShadow = true; const geo = mesh.geometry;
  for (const p of front.posts) { const m = new THREE.Mesh(geo, solid); m.castShadow = true; m.receiveShadow = true; m.position.set(p.x, p.y, p.z); m.rotation.y = p.ry; scene.add(m); sceneHits.push(p.x - 10, p.x + 10, p.z - 10, p.z + 10); }
  const man = instanced(q => { for (const s of [-1, 1]) { q.box(s * .16, 0, 0, .22, .16, .34, BOOT); q.box(s * .16, .14, 0, .22, .72, .26, O2); } q.box(0, .84, 0, .56, .6, .3, O); q.box(0, 1.2, .02, .6, .2, .34, O2); q.box(0, 1.44, 0, .36, .34, .36, SK); q.box(0, 1.68, 0, .46, .18, .46, O2); q.box(0, 1.62, .05, .54, .06, .54, O); q.box(.28, 1.14, .24, .14, .14, .6, O); q.box(-.28, 1.14, .24, .14, .14, .6, O); q.box(.1, 1.2, .62, .09, .1, 1, GUN); q.box(.1, 1.08, .4, .08, .16, .1, GUN); }, POSTS * MEN);
  const zed = instanced(q => { q.box(0, .86, 0, .6, .76, .34, '#ffffff'); q.box(0, 1.62, .02, .48, .48, .48, '#9fd073'); q.box(-.12, 1.72, .26, .09, .09, .02, '#ff3b30'); q.box(.12, 1.72, .26, .09, .09, .02, '#ff3b30'); q.box(0, 1.5, .26, .24, .06, .02, '#2c3a22'); for (const s of [-1, 1]) q.box(s * .39, 1.34, .32, .17, .17, .72, '#9fd073'); }, POSTS * PACK);
  const leg = instanced(q => { q.box(0, -.82, 0, .24, .82, .24, '#ffffff'); q.box(0, -.86, .04, .26, .1, .34, '#2b2d2a'); }, POSTS * PACK * 2);
  const bolt = new THREE.InstancedMesh(new THREE.BoxGeometry(.06, .06, 1), new THREE.MeshBasicMaterial({ color: '#ffe28a', fog: false }), 30); bolt.frustumCulled = false; scene.add(bolt);
  const flash = new THREE.InstancedMesh(new THREE.SphereGeometry(.22, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff0b0', fog: false }), 30); flash.frustumCulled = false; scene.add(flash);
  front.man = man; front.zed = zed; front.leg = leg; front.bolt = bolt; front.flash = flash; front.PACK = PACK; front.MEN = MEN;
  const C = new THREE.Color(), SHIRT = ['#6b4a7a', '#7a3b3b', '#3f5a70', '#5f6b3a', '#8a6a3a'];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 30; i++) { M.makeScale(0, 0, 0); bolt.setMatrixAt(i, M); flash.setMatrixAt(i, M); front.bolts.push({ t: 0 }); }
  front.posts.forEach((p, pi) => {
    p.men = []; p.zs = [];
    for (let i = 0; i < MEN; i++) { const off = (i - 3) * 2.05, d = .1 + Math.pow(Math.abs(off) / 7, 2) * -1.6; const m = { x: p.x + p.tx * -off + p.ox * d, z: p.z + p.tz * -off + p.oz * d, cool: Math.random() * 2, kick: 0, ry: p.ry, id: pi * MEN + i, aim: p.ry }; p.men.push(m); P.set(m.x, p.y, m.z); Q.setFromAxisAngle(UP, p.ry); man.setMatrixAt(m.id, M.compose(P, Q, S)); }
    for (let i = 0; i < PACK; i++) { const z = { id: pi * PACK + i, p, d: 12 + Math.random() * 50, side: (Math.random() - .5) * 34, v: 1.1 + Math.random() * .8, ph: Math.random() * 6, hp: 3, dead: 0 }; p.zs.push(z); zed.setColorAt(z.id, C.set(SHIRT[z.id % 5])); for (const q of [0, 1]) leg.setColorAt(z.id * 2 + q, C.set(['#3a3f47', '#4b4436', '#2f3a33'][z.id % 3])); }
  });
  man.instanceMatrix.needsUpdate = true; zed.instanceColor.needsUpdate = true; leg.instanceColor.needsUpdate = true;
}
const stepFront = (() => {
  const M = new THREE.Matrix4(), B = new THREE.Matrix4(), L = new THREE.Matrix4(), T = new THREE.Matrix4(), RX = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), A = new THREE.Vector3(), D = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), ZA = new THREE.Vector3(0, 0, 1), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let t = 0, first = true, bi = 0, active = false;
  const reset = z => { z.d = 42 + Math.random() * 24; z.side = (Math.random() - .5) * 34; z.hp = 3; z.dead = 0; z.v = 1.1 + Math.random() * .8; };
  const place = z => { const p = z.p, k = clamp(z.d / 60, .22, 1), x = p.x + p.ox * z.d + p.tx * z.side * k, zz = p.z + p.oz * z.d + p.tz * z.side * k, y = Math.max(p.y, height(x, zz)) - (z.dead > 1.5 ? (z.dead - 1.5) * 1.1 : 0); z.wx = x; z.wz = zz; z.wy = y;
    const fall = clamp(z.dead / .32, 0, 1) * -1.5, sw = z.dead ? 0 : Math.sin(t * 5.5 * z.v + z.ph) * .62; Y.setFromAxisAngle(UP, Math.atan2(p.x - x, p.z - zz)); P.set(x, y, zz); B.compose(P, Y, S); RX.makeRotationX(fall); B.multiply(RX); front.zed.setMatrixAt(z.id, B);
    for (const q of [0, 1]) { T.makeTranslation(q ? .17 : -.17, .86, 0); RX.makeRotationX(q ? sw : -sw); L.copy(B).multiply(T).multiply(RX); front.leg.setMatrixAt(z.id * 2 + q, L); } };
  return dt => {
    t += dt; const posts = front.posts; if (first) { first = false; for (const p of posts) for (const z of p.zs) place(z); front.zed.instanceMatrix.needsUpdate = true; front.leg.instanceMatrix.needsUpdate = true; }
    { const show = view.d <= 420 || drive.on; if (front.man.visible !== show) front.man.visible = front.zed.visible = front.leg.visible = show; }
    if (view.d > 420 && !drive.on) { if (active) { active = false; for (let i = 0; i < 30; i++) { front.bolt.setMatrixAt(i, ZERO); front.flash.setMatrixAt(i, ZERO); } front.bolt.instanceMatrix.needsUpdate = true; front.flash.instanceMatrix.needsUpdate = true; } return; }
    let any = false;
    for (const p of posts) {
      if (Math.hypot(p.x - view.x, p.z - view.z) > view.d + 170) continue; any = true;
      for (const z of p.zs) { if (z.dead) { z.dead += dt; if (z.dead > 2.6) reset(z); } else { z.d -= z.v * dt; if (z.d < 7) z.dead = .001; } place(z); }
      for (const m of p.men) {
        m.kick = Math.max(0, m.kick - dt * 7); m.cool -= dt; if (m.cool > 0) { if (m.kick > 0 || m.was) { P.set(m.x - Math.sin(m.aim) * m.kick * .14, p.y, m.z - Math.cos(m.aim) * m.kick * .14); Y.setFromAxisAngle(UP, m.aim); front.man.setMatrixAt(m.id, M.compose(P, Y, S)); front.man.instanceMatrix.needsUpdate = true; m.was = m.kick > 0; } continue; }
        m.cool = .5 + Math.random() * 1; let best = null, bd = 1e9; for (const z of p.zs) if (!z.dead && z.d < 25) { const e = Math.hypot(z.wx - m.x, z.wz - m.z) + Math.random() * 7; if (e < bd) { bd = e; best = z; } } if (!best) continue;
        m.aim = Math.atan2(best.wx - m.x, best.wz - m.z); m.kick = 1; m.was = true; best.hp--; if (best.hp <= 0) best.dead = .001;
        const b = front.bolts[bi]; bi = (bi + 1) % 30; const sn = Math.sin(m.aim), cs = Math.cos(m.aim); b.t = .1; b.ax = m.x + sn * 1.1 + cs * .1; b.ay = p.y + 1.26; b.az = m.z + cs * 1.1 - sn * .1; b.bx = best.wx; b.by = best.wy + 1.15; b.bz = best.wz;
      }
    }
    for (let i = 0; i < 30; i++) { const b = front.bolts[i]; if (b.t > 0) { b.t -= dt; if (b.t <= 0) { front.bolt.setMatrixAt(i, ZERO); front.flash.setMatrixAt(i, ZERO); } else { A.set(b.ax, b.ay, b.az); D.set(b.bx - b.ax, b.by - b.ay, b.bz - b.az); const len = D.length(), f = 1 - b.t / .1, seg = Math.min(9, len); D.normalize(); Q.setFromUnitVectors(ZA, D); P.copy(A).addScaledVector(D, (len - seg) * f + seg / 2); S.set(1, 1, seg); front.bolt.setMatrixAt(i, M.compose(P, Q, S)); S.setScalar(1 + (1 - f) * .6); front.flash.setMatrixAt(i, M.compose(A, Q, S)); S.set(1, 1, 1); } } }
    front.bolt.instanceMatrix.needsUpdate = true; front.flash.instanceMatrix.needsUpdate = true;
    if (any) { active = true; front.zed.instanceMatrix.needsUpdate = true; front.leg.instanceMatrix.needsUpdate = true; }
  };
})();
function frontGo() { if (selected) clearSel(); front.at = (front.at + 1) % front.posts.length; const p = front.posts[front.at]; Object.assign(goal, { x: p.x + p.ox * 15, z: p.z + p.oz * 15, d: 36, pitch: .2, yaw: Math.atan2(-p.ox, -p.oz), lift: .05 }); }
$('front').onclick = frontGo;

/* ---------- the Dream Mall site is alive: builders and machines at work until the grand opening ---------- */
const stepSite = (() => {
  const root = new THREE.Group(); scene.add(root); const Y = '#e8b21f', K = '#2c2e2a', D = '#3a3f47', W = '#f2f0e8', mesh = g => { const m = g.mesh(solid); m.castShadow = true; return m; }, geo = () => new Geo().at(0, 0), at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
  const excavator = (x, z, ry, tone = Y) => { const r = new THREE.Group(), lo = geo(); for (const s of [-1, 1]) { lo.box(0, .1, s * 1.45, 5.4, .95, .85, K); for (let i = -2; i <= 2; i++) lo.box(i * 1.05, .1, s * 1.9, .3, .95, .06, '#4a4d48'); } lo.box(0, 1, 0, 2.6, .35, 2.2, '#4a4d48'); r.add(mesh(lo));
    const up = new THREE.Group(); at(up, 0, 1.35, 0); const u = geo(); u.box(-.4, 0, 0, 4.2, 1, 2.8, tone); u.box(-2.1, .1, 0, 1, 1.1, 2.8, shade(tone, .78)); u.box(.5, 1, -.75, 1.7, 1.6, 1.2, tone); u.box(.72, 1.15, -.75, 1.3, 1.1, 1.24, '#27323a'); up.add(mesh(u)); r.add(up);
    const boom = new THREE.Group(); at(boom, 1.1, 1, .55); const b = geo(); b.box(2.2, -.32, 0, 4.6, .64, .6, tone); boom.add(mesh(b)); up.add(boom); const arm = new THREE.Group(); at(arm, 4.4, 0, 0); const a = geo(); a.box(1.5, -.24, 0, 3.2, .48, .46, tone); arm.add(mesh(a)); boom.add(arm); const bk = new THREE.Group(); at(bk, 3.1, 0, 0); const c = geo(); c.box(.45, -.7, 0, .9, .7, 1, '#4a4d48'); c.box(.95, -.85, 0, .2, .25, 1.05, '#8a8d8b'); bk.add(mesh(c)); arm.add(bk);
    at(r, x, .16, z); r.rotation.y = ry; root.add(r); return { r, up, boom, arm, bk, ph: x * .1 }; };
  const truck = (mixer, c) => { const r = new THREE.Group(), g = geo(); g.box(0, .55, 0, 8, .34, 2.3, K); g.box(3.1, .85, 0, 1.9, 1.9, 2.4, c); g.box(3.62, 1.7, 0, .94, .78, 2.26, '#27323a'); g.box(4.08, .6, 0, .1, .45, 2.3, '#c9ccc9'); r.add(mesh(g)); const ws = []; for (const x of [2.9, -1.5, -3]) for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .46, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#191a1a' })); at(w, x, .62, s * 1.08); r.add(w); ws.push(w); }
    let part; if (mixer) { const m = geo(); m.add(new THREE.CylinderGeometry(1.08, 1.32, 4.4, 14).rotateZ(Math.PI / 2), '#d7d9d6', 0, 0, 0); for (let i = 0; i < 6; i++) m.box(-1.8 + i * .75, -.1, 0, .22, 2.76, 2.76, i % 2 ? '#e0632e' : '#c9ccc9'); part = mesh(m); at(part, -1, 2.3, 0); r.add(part); } else { const t = geo(); t.box(-.6, .12, 0, 5.2, .18, 2.4, c); for (const q of [-1, 1]) t.box(-.6, .3, q * 1.16, 5.2, 1.2, .1, shade(c, .8)); t.box(2, .3, 0, .1, 1.3, 2.4, shade(c, .8)); t.box(-3.15, .3, 0, .1, 1.1, 2.4, shade(c, .8)); t.add(new THREE.ConeGeometry(1.25, 1.1, 8), '#7c6444', -.7, 1.2, 0); part = mesh(t); at(part, 0, .85, 0); r.add(part); } root.add(r); return { r, part, ws, mixer, t: 0 }; };
  const dozer = (() => { const r = new THREE.Group(), g = geo(); for (const s of [-1, 1]) g.box(0, .08, s * 1.3, 4.2, .85, .8, K); g.box(0, .9, 0, 3.6, .9, 2, Y); g.box(-.5, 1.8, 0, 1.7, 1.2, 1.6, '#27323a'); g.box(-.5, 3, 0, 1.9, .14, 1.8, Y); g.box(3.1, .1, 0, .3, 1.5, 3.6, Y); g.box(2.3, .55, 1.2, 1.8, .2, .2, K); g.box(2.3, .55, -1.2, 1.8, .2, .2, K); r.add(mesh(g)); root.add(r); return r; })();
  const hut = geo(); for (const [x, c] of [[-58, W], [-51.2, '#2f7fc0']]) { hut.box(x, 0, -560, 6.4, 2.7, 2.8, c); hut.box(x, 2.7, -560, 6.6, .12, 3, '#9a9c9c'); hut.box(x + 1.6, .1, -558.6, 1, 2.1, .06, '#5a3a24'); hut.box(x - 1.5, 1.1, -558.6, 1.4, .9, .06, '#27323a'); } root.add(mesh(hut));
  const digs = [excavator(26, -628, 2.6), excavator(-30, -566, -1.3, '#e0632e'), excavator(38, -565, 1.9)], loop = [truck(false, '#d8352b'), truck(false, '#2f7fc0'), truck(true, '#3fa86a')]; loop.forEach((c, i) => { c.t = i * 2.1; });
  const N = 34, man = instanced(q => { q.box(0, .86, 0, .56, .6, .3, '#ff7a1a'); q.box(0, 1.08, .155, .58, .07, .02, '#f4f1e8'); q.box(0, .96, .155, .58, .07, .02, '#f4f1e8'); for (const s of [-1, 1]) { q.box(s * .36, .84, .02, .15, .58, .16, '#ff7a1a'); q.box(s * .36, .74, .02, .13, .13, .14, '#e3b48f'); } q.box(0, 1.46, 0, .36, .34, .34, '#e3b48f'); q.box(0, 1.76, 0, .44, .16, .44, '#f6c81e'); q.box(0, 1.76, .06, .5, .06, .56, '#f6c81e'); }, N), leg = instanced(q => { q.box(0, -.72, 0, .22, .72, .25, '#2f4f7a'); q.box(0, -.84, .04, .24, .14, .34, '#23201c'); }, N * 2), load = instanced(q => { q.box(0, 1.92, .1, .3, .1, 2.8, '#b98d4e'); }, N), tool = instanced(q => { q.box(0, .1, 0, .08, .08, 1.5, '#6b4a30'); q.box(0, .1, .78, .36, .26, .05, '#5c6066'); }, N);
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), R = new THREE.Matrix4(), L = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), rnd = rng(911), Yy = () => rnd() * 6.283;
  const yard = () => [-56 + rnd() * 112, -582 + rnd() * 26], pit = () => [-50 + rnd() * 100, -632 + rnd() * 40];
  const men = Array.from({ length: N }, (_, i) => { const dig = i % 3 === 0, walk = !dig, [x, z] = (i % 2 ? yard : pit)(); return { i, x, z, gx: x, gz: z, dig, walk, inpit: !(i % 2), v: 1.1 + rnd() * .7, ph: Yy(), ry: Yy(), carry: walk && i % 4 === 1 }; });
  const ROWS = 8, PER = 5, spots = [{ x: -13, z: -576, pile: [-40, -566], t: 0 }, { x: 26, z: -579, pile: [30, -570], t: 11 }, { x: -50, z: -578, pile: [-37, -566], t: 22 }], brick = instanced(q => q.box(0, 0, 0, 1.12, .4, .52, '#b4553f'), spots.length * ROWS * PER), mortar = new THREE.Color();
  spots.forEach((sp, si) => { for (let i = 0; i < ROWS * PER; i++) brick.setColorAt(si * ROWS * PER + i, mortar.setHSL(.03, .3, .72 + rnd() * .22)); const a = men.slice(si * 5, si * 5 + 5); a.forEach((m, k) => { m.inpit = false; m.fixed = k < 2; if (k < 2) { m.dig = true; m.walk = false; m.carry = false; m.x = m.gx = sp.x + (k ? 1.7 : -1.7); m.z = m.gz = sp.z + 1.25; m.ry = Math.PI; } else { m.dig = false; m.walk = true; m.route = [sp.pile, [sp.x + (k - 3) * 2, sp.z + 2.6]]; m.leg = k % 2; m.x = m.route[m.leg][0]; m.z = m.route[m.leg][1]; m.carry = false; m.gx = m.route[1 - m.leg][0]; m.gz = m.route[1 - m.leg][1]; m.leg = 1 - m.leg; m.carry = m.leg === 1; } }); }); brick.instanceColor.needsUpdate = true;
  const pick = m => { if (m.route) { m.leg = 1 - m.leg; m.gx = m.route[m.leg][0]; m.gz = m.route[m.leg][1]; m.carry = m.leg === 1; return; } const inp = m.inpit && mallBuilt === 0, [x, z] = (inp ? pit : yard)(); m.gx = x; m.gz = z; };
  let t = 0, last = -1;
  return dt => {
    const stage = mallBuilt, done = stage >= 5; if (root.visible === done) root.visible = !done; if (done) { for (const o of [man, leg, load, tool, brick]) o.visible = false; return; }
    const far = view.d > 700 || Math.hypot(view.x, view.z + 612) > view.d + 260; if (far && last === stage) return; t += dt;
    if (last !== stage) { last = stage; digs[0].r.visible = stage === 0; dozer.visible = stage === 0; for (const m of men) if (m.inpit && stage > 0) { const [x, z] = yard(); m.x = m.gx = x; m.z = m.gz = z; } }
    dozer.position.set(-6 + Math.sin(t * .22) * 34, .16, -622); dozer.rotation.y = Math.cos(t * .22) > 0 ? 0 : Math.PI;
    for (const d of digs) { const a = t * .55 + d.ph, c = (Math.sin(a) + 1) / 2; d.up.rotation.y = Math.sin(a * .5) * .9; d.boom.rotation.z = .1 + c * .5; d.arm.rotation.z = -.5 - (1 - c) * 1; d.bk.rotation.z = -.2 - c * 1.1; }
    for (const c of loop) { c.t += dt * .075; const a = c.t, ca = Math.cos(a), sa = Math.sin(a), f = (u, A, off) => Math.sign(u) * Math.pow(Math.abs(u), .5) * A + off, x = f(ca, 62, 0), z = f(sa, 38, -612), n = a + .01, x2 = f(Math.cos(n), 62, 0), z2 = f(Math.sin(n), 38, -612); c.r.position.set(x, .12, z); c.r.rotation.y = -Math.atan2(z2 - z, x2 - x); for (const w of c.ws) w.rotation.z -= dt * 3.6; if (c.mixer) c.part.rotation.x += dt * 2; }
    for (const m of men) { const fl = stage > 0 && m.z < -586 ? 1.02 : .16, base = (y, ang) => { P.set(m.x, y, m.z); Q.setFromAxisAngle(UP, ang); M.compose(P, Q, S); };
      if (m.dig) { const b = Math.max(0, Math.sin(t * 2.2 + m.ph)); base(fl, m.ry); R.makeRotationX(.25 + b * .6); M.multiply(R); man.setMatrixAt(m.i, M); for (const q of [0, 1]) { T.makeTranslation(q ? .16 : -.16, .84, 0); L.copy(M).multiply(T); leg.setMatrixAt(m.i * 2 + q, L); } T.makeTranslation(0, .84, .32); R.makeRotationX(.7 - b * 1.1); L.copy(M).multiply(T).multiply(R); tool.setMatrixAt(m.i, L); load.setMatrixAt(m.i, ZERO); continue; }
      const dx = m.gx - m.x, dz = m.gz - m.z, d = Math.hypot(dx, dz); if (d < .6) pick(m); else { m.x += dx / d * m.v * dt; m.z += dz / d * m.v * dt; m.ry = Math.atan2(dx, dz); } const sw = Math.sin(t * m.v * 5 + m.ph) * .62; base(fl, m.ry); man.setMatrixAt(m.i, M); for (const q of [0, 1]) { T.makeTranslation(q ? .16 : -.16, .84, 0); R.makeRotationX(q ? sw : -sw); L.copy(M).multiply(T).multiply(R); leg.setMatrixAt(m.i * 2 + q, L); } load.setMatrixAt(m.i, m.carry ? M : ZERO); tool.setMatrixAt(m.i, ZERO); }
    spots.forEach((sp, si) => { sp.t += dt; const n = ROWS * PER, cycle = n * .9 + 6, u = sp.t % cycle, placed = u / .9; for (let i = 0; i < n; i++) { const id = si * n + i, r = Math.floor(i / PER), c = i % PER, k = clamp(placed - i, 0, 1); if (k <= 0) { brick.setMatrixAt(id, ZERO); continue; } const e = 1 - (1 - k) * (1 - k); P.set(sp.x + (c - 2) * 1.16 + (r % 2 ? .58 : 0), .16 + r * .42 + (1 - e) * 1.1, sp.z); Q.identity(); brick.setMatrixAt(id, M.compose(P, Q, S)); } });
    brick.instanceMatrix.needsUpdate = true;
    for (const o of [man, leg, load, tool]) o.instanceMatrix.needsUpdate = true;
  };
})();

/* ---------- the locals: people you can tap, each with a short story of how they came to Dream City ---------- */
const people = (() => {
  const lot = k => CIVIC.find(c => c.kind === k).lot, door = (l, off) => { const f = l.side > 0 ? -1 : 1; return [l.x + 6.5 + off, l.z + 6.6 * f, 0, f]; }, p0 = front.posts[0], SK = ['#e8bd9a', '#c98f62', '#8d5a3a', '#f0ceb0'];
  const list = [
    { name: 'The Mayor', role: 'The Mayor', at: [0, -16, 0, 1], skin: 0, top: '#1c2233', legs: '#141927', hat: '#111216', trim: '#c8352b', story: "I came here with a tent, a kettle and a very big idea: one follower, one house. People laughed. Now there are thousands of front doors, and I still stop to knock on a few. Wipe your feet. Welcome home." },
    { name: 'Father Michael', role: 'The priest', at: [-17.5, 7, 0, 1], skin: 0, top: '#17181c', legs: '#17181c', hat: null, trim: '#f4f1e8', story: "I came here to look after a tiny chapel. Then the town grew around it. Now I know more than three thousand names, and I pray for all of you. Even the cows. Especially the cows." },
    { name: 'Officer Hale', role: 'Police', at: door(lot('police'), 2.6), tall: 1, skin: 1, top: '#1f2f52', legs: '#17213b', hat: '#141c33', trim: '#e9c63d', story: "I moved from the big city for a quieter job. My first case here was a marmot stealing carrots. It is still open. These days I keep the streets calm while the army holds the line." },
    { name: 'Dr Amara', role: 'The doctor', at: door(lot('hospital'), 2.6), tall: 1, skin: 2, top: '#f5f6f4', legs: '#3f7f8c', hat: null, trim: '#3f7f8c', story: "I came for one summer to help at the new hospital. That was years ago. Nobody here ever says goodbye properly, so I never left. Everyone in this town has my number." },
    { name: 'Tom Barrow', role: 'Firefighter', at: door(lot('fire'), 2.6), tall: 1, skin: 3, top: '#2a2c31', legs: '#2a2c31', hat: '#d8352b', trim: '#f3d33a', story: "When I was six a fire took our family home. A stranger carried me out. I moved here to be that stranger for somebody else. Mostly I rescue cats. I am fine with that." },
    { name: 'Anna', role: 'New in town', at: [31, 10, -1, 0], skin: 3, top: '#d8588a', legs: '#2f4f7a', hat: null, trim: '#ffffff', story: "I moved here for a better life. I had one suitcase and no plan. Someone said one follower gets one house, and I laughed. Now I have a front door, and the neighbors wave. I am never leaving." },
    { name: 'Old Bill', role: 'Fisherman', at: [40, riverZ(40) - 16, 0, 1], skin: 0, top: '#58724a', legs: '#4b4032', hat: '#c9a964', trim: '#c9a964', story: "I was here before the houses. It was just me, the river and the cows. People ask if I mind the town. I tell them the fish do not bite any better, but now I have someone to complain to." },
    { name: 'Sam', role: 'Bus driver', at: [34, 25, 0, -1], skin: 1, tall: 1, top: '#c8352b', legs: '#23262f', hat: '#23262f', trim: '#ffffff', story: "I came here to start again after losing my job. They gave me a bus and a street map, and the map changes every day because new people keep arriving. Best job I ever had." },
    { name: 'Sergeant Cole', role: 'The army', at: [p0.x - p0.ox * 6.5 - p0.tx * 2, p0.z - p0.oz * 6.5 - p0.tz * 2, p0.ox, p0.oz], skin: 2, top: '#5a6a45', legs: '#46533a', hat: '#46533a', trim: '#2c3129', story: "They sent us for one night. I have not slept since. I stay because of the lights in the windows behind me. Every one of those houses belongs to someone. Nearly there. Hold the line." },
  ];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const c of list) {
    const b = new Geo().at(0, 0), a = new Geo().at(0, 0), sk = SK[c.skin], [x, z, fx, fz] = c.at; b.sc = a.sc = 1.3; b.sy = a.sy = 1.3;
    for (const s of [-1, 1]) { b.box(s * .16, 0, .03, .23, .15, .36, '#1b1c1e'); b.box(s * .16, .14, 0, .23, .72, .26, c.legs); }
    b.box(0, .84, 0, .56, .62, .3, c.top); b.box(0, 1.2, 0, .6, .24, .32, c.top); b.box(0, 1.08, .155, c.role === 'The priest' ? .14 : .1, .32, .02, c.trim); b.box(-.39, .82, 0, .15, .6, .16, c.top); b.box(-.39, .72, 0, .13, .14, .14, sk);
    b.box(0, 1.44, 0, .2, .1, .2, sk); b.box(0, 1.5, 0, .38, .36, .36, sk); b.box(-.09, 1.64, .185, .06, .06, .02, '#20232a'); b.box(.09, 1.64, .185, .06, .06, .02, '#20232a'); b.box(0, 1.56, .185, .12, .03, .02, '#7a3b3b');
    b.box(0, 1.8, -.03, .4, .12, .4, c.hat || (c.skin === 2 ? '#20150f' : '#5e3b26')); if (c.hat) b.box(0, 1.8, .06, .5, .05, .56, c.hat); if (c.role === 'The priest') b.box(0, 1.33, .16, .2, .05, .02, '#f4f1e8'); if (c.role === 'The Mayor') { b.box(0, 1.86, 0, .36, .46, .36, c.hat); b.box(0, 1.88, 0, .37, .1, .37, '#c8352b'); b.box(0, 1.5, .185, .26, .05, .02, '#3a2a1c'); for (let i = 0; i < 5; i++) b.box(-.2 + i * .1, 1.2 - i * .08, .16, .13, .13, .03, '#c8352b'); b.box(0, 1.24, .16, .3, .05, .03, '#d6b13c'); } if (c.role === 'New in town') { b.box(0, 1.46, -.2, .4, .34, .08, '#5e3b26'); b.box(-.6, 0, .05, .2, .5, .58, '#a15c35'); } if (c.role === 'Fisherman') b.add(new THREE.CylinderGeometry(.015, .03, 3, 5).rotateX(1.05), '#5e3b26', -.39, 1.6, 1.25);
    a.box(0, -.48, 0, .15, .6, .16, c.top); a.box(0, -.84, 0, .13, .14, .14, sk);
    const r = new THREE.Group(), body = b.mesh(mat), arm = a.mesh(mat); body.castShadow = arm.castShadow = true; arm.position.set(.5, 1.75, 0); r.add(body, arm); r.position.set(x, Math.max(0, height(x, z)) + .02, z); r.rotation.y = Math.atan2(fx, fz); scene.add(r); sceneHits.push(x - .7, x + .7, z - .7, z + .7); c.root = r; c.arm = arm; c.x = x; c.z = z; c.fx = fx; c.fz = fz; c.ph = list.indexOf(c) * 1.7;
    const pin = document.createElement('button'); pin.className = 'pin npc'; pin.textContent = c.name; pin.hidden = true; pin.onclick = () => personSheet(c); labelBox.append(pin); c.pin = pin;
  }
  return list;
})();
function personSheet(c) {
  if (selected) clearSel(); Object.assign(goal, c.tall ? { x: c.x, z: c.z, d: 25, pitch: .66, yaw: Math.atan2(c.fx, c.fz) + .3, lift: .06 } : { x: c.x, z: c.z, d: 17, pitch: .24, yaw: Math.atan2(c.fx, c.fz) + .35, lift: .09 });
  openSheet(p => { p.append(el('h2', '', c.name), el('small', '', c.role), el('p', '', `"${c.story}"`)); const b = el('button', 'btn', 'Close'); b.onclick = closeSheet; p.append(b); });
}
function peopleSheet() { openSheet(p => { p.append(el('h2', '', 'Meet the locals')); const box = document.createElement('div'); box.className = 'carlist'; for (const c of people) { const b = el('button', 'carpick'), t = document.createElement('span'); t.append(el('b', '', c.name), el('small', '', c.role)); b.append(t); b.onclick = () => { closeSheet(); personSheet(c); }; box.append(b); } const x = el('button', 'btn ghost', 'Close'); x.onclick = closeSheet; p.append(box, x); }); }
$('bPeople').onclick = peopleSheet;
function stepPeople(now) { hillSign.mat.emissiveIntensity = sun.intensity < 1 ? .85 : .12; const t = now / 1000, near = view.d < 300; for (const c of people) { c.arm.rotation.x = Math.sin(t * .9 + c.ph) * .1; c.arm.rotation.z = Math.max(0, Math.sin(t * .5 + c.ph)) ** 8 * 2.3; c.root.scale.y = 1 + Math.sin(t * 1.6 + c.ph) * .012;
    let show = false; if (near && !room.on && !drive.on && !(stroll.on && c === people[0])) { pv.set(c.x, 3.1 + Math.max(0, height(c.x, c.z)), c.z).project(camera); show = Math.abs(pv.x) < 1 && Math.abs(pv.y) < 1 && pv.z < 1 && Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < 220; if (show) c.pin.style.transform = `translate(${Math.round((pv.x + 1) / 2 * innerWidth)}px,${Math.round((1 - pv.y) / 2 * viewH())}px) translate(-50%,-100%)`; } if (c.pin.hidden === show) c.pin.hidden = !show; } }
function tapPerson(x, y) { for (const c of people) { pv.set(c.x, 1.3, c.z).project(camera); if (pv.z < 1 && Math.hypot((pv.x + 1) / 2 * innerWidth - x, (1 - pv.y) / 2 * viewH() - y) < 36 && view.d < 300) { personSheet(c); return true; } } return false; }

/* ---------- install on the home screen: a real icon, full screen, and faster repeat visits ---------- */
{
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true, ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); let promptEvent = null;
  if ('serviceWorker' in navigator && location.protocol === 'https:') setTimeout(() => navigator.serviceWorker.register('/sw.js').catch(() => {}), 3500); // this script can run after the page load event, so it must not wait for it
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptEvent = e; });
  const tip = () => { if (standalone || store.get('appTip') || (!promptEvent && !ios) || !PHONE) return; if (show || room.on || drive.on || !sheet.hidden || !$('welcome').hidden) { setTimeout(tip, 15000); return; }
    const t = document.createElement('div'); t.id = 'appTip'; const i = new Image(); i.src = 'icon-192.png'; i.alt = ''; const d = document.createElement('div'); d.append(el('b', '', `Get the ${CFG.name} app`), el('small', '', 'Free, right on your home screen')); const go = el('button', 'go', 'Add'), no = el('button', 'no', '×'); no.setAttribute('aria-label', 'Close'); const end = () => { store.set('appTip', '1'); t.remove(); }; no.onclick = end;
    go.onclick = async () => { if (promptEvent) { promptEvent.prompt(); await promptEvent.userChoice; promptEvent = null; end(); return; } end(); openSheet(p => { p.append(el('h2', '', 'Add to your home screen'), el('p', '', '1. Tap the Share button in your browser.'), el('p', '', '2. Choose "Add to Home Screen".'), el('p', '', `3. Tap Add. ${CFG.name} is now on your phone.`)); const b = el('button', 'btn', 'Got it'); b.onclick = closeSheet; p.append(b); }); };
    t.append(i, d, go, no); document.body.append(t); };
  setTimeout(tip, 40000); window.__appTip = tip;
}

/* ---------- driving: one of three cars, from the garage, around the real streets ---------- */
const CAR_SPEC = { hatch: { name: 'Everyday', note: 'Easy to drive', top: 34, acc: 7.5, steer: .56 }, sport: { name: 'Sports', note: 'The fastest', top: 47, acc: 12, steer: .5 }, suv: { name: 'SUV', note: 'Big and tough', top: 30, acc: 6.5, steer: .5 } };
const carHits = new Map(), HIT = 6, carKey = (i, j) => i * 100003 + j; let carReady = false;
function carRect(x0, x1, z0, z1) { for (const b of bridges) if (x1 > b.x - 3.7 && x0 < b.x + 3.7 && z1 > b.rz - BRIDGE_RAMP - 3 && z0 < b.rz + BRIDGE_RAMP + 3) return; const r = [x0, x1, z0, z1, (x1 - x0) * (z1 - z0)]; for (let i = Math.floor(x0 / HIT); i <= Math.floor(x1 / HIT); i++) for (let j = Math.floor(z0 / HIT); j <= Math.floor(z1 / HIT); j++) { const k = carKey(i, j); if (!carHits.has(k)) carHits.set(k, []); carHits.get(k).push(r); } }
function carRects(a) { for (let i = 0; i + 3 < a.length; i += 4) carRect(a[i], a[i + 1], a[i + 2], a[i + 3]); }
function carGrid() {
  if (!carReady) { carReady = true; carRects(sceneHits); sceneHits.length = 0;
    for (const h of houses) carRect(h.x - 6.4, h.x + 6.4 + (h.yard || 0), h.z - 5.4, h.z + 5.4);
    for (const c of CIVIC) if (c.lot) carRect(c.lot.x - 6.5, c.lot.x + 19.5, c.lot.z - 7, c.lot.z + 7);
    carRect(-29, -15, -24, 6); carRect(15, 37, -25, -7); carRect(14, 34, -30.9, -30.2); carRect(12.5, 23.5, 4.5, 15.5); // church, bakery plot, scoreboard, fountain
    carRect(-65.5, 65.5, -651, -552); // the whole mall site, fence included
     carRect(BASE.x - BASE.W / 2, BASE.x + BASE.W / 2, BASE.z - BASE.D / 2, BASE.z + BASE.D / 2);
  }
  while (carQueue.length) carRects(carQueue.pop());
}
const carWater = (x, z) => height(x, z) < -.3 && !bridges.some(b => Math.abs(x - b.x) < 3.6); // the ground dips to the river well before the water starts
const carOff = (x, z) => Math.hypot(x, z) > townR + 4 || carWater(x, z);
function carBlocked(x, z) { // one point: used to keep the camera out of buildings
  carGrid(); if (carOff(x, z)) return true; const list = carHits.get(carKey(Math.floor(x / HIT), Math.floor(z / HIT))); if (list) for (const r of list) if (r[4] > 9 && x > r[0] && x < r[1] && z > r[2] && z < r[3]) return true; return false;
}
function carHit(x, z, co, si, hl, hw) { // the true outline of the car against every solid thing around it
  const lx = co * hl, lz = si * hl, wx = -si * hw, wz = co * hw;
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (carOff(x + lx * a + wx * b, z + lz * a + wz * b)) return true;
  const ex = Math.abs(co) * hl + Math.abs(si) * hw, ez = Math.abs(si) * hl + Math.abs(co) * hw;
  for (let i = Math.floor((x - ex) / HIT); i <= Math.floor((x + ex) / HIT); i++) for (let j = Math.floor((z - ez) / HIT); j <= Math.floor((z + ez) / HIT); j++) {
    const list = carHits.get(carKey(i, j)); if (!list) continue;
    for (const r of list) { const rx = (r[1] - r[0]) / 2, rz = (r[3] - r[2]) / 2, dx = r[0] + rx - x, dz = r[2] + rz - z; if (Math.abs(dx) > ex + rx || Math.abs(dz) > ez + rz) continue; const ac = Math.abs(co), as = Math.abs(si); if (Math.abs(dx * co + dz * si) < hl + rx * ac + rz * as && Math.abs(dz * co - dx * si) < hw + rx * as + rz * ac) return true; }
  }
  return false;
}
const carEnv = () => { if (drive.env) return drive.env; const e = new THREE.Scene(), m = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 10), new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 p;void main(){float h=normalize(p).y;vec3 c=h<0.?vec3(.2,.21,.19):mix(vec3(.95,.97,1.),vec3(.42,.6,.85),smoothstep(0.,.6,h));gl_FragColor=vec4(c,1.);}' })); e.add(m); const pm = new THREE.PMREMGenerator(renderer); drive.env = pm.fromScene(e, .02).texture; pm.dispose(); return drive.env; };
function carScript() { return window.DreamCars ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'cars/cars.js?v=1'; s.onload = ok; s.onerror = no; document.head.append(s); }); }
function carSheet() {
  if (show || room.on) return;
  const open = new URLSearchParams(location.search).has('drive'); // cars stay behind this door until they launch
  openSheet(p => { p.append(el('h2', '', open ? 'Pick your car' : 'Cars are coming soon')); if (!open) p.append(el('p', '', `Soon you will drive around ${CFG.name} from your own garage. Pick one of three cars.`)); const list = document.createElement('div'); list.className = 'carlist';
    for (const k of ['suv', 'sport', 'hatch']) { const b = el('button', 'carpick'), i = new Image(); i.src = `cars/${k}.jpg`; i.alt = ''; i.width = 120; i.height = 68; const t = document.createElement('span'); t.append(el('b', '', CAR_SPEC[k].name), el('small', '', CAR_SPEC[k].note)); b.append(i, t); if (open) b.onclick = () => startDrive(k); else { b.disabled = true; b.classList.add('soon'); } list.append(b); }
    const c = el('button', 'btn ghostbtn', open ? 'Not now' : 'OK'); c.onclick = closeSheet; p.append(list, c); });
}
async function startDrive(kind) {
  closeSheet(); toast('Starting the engine'); try { await carScript(); } catch { toast('The garage is stuck. Try again.'); return; }
  await new Promise(r => setTimeout(r, 30));
  const d = drive, h = selected || byKey.get(store.get('me')) || houses[0];
  if (!d.cars[kind]) { const c = window.DreamCars.build(kind, { lite: true }), env = carEnv(); c.traverse(o => { if (o.material && o.material.isMeshStandardMaterial) { o.material.envMap = env; o.material.envMapIntensity = o.material.envMapIntensity || 1; o.material.needsUpdate = true; } }); c.rotation.order = 'YZX'; const g = new THREE.Mesh(new THREE.PlaneGeometry(26, 15), new THREE.MeshBasicMaterial({ color: '#ffe9b8', transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, map: (() => { const q = document.createElement('canvas'); q.width = q.height = 64; const x = q.getContext('2d'), r = x.createRadialGradient(10, 32, 2, 10, 32, 56); r.addColorStop(0, '#fff'); r.addColorStop(1, '#000'); x.fillStyle = r; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(q); })() })); g.rotation.x = -Math.PI / 2; g.position.set(c.userData.spec.L / 2 + 12.5, .16, 0); c.add(g); c.userData.beam = g; d.cars[kind] = c; }
  if (d.car) scene.remove(d.car); d.car = d.cars[kind]; d.spec = { ...CAR_SPEC[kind], ...d.car.userData.spec }; scene.add(d.car);
  d.x = h.x + 4.7 * h.flip; d.z = h.z + 8.4 * h.flip; d.th = h.flip > 0 ? Math.PI / 2 : -Math.PI / 2;
  carGrid(); { const L = d.spec.L / 2 - .05, Wd = d.spec.W / 2 - .03, cands = [[d.x, d.z, d.th], [d.x, h.z + 9.6 * h.flip, d.th], [h.x, h.z + 11 * h.flip, 0], [h.x + 8, h.z + 11 * h.flip, 0], [h.x - 8, h.z + 11 * h.flip, 0]], ok = cands.find(c => !carHit(c[0], c[1], Math.cos(c[2]), Math.sin(c[2]), L, Wd)); d.ghost = !ok; if (ok) { d.x = ok[0]; d.z = ok[1]; d.th = ok[2]; } }
  d.cth = d.th + Math.PI; d.intro = true; d.v = 0; d.st = 0; d.dist = 0; d.up = 2.9; d.keys = {}; d.y = deckY(d.x, d.z) + .1; $('drive').classList.remove('seen');
  if (selected) $('x').click(); document.body.classList.add('driving'); $('drive').hidden = false; marker.visible = false; d.on = true; camera.fov = 58; camera.updateProjectionMatrix();
  d.car.userData.beam.visible = sun.intensity < 1; updateDetail(); updateDetail();
}
function stopDrive() {
  const d = drive; if (!d.on) return; d.on = false; scene.remove(d.car); document.body.classList.remove('driving'); $('drive').hidden = true; camera.fov = 42; camera.updateProjectionMatrix();
  Object.assign(goal, { x: d.x, z: d.z, d: 70, pitch: .5, yaw: Math.PI / 2 - d.th + Math.PI, lift: .075 }); while (goal.yaw > Math.PI) goal.yaw -= Math.PI * 2; while (goal.yaw < -Math.PI) goal.yaw += Math.PI * 2; Object.assign(view, goal); updateDetail();
}
function stepDrive(dt) {
  const d = drive, c = d.spec, k = d.keys, gas = k.up ? 1 : 0, brake = k.down ? 1 : 0, turn = (k.right ? 1 : 0) - (k.left ? 1 : 0);
  if (gas) d.v += (d.v < 0 ? 22 : c.acc * (1 - .72 * clamp(d.v / c.top, 0, 1))) * dt; else if (brake) d.v -= (d.v > 0 ? 22 : 5) * dt; else d.v -= Math.sign(d.v) * Math.min(Math.abs(d.v), 3.2 * dt);
  d.v = clamp(d.v, -9, c.top);
  d.st += (turn * c.steer * (1 - .62 * clamp(Math.abs(d.v) / c.top, 0, 1)) - d.st) * (1 - Math.exp(-dt * 8));
  carGrid(); const hl = c.L / 2 - .05, hw = c.W / 2 - .03; let co = Math.cos(d.th), si = Math.sin(d.th); if (d.ghost && !carHit(d.x, d.z, co, si, hl, hw)) d.ghost = false; const stuck = d.ghost; // only when no free spot existed at the start: it ends at the first clear position
  const nth = d.th + d.v / c.wb * Math.tan(d.st) * dt, nc = Math.cos(nth), ns = Math.sin(nth);
  if (stuck || !carHit(d.x, d.z, nc, ns, hl, hw)) { d.th = nth; co = nc; si = ns; }
  const nx = d.x + co * d.v * dt, nz = d.z + si * d.v * dt, hit = (x, z) => !stuck && carHit(x, z, co, si, hl, hw);
  if (!hit(nx, nz)) { d.x = nx; d.z = nz; } else if (!hit(nx, d.z)) { d.x = nx; d.v *= 1 - 2.5 * dt; } else if (!hit(d.x, nz)) { d.z = nz; d.v *= 1 - 2.5 * dt; } else d.v = Math.abs(d.v) < 1 ? 0 : d.v * -.25;
  { const ahead = Math.sign(d.v), mover = (px, pz) => { const ax = px - d.x, az = pz - d.z; if (Math.abs(ax) < 4.6 && Math.abs(az) < 4.6 && Math.hypot(ax, az) < 3.9 + Math.abs(ax * co + az * si) * .25 && (ax * co + az * si) * ahead > 0) d.v = -ahead * Math.min(3, Math.abs(d.v) * .3); }; // traffic is solid too
    for (const q of fleet) mover(q.root.position.x, q.root.position.z); for (const q of buses) mover(q.root.position.x, q.root.position.z);
    for (const q of cars) { const t = q.dir > 0 ? q.t : 1 - q.t, p = q.min + (q.max - q.min) * t; if (q.ax === 'x') mover(p, q.at); else mover(q.at, p); } }
  const y = deckY(d.x, d.z) + (Math.abs(deckY(d.x, d.z)) > 0 ? .22 : 0) + .1; d.y += (y - d.y) * (1 - Math.exp(-dt * 14));
  const up = Math.atan((deckY(d.x + co, d.z + si) - deckY(d.x - co, d.z - si)) / 2); d.dist += d.v * dt;
  const u = d.car.userData; d.car.position.set(d.x, d.y, d.z); d.car.rotation.set(-d.st * d.v / c.top * .05, -d.th, up); u.spin(d.dist); u.steer(-d.st);
  let dth = d.th - d.cth; dth = Math.atan2(Math.sin(dth), Math.cos(dth)); if (Math.abs(d.v) > .4) d.intro = false; if (!d.intro) d.cth += dth * (1 - Math.exp(-dt * 4.5));
  const fx = d.x + Math.cos(d.th) * 18, fz = d.z + Math.sin(d.th) * 18; view.x = goal.x = fx; view.z = goal.z = fz; view.d = goal.d = 62; view.lift = goal.lift = .075;
  if (frame % 6 === 0) $('dSpeed').textContent = Math.round(Math.abs(d.v) * 2.237);
  if (frame % 40 === 0) u.beam.visible = sun.intensity < 1;
  if (gas || brake || turn) $('drive').classList.add('seen');
}
function driveCam() {
  const d = drive, far = 7.8 + Math.abs(d.v) * .04, cx = d.x - Math.cos(d.cth) * far, cz = d.z - Math.sin(d.cth) * far, up = carBlocked(cx, cz) ? 6.5 : 2.9; d.up += (up - d.up) * .07;
  camera.position.set(cx, d.y + d.up, cz); camera.lookAt(d.x + Math.cos(d.cth) * 4, d.y + 1, d.z + Math.sin(d.cth) * 4);
  const f = 58 + Math.abs(d.v) * .28; if (Math.abs(camera.fov - f) > .4) { camera.fov = f; camera.updateProjectionMatrix(); }
}
{ const map = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }, on = v => e => { if (!drive.on) return; if (e.code === 'Escape') return stopDrive(); const a = map[e.code]; if (a) { drive.keys[a] = v; e.preventDefault(); } };
  addEventListener('keydown', on(true)); addEventListener('keyup', on(false)); addEventListener('blur', () => { drive.keys = {}; });
  for (const b of document.querySelectorAll('#drive [data-k]')) { const a = b.dataset.k, go = v => e => { e.preventDefault(); drive.keys[a] = v; b.classList.toggle('held', v); }; b.addEventListener('pointerdown', e => { b.setPointerCapture(e.pointerId); go(true)(e); }); for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(n, go(false)); b.addEventListener('contextmenu', e => e.preventDefault()); }
  $('dPark').onclick = stopDrive; $('bDrive').onclick = carSheet; }

/* ---------- walk the town as the Mayor, third person. Opens with ?mayor on the address ---------- */
{
  const s = stroll, Geoq = () => new Geo().at(0, 0), mat = new THREE.MeshLambertMaterial({ vertexColors: true }), SUIT = '#1c2233', DARK = '#141927', SKIN = '#e8bd9a', R = '#c8352b', G = '#d6b13c'; let man = null;
  const limb = (build, x, y, z) => { const g = Geoq(); build(g); const m = g.mesh(mat), p = new THREE.Group(); m.castShadow = true; p.position.set(x, y, z); p.add(m); return p; };
  const soft = (w, h, d, r = .06) => { const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3), p = g.attributes.position, v = new THREE.Vector3(), hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const c = new THREE.Vector3(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz)); v.sub(c); if (v.lengthSq() > 0) v.normalize().multiplyScalar(r); v.add(c); p.setXYZ(i, v.x, v.y, v.z); } return g; };
  const buildMan = () => { const r = new THREE.Group(), b = Geoq(), LAP = '#262e45', GOLD = '#e0bb4a', HAIR = '#b9b4ab';
    // coat, waistcoat, shirt
    b.add(soft(.58, .74, .32, .07), SUIT, 0, 1.02, 0); b.add(soft(.62, .16, .34, .07), SUIT, 0, 1.3, 0); b.add(soft(.46, .3, .3, .07), SUIT, -.0, .78, -.01);
    b.box(0, .72, .165, .4, .1, .02, DARK); b.box(0, .94, .166, .24, .42, .02, '#6a1f24'); b.box(0, 1.14, .168, .14, .2, .02, '#f4f1e8');
    for (const q of [-1, 1]) { b.box(q * .15, 1.08, .172, .1, .28, .02, LAP); b.box(q * .2, 1.24, .172, .13, .08, .02, LAP); b.box(q * .09, 1.3, .18, .09, .06, .03, '#ffffff'); }
    for (let i = 0; i < 3; i++) b.box(0, .98 + i * -.08 + .02, .178, .035, .035, .02, GOLD);
    b.box(0, 1.26, .19, .15, .06, .03, R); b.box(-.09, 1.25, .19, .07, .08, .03, '#a02822'); b.box(.09, 1.25, .19, .07, .08, .03, '#a02822'); // bow tie
    for (let i = 0; i < 7; i++) b.box(-.27 + i * .09, 1.26 - i * .085, .178, .12, .1, .022, i % 2 ? R : '#b82d25'); // sash
    for (let i = 0; i < 9; i++) { const a = -1.15 + i * .29; b.add(new THREE.SphereGeometry(.024, 5, 4), GOLD, Math.sin(a) * .2, 1.32 - Math.cos(a) * .15 + .02, .2); } b.add(new THREE.CylinderGeometry(.07, .07, .025, 12).rotateX(Math.PI / 2), GOLD, 0, 1.05, .21); b.add(new THREE.CylinderGeometry(.04, .04, .03, 10).rotateX(Math.PI / 2), R, 0, 1.05, .22); // chain of office
    b.box(.2, 1.17, .172, .09, .05, .02, '#f4f1e8'); b.box(-.17, .86, .172, .13, .025, .02, '#2f3a58');
    // head
    b.box(0, 1.36, 0, .17, .1, .17, '#d9ac88'); b.add(soft(.36, .38, .34, .1), SKIN, 0, 1.63, 0); for (const q of [-1, 1]) { b.add(soft(.06, .11, .07, .025), '#dfae8b', q * .19, 1.63, 0); b.box(q * .17, 1.54, .02, .04, .18, .14, HAIR); b.box(q * .09, 1.65, .165, .085, .05, .02, '#ffffff'); b.box(q * .09, 1.645, .176, .04, .045, .02, '#23303a'); b.box(q * .09, 1.71, .172, .1, .025, .03, HAIR); b.box(q * .1, 1.555, .185, .13, .045, .03, HAIR); b.box(q * .17, 1.565, .185, .05, .04, .03, HAIR); }
    b.add(soft(.075, .09, .07, .025), '#dba07c', 0, 1.6, .185); b.box(0, 1.5, .172, .1, .02, .02, '#9b5a4c');
    // top hat with a band, a gold buckle and a curled brim
    const hat = '#121318'; b.add(new THREE.CylinderGeometry(.34, .34, .035, 24), hat, 0, 1.84, 0); b.add(new THREE.CylinderGeometry(.225, .205, .46, 24), hat, 0, 2.08, 0); b.add(new THREE.CylinderGeometry(.215, .212, .11, 24), R, 0, 1.93, 0); b.box(0, 1.88, .208, .09, .09, .02, GOLD); b.box(0, 1.9, .214, .045, .05, .02, R); b.add(new THREE.CylinderGeometry(.228, .228, .02, 24), '#22252b', 0, 2.31, 0);
    const body = b.mesh(mat); body.castShadow = true; r.add(body);
    const legs = [-1, 1].map(q => limb(g => { g.add(soft(.22, .78, .25, .06), DARK, 0, -.37, 0); g.box(0, -.4, .125, .02, .66, .01, '#2a3148'); g.add(soft(.23, .1, .35, .04), '#141414', 0, -.8, .05); g.box(0, -.76, .14, .19, .05, .1, '#30323a'); g.box(0, -.85, .05, .25, .02, .37, '#3a2a1c'); }, q * .15, .84, 0)), arms = [-1, 1].map(q => limb(g => { g.add(soft(.16, .66, .18, .06), SUIT, 0, -.3, 0); g.box(0, -.57, 0, .17, .06, .19, '#d6b13c'); g.box(0, -.63, 0, .15, .04, .17, '#f4f1e8'); g.add(soft(.13, .15, .15, .05), '#f4f1e8', 0, -.74, 0); if (q > 0) { g.add(new THREE.CylinderGeometry(.018, .018, .9, 8), '#2a1b12', 0, -1.06, .07); g.add(new THREE.SphereGeometry(.05, 8, 6), GOLD, 0, -.6, .07); } }, q * .38, 1.36, 0)); r.add(...legs, ...arms); r.scale.setScalar(1.04); r.userData = { legs, arms, body }; return r; };
  { const c = people[0], fig = buildMan(); c.root.clear(); c.root.add(fig); c.root.position.y = Math.max(0, height(c.x, c.z)) + .11; }
  const open = () => { if (show || room.on || drive.on) return; carGrid(); if (!man) man = buildMan(); const h = houses[0], cands = [[h.x - 1.1, h.z + 8.2 * h.flip], [h.x - 1.1, h.z + 10 * h.flip], [h.x + 4, h.z + 11 * h.flip]], ok = cands.find(c => !carHit(c[0], c[1], 1, 0, .4, .4)) || cands[2]; s.x = ok[0]; s.z = ok[1]; s.y = .1; s.th = h.flip > 0 ? 0 : Math.PI; s.cy = s.th; s.cp = .2; s.dist = s.cur = 5.2; s.v = 0; s.keys = {}; s.jx = s.jy = 0; s.jr = false;
    if (selected) clearSel(); closeSheet(); scene.add(man); people[0].root.visible = false; people[0].pin.hidden = true; document.body.classList.add('strolling'); $('mayorUI').hidden = false; marker.visible = false; s.on = true; camera.fov = 56; camera.updateProjectionMatrix(); updateDetail(); updateDetail(); };
  const leave = () => { if (!s.on) return; s.on = false; scene.remove(man); people[0].root.visible = true; document.body.classList.remove('strolling'); $('mayorUI').hidden = true; camera.fov = 42; camera.updateProjectionMatrix(); Object.assign(goal, { x: s.x, z: s.z, d: 70, pitch: .5, yaw: s.cy + Math.PI, lift: .075 }); Object.assign(view, goal); updateDetail(); };
  window.stepStrollImpl = (dt, now) => { const k = s.keys; let ix = (k.right ? 1 : 0) - (k.left ? 1 : 0) + s.jx, iy = (k.up ? 1 : 0) - (k.down ? 1 : 0) - s.jy; const len = Math.hypot(ix, iy); if (len > 1) { ix /= len; iy /= len; } const go = Math.min(1, len), run = k.run || s.jr, fx = Math.sin(s.cy), fz = Math.cos(s.cy), rx = -fz, rz = fx, mx = fx * iy + rx * ix, mz = fz * iy + rz * ix;
    s.v += ((go > .05 ? (run ? 9 : 4.6) * go : 0) - s.v) * (1 - Math.exp(-dt * 9)); if (go > .05) { const t = Math.atan2(mx, mz); let d = t - s.th; d = Math.atan2(Math.sin(d), Math.cos(d)); s.th += d * (1 - Math.exp(-dt * 12)); s.cy -= ix * dt * .9; }
    if (go > .05) { const m = Math.hypot(mx, mz) || 1, nx = s.x + mx / m * s.v * dt, nz = s.z + mz / m * s.v * dt, hit = (x, z) => carHit(x, z, 1, 0, .38, .38); if (!hit(nx, nz)) { s.x = nx; s.z = nz; } else if (!hit(nx, s.z)) s.x = nx; else if (!hit(s.x, nz)) s.z = nz; }
    const dy = deckY(s.x, s.z), y = dy + (dy > 0 ? .22 : 0) + .11; s.y += (y - s.y) * (1 - Math.exp(-dt * 14)); s.swing += s.v * dt * 1.7; const a = Math.sin(s.swing) * Math.min(.95, s.v * .13), u = man.userData; u.legs[0].rotation.x = a; u.legs[1].rotation.x = -a; u.arms[0].rotation.x = -a * .9; u.arms[1].rotation.x = a * .9; man.position.set(s.x, s.y + Math.abs(Math.cos(s.swing)) * Math.min(.07, s.v * .012), s.z); man.rotation.y = s.th;
    view.x = goal.x = s.x; view.z = goal.z = s.z; view.d = goal.d = 44; view.lift = goal.lift = .075; };
  window.strollCamImpl = () => { const cp = Math.cos(s.cp), sp = Math.sin(s.cp), fx = Math.sin(s.cy), fz = Math.cos(s.cy); let want = s.dist; for (let q = 1; q <= s.dist; q += .5) if (carBlocked(s.x - fx * cp * q, s.z - fz * cp * q)) { want = Math.max(1.8, q - .8); break; } s.cur += (want - s.cur) * (want < s.cur ? .35 : .08); camera.position.set(s.x - fx * cp * s.cur, s.y + 1.4 + sp * s.cur, s.z - fz * cp * s.cur); camera.lookAt(s.x, s.y + 1.45, s.z); };
  const map = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ShiftLeft: 'run', ShiftRight: 'run' }, on = v => e => { if (!s.on) return; if (e.code === 'Escape') return leave(); const a = map[e.code]; if (a) { s.keys[a] = v; e.preventDefault(); } }; addEventListener('keydown', on(true)); addEventListener('keyup', on(false)); addEventListener('blur', () => { s.keys = {}; });
  canvas.addEventListener('pointermove', e => { if (!s.on || !s.drag) return; const dx = e.clientX - s.drag.x, dy = e.clientY - s.drag.y; s.drag.x = e.clientX; s.drag.y = e.clientY; s.drag.moved += Math.abs(dx) + Math.abs(dy); s.cy -= dx * .0055; s.cp = clamp(s.cp + dy * .0035, .02, 1.1); });
  canvas.addEventListener('pointerup', e => { if (s.on && s.drag) { if (s.drag.moved < 8) tapPerson(e.clientX, e.clientY); s.drag = null; } });
  { const pad = $('mJoy'), nub = $('mNub'); let id = null; const mv = e => { const b = pad.getBoundingClientRect(), Rr = b.width / 2, x = clamp((e.clientX - b.left - Rr) / Rr, -1, 1), y = clamp((e.clientY - b.top - Rr) / Rr, -1, 1); s.jx = x; s.jy = y; nub.style.transform = `translate(${x * Rr * .55}px,${y * Rr * .55}px)`; }; pad.addEventListener('pointerdown', e => { id = e.pointerId; pad.setPointerCapture(id); mv(e); }); pad.addEventListener('pointermove', e => { if (e.pointerId === id) mv(e); }); const end = () => { id = null; s.jx = s.jy = 0; nub.style.transform = ''; }; pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    const r = $('mRun'), set = v => e => { e.preventDefault(); s.jr = v; r.classList.toggle('held', v); }; r.addEventListener('pointerdown', e => { r.setPointerCapture(e.pointerId); set(true)(e); }); for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) r.addEventListener(n, set(false)); r.addEventListener('contextmenu', e => e.preventDefault()); }
  $('mLeave').onclick = leave; $('bMayor').onclick = open; if (new URLSearchParams(location.search).has('mayor')) $('bMayor').hidden = false;
}
function stepStroll(dt, now) { window.stepStrollImpl(dt, now); }
function strollCam() { window.strollCamImpl(); }
window.__valley = { stroll, hillSign, people, personSheet, peopleSheet, front, frontGo, drive, startDrive, stopDrive, carBlocked, carHit, carOff, BASE, baseG, baseGuns, goal, scene, camera, renderer, chunks, walk, shootCity, houses, playBuild, mallSet: n => { live.mall = n; buildMall(mallStage(n)); drawBoard(); }, heli, fleet, boats, boatSpan, riverZ, room, enterHouse, leaveHouse, record: { hide: hideInTown, pause: () => { paused = true; }, size: (w, h) => { renderer.setPixelRatio(1); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }, step: now => drawFrame(now), detail: () => updateDetail(), canvas, board, marker }, playBuild, get show() { return show; }, camera, height, placeCamera, VALLEY, setWx: m => { wxMode = m; applyTime(hourNow()); }, houses, usedDesigns, plots, selectPlot, cars, view, goal, select, clearSel, townR, setTime: t => { manual = t; applyTime(hourNow()); }, renderer };
requestAnimationFrame(loop);
requestAnimationFrame(() => requestAnimationFrame(() => { if (window.bootDone) window.bootDone(); })); // the first real frame is on screen: the loading sign can go
};
{
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 3500);
  let fresh = false; try { fresh = !!localStorage.getItem('fresh'); localStorage.removeItem('fresh'); } catch {}
  const apiBase = ((window.TOWN && window.TOWN.apiUrl) || (typeof localStorage !== 'undefined' && localStorage.getItem('DC_API_URL')) || '').replace(/\/+$/, '');
  const stateUrl = (apiBase ? `${apiBase}/api/state` : '/api/state') + '?t=' + Date.now();
  const residentsUrl = (apiBase ? `${apiBase}/api/residents` : '/api/residents') + '?t=' + Date.now();
  const settingsUrl = (apiBase ? `${apiBase}/api/settings` : '/api/settings') + '?t=' + Date.now();

  const pState = fetch(stateUrl, { signal: stop.signal, cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      if (j) {
        window.TOWN.state = j;
        if (j.settings) {
          window.TOWN.settings = j.settings;
          try { localStorage.setItem('DC_SETTINGS', JSON.stringify(j.settings)); } catch {}
        }
      }
    })
    .catch(() => {});

  const pResidents = fetch(residentsUrl, { signal: stop.signal, cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      const list = Array.isArray(j) ? j : (j && Array.isArray(j.residents) ? j.residents : null);
      if (list && list.length > 0) {
        window.TOWN.residents = list;
        try { localStorage.setItem('DC_LOCAL_RESIDENTS', JSON.stringify(list)); } catch {}
      }
    })
    .catch(() => {});

  const pSettings = fetch(settingsUrl, { signal: stop.signal, cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      if (j) {
        window.TOWN.settings = j;
        try { localStorage.setItem('DC_SETTINGS', JSON.stringify(j)); } catch {}
      }
    })
    .catch(() => {});

  Promise.all([pState, pResidents, pSettings]).finally(() => { clearTimeout(timer); dreamCity(); });
}
