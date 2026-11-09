// Cloud City cars: an SUV, a sports car and an everyday hatchback.
// Each body is ONE lofted skin. Glass, seams, lamps and trim are all projected onto that same skin, so nothing looks stuck on.
// x forward, y up, z to the driver's side (right-hand drive), metres.
(function () {
  const T = THREE, lerp = (a, b, s) => a + (b - a) * s, clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  function curve(pts) { // monotone cubic, so profiles never overshoot
    const n = pts.length, x = pts.map(p => p[0]), y = pts.map(p => p[1]), d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
    m[0] = d[0]; m[n - 1] = d[n - 2]; for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]);
    return v => { if (v <= x[0]) return y[0]; if (v >= x[n - 1]) return y[n - 1]; let i = 0; while (v > x[i + 1]) i++; const h = x[i + 1] - x[i], s = (v - x[i]) / h, s2 = s * s, s3 = s2 * s; return (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h * m[i + 1]; };
  }
  let LITE = false; const ball = (r, a, b) => new T.SphereGeometry(r, LITE ? Math.min(a, 10) : a, LITE ? Math.min(b, 7) : b);
  const TB = .612, TT = .835, TS = .875;
  const TVF = (() => { const a = [0, .1, .2]; for (let i = 1; i <= 6; i++) a.push(.2 + .1 * i / 6); for (let i = 1; i <= 18; i++) a.push(.3 + .3 * i / 18); a.push(TB); for (let i = 1; i <= 8; i++) a.push(TB + (TT - TB) * i / 8); a.push(.85, TS); for (let i = 1; i <= 14; i++) a.push(TS + (1 - TS) * i / 14); return a; })();
  const TVL = (() => { const a = [0, .2]; for (let i = 1; i <= 3; i++) a.push(.2 + .1 * i / 3); for (let i = 1; i <= 8; i++) a.push(.3 + .3 * i / 8); a.push(TB); for (let i = 1; i <= 4; i++) a.push(TB + (TT - TB) * i / 4); a.push(.85, TS); for (let i = 1; i <= 7; i++) a.push(TS + (1 - TS) * i / 7); return a; })();

  class Skin {
    constructor(s) {
      this.s = s; for (const k of ['top', 'belt', 'floor', 'w', 'wr']) this[k] = curve(s[k]);
      this.crown = curve(s.crown || [[-9, .05], [9, .05]]); this.tuck = s.tuck ?? .05; this.crease = s.crease ?? .012; this.creaseAt = s.creaseAt ?? .74;
    }
    S(x, t, sign = 1) {
      const s = this.s, d = Math.min(s.front - x, x - s.rear), b = s.b, q = clamp(1 - d / b), ep = s.ep || 2.6, E = d >= b ? 1 : Math.pow(Math.max(0, 1 - Math.pow(q, ep)), 1 / ep), mid = s.mid;
      let fl = this.floor(x); for (const a of s.arches) { const dx = Math.abs(x - a.x); if (dx <= a.r) fl = Math.max(fl, s.axle + Math.sqrt(a.r * a.r - dx * dx)); }
      const sq = v => mid + (v - mid) * E, top = sq(this.top(x)), edge = sq(this.top(x) - this.crown(x)), belt = Math.min(sq(this.belt(x)), edge), bot = sq(fl), w = this.w(x) * E, wr = Math.min(this.wr(x) * E, w), lowY = bot + .06 * E;
      let y, z;
      if (t <= .2) { z = w * .9 * t / .2; y = bot; }
      else if (t <= .3) { const a = (t - .2) / .1 * Math.PI / 2, wl = w * (1 - this.tuck); z = lerp(w * .9, wl, Math.sin(a)); y = lerp(bot, lowY, 1 - Math.cos(a)); }
      else if (t <= .6) { const u = (t - .3) / .3, c = (u - this.creaseAt) / .07; z = w * (1 - this.tuck * (1 - u) * (1 - u)) * (1 - .012 * Math.pow(Math.max(0, u - .8) / .2, 2)) + this.crease * E * Math.exp(-c * c); y = lerp(lowY, belt, u); }
      else if (t <= TS - .025 + 0) { const u = (t - .6) / .25; z = lerp(w * .988, wr, Math.pow(u, .85)); y = lerp(belt, edge, u); }
      else { const u = (t - .85) / .15, a = u * Math.PI / 2, ca = Math.max(0, Math.cos(a)), sa = Math.max(0, Math.sin(a)); z = wr * Math.pow(ca, .62); y = lerp(edge, top, Math.pow(sa, .62)); }
      return [x, y, z * sign];
    }
    N(x, t, sign = 1) {
      const e = .004, a = this.S(x + e, t, sign), b = this.S(x - e, t, sign), c = this.S(x, Math.min(1, t + e), sign), d = this.S(x, Math.max(0, t - e), sign);
      const ux = a[0] - b[0], uy = a[1] - b[1], uz = a[2] - b[2], vx = c[0] - d[0], vy = c[1] - d[1], vz = c[2] - d[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const p = this.S(x, t, sign); if (ny * (p[1] - this.s.mid) + nz * p[2] < 0) { nx = -nx; ny = -ny; nz = -nz; } return [nx, ny, nz];
    }
    P(x, t, sign, off = 0) { const p = this.S(x, t, sign); if (!off) return p; const n = this.N(x, t, sign); return [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off]; }
    tOf(x, y) { let a = .3, b = .6; for (let i = 0; i < 16; i++) { const m = (a + b) / 2; if (this.S(x, m)[1] < y) a = m; else b = m; } return (a + b) / 2; } // side view → skin
    zAt(x, y) { let best = -1, prev = this.S(x, .2); for (let i = 1; i <= 44; i++) { const c = this.S(x, .2 + .8 * i / 44); if ((prev[1] - y) * (c[1] - y) <= 0 && c[1] !== prev[1]) best = Math.max(best, lerp(prev[2], c[2], (y - prev[1]) / (c[1] - prev[1]))); prev = c; } return best; }
    faceX(end, y, z) { // nose or tail seen straight on → skin
      const e0 = end > 0 ? this.s.front : this.s.rear; let a = e0 - end * .42, b = e0; z = Math.abs(z); if (this.zAt(a, y) < z) return null;
      for (let i = 0; i < 15; i++) { const m = (a + b) / 2; if (this.zAt(m, y) >= z) a = m; else b = m; } return (a + b) / 2;
    }
  }

  // ---- geometry helpers
  function grid(rows, mat, { wrap = false, name, shadow = true } = {}) {
    const nu = rows.length, nv = rows[0].length, pos = [], uv = [], idx = [], id = rows.map(r => r.map(() => -1));
    rows.forEach((r, i) => r.forEach((p, j) => { if (p) { id[i][j] = pos.length / 3; pos.push(p[0], p[1], p[2]); uv.push(i / (nu - 1), j / (nv - 1)); } }));
    for (let i = 0; i < nu - 1; i++) for (let j = 0; j < (wrap ? nv : nv - 1); j++) {
      const j1 = (j + 1) % nv, a = id[i][j], b = id[i + 1][j], c = id[i + 1][j1], d = id[i][j1]; if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      if (rows.skip && rows.skip(i, j)) continue; idx.push(a, b, c, a, c, d);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return mesh(g, mat, shadow);
  }
  const mesh = (g, m, shadow = true) => { const o = new T.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = shadow; return o; };
  function merge(list) {
    const parts = list.map(g => g.index ? g.toNonIndexed() : g), n = parts.reduce((s, g) => s + g.attributes.position.count, 0), p = new Float32Array(n * 3), m = new Float32Array(n * 3), u = new Float32Array(n * 2); let o = 0;
    for (const g of parts) { p.set(g.attributes.position.array, o * 3); m.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) u.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('normal', new T.BufferAttribute(m, 3)); g.setAttribute('uv', new T.BufferAttribute(u, 2)); return g;
  }
  function rbox(w, h, d, r = .03, seg = 5) { // soft-cornered box
    if (LITE) seg = 2;
    const g = new T.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new T.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const c = new T.Vector3(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz)); v.sub(c).normalize().multiplyScalar(r).add(c); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g;
  }
  const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { const c = g.clone(); c.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(1, 1, 1))); return c; };
  function tube(pts, r, mat, seg = 40) { const c = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(...p))); return mesh(new T.TubeGeometry(c, seg, r, 10), mat); }

  // ---- materials
  function plateTex(text, rear) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 112; const x = c.getContext('2d');
    x.fillStyle = rear ? '#f6c91e' : '#f4f3ee'; x.fillRect(0, 0, 512, 112); x.strokeStyle = '#1b1b1b'; x.lineWidth = 5; x.strokeRect(5, 5, 502, 102);
    x.fillStyle = '#161616'; x.font = '900 78px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 60);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function mats(paint, trim, seat) {
    const P = o => { if (!LITE) return new T.MeshPhysicalMaterial(o); const { clearcoat, clearcoatRoughness, ...r } = o; return new T.MeshStandardMaterial(r); }, S = o => new T.MeshStandardMaterial(o);
    return {
      paint: P({ color: paint, metalness: LITE ? .35 : .55, roughness: LITE ? .26 : .38, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.25, side: T.FrontSide, shadowSide: T.BackSide }),
      gloss: P({ color: '#07080a', metalness: .2, roughness: .3, clearcoat: 1, clearcoatRoughness: .06 }),
      matte: S({ color: '#1b1d20', roughness: .72, metalness: 0, side: T.DoubleSide }), mesh: S({ color: '#090a0b', roughness: .6 }),
      trim: S({ color: trim, metalness: 1, roughness: .2 }), chrome: S({ color: '#f1f3f5', metalness: 1, roughness: .08, envMapIntensity: 1.5 }), steel: S({ color: '#aeb3b8', metalness: 1, roughness: .34 }),
      glass: P({ color: '#22303a', metalness: 0, roughness: .03, transparent: true, opacity: .2, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.6, depthWrite: false, side: T.DoubleSide }),
      lens: P({ color: '#ffffff', metalness: 0, roughness: .02, transparent: true, opacity: .16, clearcoat: 1, envMapIntensity: 2, depthWrite: false, side: T.DoubleSide }),
      house: S({ color: '#191c20', metalness: .8, roughness: .3 }), reflector: S({ color: '#dfe3e7', metalness: 1, roughness: .16 }),
      led: new T.MeshStandardMaterial({ color: '#ffffff', emissive: '#f4fbff', emissiveIntensity: 2.4 }), amber: S({ color: '#e88a10', emissive: '#a24a00', emissiveIntensity: .8, roughness: .25 }),
      tail: P({ color: '#a90814', emissive: '#7a0208', emissiveIntensity: .9, roughness: .12, clearcoat: 1 }), tailOn: new T.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff1414', emissiveIntensity: 2.4 }),
      liner: S({ color: '#17181b', roughness: .92, side: T.DoubleSide }), wellDark: S({ color: '#050506', roughness: 1, side: T.DoubleSide }),
      seat: S({ color: seat, roughness: .62, emissive: seat, emissiveIntensity: .22 }), stitch: S({ color: '#c9c3b8', roughness: .7 }), dash: S({ color: '#1c1e22', roughness: .7 }), screen: new T.MeshStandardMaterial({ color: '#0c1a26', emissive: '#2f8fd8', emissiveIntensity: .8 }),
      rubber: S({ color: '#141516', roughness: .9 }),
    };
  }

  // ---- wheels
  function tyreGeo(R, Rr, W, block) {
    if (LITE) { const hw = W / 2, pr = [[Rr, hw * .92], [R - .05, hw * 1.02], [R - .012, hw * .9], [R, hw * .4], [R - .008, hw * .34], [R, hw * .28], [R, -hw * .28], [R - .008, -hw * .34], [R, -hw * .4], [R - .012, -hw * .9], [R - .05, -hw * 1.02], [Rr, -hw * .92]].reverse(), g = new T.LatheGeometry(pr.map(p => new T.Vector2(p[0], p[1])), 44); g.rotateX(Math.PI / 2); return g; }
    const pr = [], hw = W / 2; const side = n => { for (let i = 0; i <= n; i++) { const s = i / n, r = lerp(Rr - .004, R - .03, s); pr.push([r, hw * (.92 + .1 * Math.sin(s * Math.PI))]); } };
    side(8); const N = 16; for (let i = 0; i <= N; i++) { const a = i / N, x = hw * (.94 - 1.88 * a), edge = Math.pow(Math.abs(a * 2 - 1), 5); pr.push([R - .03 * edge, x]); }
    for (let i = 8; i >= 0; i--) { const s = i / 8; pr.push([lerp(Rr - .004, R - .03, s), -hw * (.92 + .1 * Math.sin(s * Math.PI))]); }
    const g = new T.LatheGeometry(pr.reverse().map(p => new T.Vector2(p[0], p[1])), 216), p = g.attributes.position; const groove = block ? .012 : .007, pitch = block ? 30 : 52;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z); if (r < R - .032) continue;
      const a = Math.atan2(z, x) / (Math.PI * 2) + .5, ax = y / hw, circ = Math.abs(Math.abs(ax) - .34) < (block ? .08 : .05) || Math.abs(ax) < .03;
      const sk = (a * pitch + Math.abs(ax) * (block ? 1.1 : 2.2) + (ax > 0 ? .5 : 0)) % 1, lat = sk < (block ? .24 : .16) && Math.abs(ax) > .05;
      if (circ || lat) { const k = (r - groove) / r; p.setX(i, x * k); p.setZ(i, z * k); }
    }
    g.rotateX(Math.PI / 2); g.computeVertexNormals(); return g;
  }
  function spokeGeo(r0, r1, w0, w1, thick) {
    const s = new T.Shape(); s.moveTo(r0, -w0 / 2); s.quadraticCurveTo((r0 + r1) / 2, -w1 * .42, r1, -w1 / 2); s.lineTo(r1, w1 / 2); s.quadraticCurveTo((r0 + r1) / 2, w1 * .42, r0, w0 / 2); s.closePath();
    const g = new T.ExtrudeGeometry(s, LITE ? { depth: thick, bevelEnabled: false, curveSegments: 3 } : { depth: thick, bevelEnabled: true, bevelThickness: .006, bevelSize: .005, bevelSegments: 2, curveSegments: 10 }); g.computeVertexNormals(); return g;
  }
  function wheel(o, m) { // the face looks to +z. returns { group, spin }
    const { R, Rr, W, spokes, kind, caliper } = o, group = new T.Group(), spin = new T.Group(); group.add(spin);
    spin.add(mesh(tyreGeo(R, Rr, W, kind === 'suv'), m.rubber));
    const rimMat = o.rim === 'dark' ? new T.MeshStandardMaterial({ color: '#1c1e21', metalness: .9, roughness: .3 }) : o.rim === 'gold' ? new T.MeshStandardMaterial({ color: '#b98d3f', metalness: 1, roughness: .28 }) : new T.MeshStandardMaterial({ color: '#c8ccd1', metalness: 1, roughness: .22, envMapIntensity: 1.3 });
    const hw = W / 2, barrel = new T.LatheGeometry([[Rr * .9, -hw + .02], [Rr + .012, -hw + .008], [Rr + .012, -hw + .03], [Rr - .03, -hw + .05], [Rr - .03, hw - .06], [Rr, hw - .03], [Rr + .014, hw - .012], [Rr + .014, hw + .004], [Rr * .985, hw + .006], [Rr * .95, hw - .018]].map(p => new T.Vector2(p[0], p[1])), LITE ? 32 : 72); barrel.rotateX(Math.PI / 2); barrel.scale(1, 1, -1); barrel.computeVertexNormals();
    { const b = mesh(barrel, rimMat); b.material = rimMat.clone(); b.material.side = T.DoubleSide; spin.add(b); }
    const zf = hw - .05, sp = [], step = Math.PI * 2 / spokes;
    for (let i = 0; i < spokes; i++) {
      const a = i * step; const put = (g, off = 0) => { const c = g.clone(); c.rotateZ(a + off); c.translate(0, 0, zf - .022); const q = c.attributes.position; for (let k = 0; k < q.count; k++) { const r = Math.hypot(q.getX(k), q.getY(k)); q.setZ(k, q.getZ(k) - .03 * Math.pow(clamp((Rr - r) / Rr), 2)); } c.computeVertexNormals(); sp.push(c); };
      if (kind === 'sport') { const g = spokeGeo(Rr * .2, Rr + .004, .022, .016, .016); put(g, -.09); put(g, .09); }
      else if (kind === 'suv') { put(spokeGeo(Rr * .2, Rr + .004, .07, .062, .03)); }
      else { const g = spokeGeo(Rr * .2, Rr + .004, .044, .03, .02); put(g, -.05); put(g, .05); }
    }
    spin.add(mesh(merge(sp), rimMat));
    const hub = new T.CylinderGeometry(Rr * .25, Rr * .29, .05, 36); hub.rotateX(Math.PI / 2); hub.translate(0, 0, zf - .03); spin.add(mesh(hub, rimMat));
    const cap = new T.CylinderGeometry(Rr * .12, Rr * .125, .012, 28); cap.rotateX(Math.PI / 2); cap.translate(0, 0, zf + .002); spin.add(mesh(cap, m.gloss));
    const nuts = []; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, n = new T.CylinderGeometry(.0105, .0125, .018, 6); n.rotateX(Math.PI / 2); n.translate(Math.cos(a) * Rr * .19, Math.sin(a) * Rr * .19, zf + .002); nuts.push(n); } spin.add(mesh(merge(nuts), m.chrome));
    const disc = new T.CylinderGeometry(Rr * .78, Rr * .78, .03, LITE ? 20 : 48); disc.rotateX(Math.PI / 2); disc.translate(0, 0, hw - .15); spin.add(mesh(disc, m.steel));
    const hat = new T.CylinderGeometry(Rr * .34, Rr * .34, .05, 28); hat.rotateX(Math.PI / 2); hat.translate(0, 0, hw - .13); spin.add(mesh(hat, m.house));
    const cal = rbox(.085, Rr * .62, .08, .014); const cm = new T.MeshPhysicalMaterial({ color: caliper, roughness: .35, clearcoat: 1 }), c = mesh(cal, cm); c.position.set(-Rr * .72, 0, hw - .15); group.add(c);
    return { group, spin };
  }

  // ---- specs
  const SPEC = {
    hatch: {
      name: 'Everyday', paint: '#1f5fa6', trim: '#8c9198', seat: '#3a3e45', front: 2.14, rear: -2.02, b: .13, mid: .56, axle: .315,
      top: [[-2.02, 1.0], [-1.97, 1.06], [-1.9, 1.17], [-1.78, 1.34], [-1.58, 1.43], [-1.2, 1.465], [-.5, 1.48], [.1, 1.44], [.55, 1.25], [.98, 1.02], [1.5, .94], [1.95, .83], [2.14, .71]],
      belt: [[-2.02, .97], [-1.6, 1.02], [0, .965], [1, .93], [2.14, .7]], floor: [[-2.02, .48], [-1.8, .31], [-1.2, .22], [1.2, .21], [1.9, .28], [2.14, .44]],
      w: [[-2.02, .8], [-1.85, .87], [-1.3, .895], [0, .9], [1.3, .895], [1.85, .85], [2.14, .72]], wr: [[-2.02, .76], [-1.93, .77], [-1.72, .64], [-1, .655], [0, .67], [.5, .72], [.98, .87], [1.5, .875], [2.14, .7]],
      crown: [[-2.1, .05], [-1.85, .05], [-1.6, .06], [0, .07], [.98, .06], [2.2, .05]], arches: [{ x: 1.33, r: .37 }, { x: -1.3, r: .37 }],
      R: .31, Rr: .215, tyre: .215, spokes: 7, kind: 'hatch', rim: 'silver', caliper: '#555a60', windows: [[.02, .68], [-1.2, -.06]], wind: [.12, 1.0], back: [-1.84, -1.52], doors: [.99, -.02, -.94], handles: [.12, -.8], handleY: .93,
    },
    sport: {
      name: 'Sports', paint: '#c40f25', trim: '#22252a', seat: '#a31320', front: 2.24, rear: -2.2, b: .12, mid: .43, axle: .335,
      top: [[-2.2, .87], [-2.1, .93], [-1.85, .97], [-1.35, 1.07], [-.75, 1.17], [-.25, 1.205], [.1, 1.18], [.55, 1], [.95, .825], [1.5, .73], [2, .62], [2.24, .52]],
      belt: [[-2.2, .85], [-1.4, .91], [-.6, .85], [.3, .79], [1, .75], [2.24, .52]], floor: [[-2.2, .3], [-1.85, .18], [1.85, .155], [2.24, .27]],
      w: [[-2.2, .82], [-1.95, .92], [-1.38, .985], [-.78, .905], [0, .885], [.85, .925], [1.38, .955], [1.85, .9], [2.24, .73]], wr: [[-2.2, .8], [-1.86, .88], [-1.35, .7], [-.6, .57], [0, .61], [.5, .75], [.95, .9], [1.5, .93], [2.24, .71]],
      crown: [[-2.3, .03], [-1.8, .035], [-.3, .05], [.95, .04], [2.3, .03]], arches: [{ x: 1.38, r: .385 }, { x: -1.38, r: .385 }], tuck: .075, crease: .016, creaseAt: .62,
      R: .345, Rr: .258, tyre: .27, spokes: 5, kind: 'sport', rim: 'dark', caliper: '#e8c21c', windows: [[-.66, .64]], wind: [.06, .93], back: [-1.52, -.36], doors: [.92, -.74], handles: [-.52], handleY: .8,
    },
    suv: {
      name: 'SUV', paint: '#2e4a3b', trim: '#30343a', seat: '#a9805a', front: 2.4, rear: -2.38, b: .09, ep: 4, mid: .74, axle: .41,
      top: [[-2.38, 1.3], [-2.31, 1.46], [-2.2, 1.77], [-2.05, 1.85], [-.6, 1.88], [.4, 1.865], [.75, 1.7], [1.22, 1.34], [1.7, 1.29], [2.2, 1.22], [2.4, 1.07]],
      belt: [[-2.38, 1.2], [-1.5, 1.27], [.5, 1.245], [1.22, 1.22], [2.4, 1.02]], floor: [[-2.38, .64], [-2.1, .44], [-1.2, .31], [1.2, .3], [2.1, .42], [2.4, .62]],
      w: [[-2.38, .92], [-2.2, .955], [-1.42, .975], [0, .96], [1.48, .975], [2.2, .96], [2.4, .92]], wr: [[-2.38, .88], [-2.28, .86], [-2.05, .77], [0, .795], [.5, .81], [1.22, .935], [1.7, .945], [2.4, .9]],
      crown: [[-2.5, .03], [-2, .05], [0, .06], [1.2, .05], [2.5, .03]], arches: [{ x: 1.48, r: .465 }, { x: -1.42, r: .465 }], tuck: .03, crease: .01, creaseAt: .7,
      R: .41, Rr: .24, tyre: .275, spokes: 6, kind: 'suv', rim: 'gold', caliper: '#3b3f44', windows: [[.04, .72], [-.94, -.06], [-2.0, -1.04]], wind: [.5, 1.2], back: null, doors: [1.0, -.02, -.98], handles: [.14, -.84], handleY: 1.2,
    },
  };

  function build(kind, opts = {}) {
    LITE = !!opts.lite; const TV = LITE ? TVL : TVF;
    const s = { ...SPEC[kind], ...opts }, skin = new Skin(s), m = mats(s.paint, s.trim, s.seat), car = new T.Group(); car.name = kind;
    const add = o => (car.add(o), o), both = fn => { fn(1); fn(-1); };
    // the skin: stations are placed exactly on every edge so holes and arches stay clean
    const xs = new Set(); const span = s.front - s.rear; const NX = LITE ? 44 : 110; for (let i = 0; i <= NX; i++) xs.add(+(s.rear + span * (.5 - .5 * Math.cos(Math.PI * i / NX))).toFixed(4));
    
    for (const a of s.arches) { { const NA = LITE ? 16 : 44; for (let i = 0; i <= NA; i++) xs.add(+(a.x + a.r * Math.cos(Math.PI * i / NA)).toFixed(4)); } xs.add(+(a.x + a.r + .0015).toFixed(4)); xs.add(+(a.x - a.r - .0015).toFixed(4)); }
    const holes = []; for (const w of s.windows) { holes.push({ x0: w[0], x1: w[1], t0: TB, t1: TT }); xs.add(w[0]); xs.add(w[1]); } holes.push({ x0: s.wind[0], x1: s.wind[1], t0: TS, t1: 1 }); xs.add(s.wind[0]); xs.add(s.wind[1]); if (s.back) { holes.push({ x0: s.back[0], x1: s.back[1], t0: TS, t1: 1 }); xs.add(s.back[0]); xs.add(s.back[1]); }
    const X = [...xs].sort((a, b) => a - b), ring = [...TV.map(t => [t, 1]), ...TV.slice(1, -1).reverse().map(t => [t, -1])];
    const rows = X.map(x => ring.map(([t, g]) => skin.S(x, t, g)));
    rows.skip = (i, j) => { const x = (X[i] + X[i + 1]) / 2, t = (ring[j][0] + ring[(j + 1) % ring.length][0]) / 2; return holes.some(h => x > h.x0 && x < h.x1 && t > h.t0 && t < h.t1); };
    const body = add(grid(rows, m.paint, { wrap: true })); fixOut(body.geometry, s.mid); body.name = 'paint'; body.receiveShadow = false;
    { // true surface normals: reflections run clean instead of rippling across uneven stations
      const n = body.geometry.attributes.normal; let k = 0; const skipEnd = i => i === 0 || i === X.length - 1;
      X.forEach((x, i) => ring.forEach(([t, g]) => { if (!skipEnd(i)) { const q = skin.N(x, Math.min(.9995, Math.max(.0005, t)), g); if (isFinite(q[0] + q[1] + q[2])) n.setXYZ(k, q[0], q[1], q[2]); } k++; }));
    }

    // anything laid on the skin
    const patch = (x0, x1, t0, t1, off, mat, { nu = 40, nv = 10, signs = [1, -1], shadow = false } = {}) => { if (LITE) { nu = Math.max(2, Math.ceil(nu * .35)); nv = Math.max(1, Math.ceil(nv * .45)); } for (const g of signs) { const r = []; for (let i = 0; i <= nu; i++) { const x = lerp(x0, x1, i / nu), a = typeof t0 === 'function' ? t0(x) : t0, b = typeof t1 === 'function' ? t1(x) : t1, c = []; for (let j = 0; j <= nv; j++) c.push(skin.P(x, lerp(a, b, j / nv), g, off)); r.push(c); } const o = add(grid(r, mat, { shadow })); fixOut(o.geometry, s.mid); } };
    const strip = (pts, wd, off, mat, signs = [1, -1]) => { // a line drawn on the skin, pts are [x, t]
      for (const g of signs) {
        const dense = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], n = Math.max(2, Math.ceil(Math.hypot(a[0] - b[0], (a[1] - b[1]) * 3) / (LITE ? .1 : .025))); for (let k = 0; k < n; k++) dense.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]); } dense.push(pts[pts.length - 1]);
        const P = dense.map(p => skin.P(p[0], p[1], g, off)), N = dense.map(p => skin.N(p[0], p[1], g)), r = [[], []];
        P.forEach((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], n = N[i]; let sx = d[1] * n[2] - d[2] * n[1], sy = d[2] * n[0] - d[0] * n[2], sz = d[0] * n[1] - d[1] * n[0]; const l = Math.hypot(sx, sy, sz) || 1; sx *= wd / 2 / l; sy *= wd / 2 / l; sz *= wd / 2 / l; r[0].push([p[0] - sx, p[1] - sy, p[2] - sz]); r[1].push([p[0] + sx, p[1] + sy, p[2] + sz]); });
        const o = add(grid(r, mat, { shadow: false })); o.material = mat; fixOut(o.geometry, s.mid);
      }
    };
    const side = (pts, wd, off, mat) => strip(pts.map(p => [p[0], skin.tOf(p[0], p[1])]), wd, off, mat);
    const sidePatch = (x0, x1, y0, y1, off, mat, nu = 24, nv = 6) => { for (const g of [1, -1]) { const r = []; for (let i = 0; i <= nu; i++) { const x = lerp(x0, x1, i / nu), a = typeof y0 === 'function' ? y0(x) : y0, b = typeof y1 === 'function' ? y1(x) : y1, c = []; for (let j = 0; j <= nv; j++) { c.push(skin.P(x, skin.tOf(x, lerp(a, b, j / nv)), g, off)); } r.push(c); } const o = add(grid(r, mat, { shadow: false })); fixOut(o.geometry, s.mid); } };
    const face = (end, z0, z1, y0, y1, off, mat, { nu = 26, nv = 12, mirror = true, shadow = false } = {}) => { if (LITE) { nu = Math.max(2, Math.ceil(nu * .4)); nv = Math.max(1, Math.ceil(nv * .4)); } for (const g of mirror ? [1, -1] : [1]) { const r = []; for (let i = 0; i <= nu; i++) { const z = lerp(z0, z1, i / nu), a = typeof y0 === 'function' ? y0(z) : y0, b = typeof y1 === 'function' ? y1(z) : y1, c = []; for (let j = 0; j <= nv; j++) { const y = lerp(a, b, j / nv), x = skin.faceX(end, y, z); c.push(x === null ? null : [x + end * off, y, z * g]); } r.push(c); } const o = add(grid(r, mat, { shadow })); fixFace(o.geometry, end); } return; };
    const faceLine = (end, pts, wd, off, mat) => { for (const g of [1, -1]) { const dense = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], n = Math.max(2, Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / .03)); for (let k = 0; k <= n; k++) dense.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]); } const r = [[], []]; dense.forEach((p, i) => { const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nz = -(b[1] - a[1]) / l * wd / 2, ny = (b[0] - a[0]) / l * wd / 2; for (const [k, q] of [[0, 1], [1, -1]]) { const z = p[0] + nz * q, y = p[1] + ny * q, x = skin.faceX(end, y, z); r[k].push(x === null ? null : [x + end * off, y, z * g]); } }); const o = add(grid(r, mat, { shadow: false })); fixFace(o.geometry, end); } };
    const pos = (x, y, g = 1, off = 0) => skin.P(x, skin.tOf(x, y), g, off);

    // cabin liner, so looking through the glass shows a dark cabin instead of the inside of the paint
    { const a = s.wind[1] + .05, b = (s.back ? s.back[0] : s.rear + .3) - .03; const r = [], us = [], ts = []; const NL = LITE ? 20 : 70; for (let i = 0; i <= NL; i++) us.push(lerp(a, b, i / NL)); for (const h of holes) { us.push(h.x0, h.x1); } const ML = LITE ? 10 : 30; for (let j = 0; j <= ML; j++) ts.push(lerp(.33, 1, j / ML)); ts.push(TB, TT, TS); const U = [...new Set(us)].filter(x => x >= b && x <= a || x >= a && x <= b).sort((p, q) => p - q), V = [...new Set(ts)].sort((p, q) => p - q); for (const g of [1, -1]) { const R = U.map(x => V.map(t => skin.P(x, t, g, -.025))); R.skip = (i, j) => { const x = (U[i] + U[i + 1]) / 2, t = (V[j] + V[j + 1]) / 2; return holes.some(h => x > h.x0 && x < h.x1 && t > h.t0 && t < h.t1); }; add(grid(R, m.liner, { shadow: false })); } }
    // under-tray hides the view through the arches
    { const y0 = Math.max(.12, skin.floor(0)), hw = skin.w(0) - .34, l = s.front - s.rear - .5, g = new T.BoxGeometry(l, .32, hw * 2); g.translate((s.front + s.rear) / 2, y0 + .18, 0); add(mesh(g, m.mesh)); }
    for (const a of s.arches) both(g => { const w = skin.w(a.x), c = new T.CylinderGeometry(a.r + .008, a.r + .008, .32, 44, 1, true, Math.PI / 2, Math.PI); c.rotateX(Math.PI / 2); c.rotateZ(0); c.translate(a.x, s.axle, g * (w - .22)); add(mesh(c, m.wellDark, false)); const d = new T.CircleGeometry(a.r + .01, 44, 0, Math.PI); d.translate(a.x, s.axle, g * (w - .38)); add(mesh(d, m.wellDark, false)); });

    // glass
    const frame = .011;
    for (const w of s.windows) { patch(w[0], w[1], TB, TT, .0035, m.glass, { nu: 30, nv: 12 }); patch(w[0] - .012, w[0] + frame, TB - .006, TT + .006, .006, m.matte, { nu: 3, nv: 16 }); patch(w[1] - frame, w[1] + .012, TB - .006, TT + .006, .006, m.matte, { nu: 3, nv: 16 }); patch(w[0] - .012, w[1] + .012, TB - .007, TB + .008, .007, s.kind === 'hatch' ? m.chrome : m.matte, { nu: 40, nv: 2 }); patch(w[0] - .012, w[1] + .012, TT - .009, TT + .007, .007, m.matte, { nu: 40, nv: 2 }); }
    patch(s.wind[0], s.wind[1], TS, 1, .003, m.glass, { nu: 30, nv: 22 }); patch(s.wind[0] - .03, s.wind[1] + .03, TS - .004, TS + .018, .006, m.gloss, { nu: 34, nv: 3 }); patch(s.wind[1] - .035, s.wind[1] + .012, TS, 1, .006, m.gloss, { nu: 3, nv: 20 }); patch(s.wind[0] - .012, s.wind[0] + .05, TS, 1, .006, m.gloss, { nu: 3, nv: 20 });
    if (s.back) { patch(s.back[0], s.back[1], TS, 1, .003, m.glass, { nu: 24, nv: 22 }); patch(s.back[0] - .03, s.back[1] + .03, TS - .004, TS + .018, .006, m.gloss, { nu: 26, nv: 3 }); patch(s.back[1] - .05, s.back[1] + .012, TS, 1, .006, m.gloss, { nu: 3, nv: 20 }); patch(s.back[0] - .012, s.back[0] + .05, TS, 1, .006, m.gloss, { nu: 3, nv: 20 }); for (let i = 0; i < 7; i++) { const x = lerp(s.back[0] + .08, s.back[1] - .08, i / 6); strip([[x, TS + .02], [x, 1]], .0035, .0048, m.gloss, [1, -1]); } }
    // scuttle panel and wipers
    patch(s.wind[1] + .012, s.wind[1] + .13, TS - .01, 1, .004, m.matte, { nu: 4, nv: 20 });
    { const x = s.wind[1] + .03, a = skin.S(x, .88, 1), mk = (zc, l) => { const y = skin.S(x, .97)[1] + .04; add(tube([[x + .02, y, zc + l * .1], [x - .035, y + .05, zc - l * .4], [x - .03, y + .1, zc - l * .9]], .008, m.matte, 12)); }; mk(a[2] * .42, a[2] * .72); mk(-a[2] * .12, a[2] * .72); }

    // door and panel shut lines
    const seam = .0075, sillY = x => skin.S(x, .3)[1] + .045, beltY = x => skin.S(x, .6)[1];
    const dr = s.doors, armF = s.arches[0], armR = s.arches[1];
    const shut = (x, y0, y1, xTop = x) => side([[x, y0], [lerp(x, xTop, .5), lerp(y0, y1, .5)], [xTop, y1]], seam, .0015, m.mesh);
    shut(dr[0], sillY(dr[0]) + .01, beltY(dr[0]) - .005, dr[0] - .02);
    for (let i = 1; i < dr.length - 1 + 1 && i < dr.length; i++) { if (i < dr.length - 1) shut(dr[i], sillY(dr[i]) + .01, beltY(dr[i]) - .005); }
    { const lx = dr[dr.length - 1], ay = s.axle + .02, r = armR.r + .05; const pts = [[lx - .0, beltY(lx) - .005]]; const a0 = Math.acos(clamp((lx - armR.x) / r, -1, 1));
      if (dr.length === 3) { pts.push([lx, s.axle + Math.sin(a0) * r + .02]); for (let i = 1; i <= 8; i++) { const a = lerp(a0, .22, i / 8); pts.push([armR.x + Math.cos(a) * r, s.axle + Math.sin(a) * r]); } pts.push([armR.x + r + .02, sillY(armR.x + r + .02) + .02]); } else pts.push([lx, sillY(lx) + .01]);
      side(pts, seam, .0015, m.mesh); }
    side([[dr[0], sillY(dr[0]) + .012], [dr[dr.length - 1] - (dr.length === 3 ? 0 : 0) + (dr.length === 3 ? armR.r * .35 : 0), sillY(dr[dr.length - 1]) + .012]], seam, .0015, m.mesh);
    // bonnet
    { const cx = s.wind[1] + .14, nx = s.front - .24; strip([[cx, 1], [cx, .885], [lerp(cx, nx, .25), .878], [lerp(cx, nx, .75), .872], [nx, .88], [nx + .03, .94], [nx + .035, 1]], seam, .0015, m.mesh); }
    // fuel flap
    { const c = [dr[dr.length - 1] - .42, beltY(-1.6) - .16], pts = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; pts.push([c[0] + Math.cos(a) * .07, c[1] + Math.sin(a) * .07]); } for (const g of [1]) { const q = pts.map(p => [p[0], skin.tOf(p[0], p[1])]); strip(q, .005, .0015, m.mesh, [-1]); } }
    // door handles
    for (const hx of s.handles) both(g => { const c = pos(hx, s.handleY, g, .004), rec = rbox(.2, .05, .012, .005); add(mesh(at(rec, c[0], c[1], c[2]), m.mesh, false)); const c2 = pos(hx, s.handleY, g, .017), h = rbox(.17, .028, .024, .01); add(mesh(at(h, c2[0], c2[1], c2[2]), s.kind === 'hatch' ? m.chrome : m.paint)); });

    // mirrors
    both(g => { const mx = s.windows[0][1] - .02, y = beltY(mx) + .1, b = skin.S(mx, .62, g), o = g * .17, cap = ball(.1, 28, 18); cap.scale(.58, .68, 1.05); const c = mesh(at(cap, mx - .02, y + .03, b[2] + o), m.paint); add(c); const fc = new T.CircleGeometry(.085, 28); fc.scale(.74, .92, 1); const mir = mesh(at(fc, mx - .082, y + .03, b[2] + o, 0, -Math.PI / 2), m.chrome, false); add(mir); add(tube([[mx + .02, y - .05, b[2]], [mx + .02, y - .02, b[2] + o * .5], [mx, y + .01, b[2] + o * .8]], .018, m.matte, 10)); const ind = new T.BoxGeometry(.016, .012, .09); add(mesh(at(ind, mx + .038, y + .05, b[2] + o), m.amber, false)); });

    // lamps, grille and everything else that makes each one itself
    ({ hatch, sport, suv })[s.kind]({ s, m, skin, add, both, patch, strip, side, sidePatch, face, faceLine, pos, mesh, tube, beltY, sillY });
    plates({ s, m, face, skin, add });
    interior({ s, m, skin, add });

    // wheels
    car.userData.wheels = [];
    s.arches.forEach((a, i) => both(g => { const holder = new T.Group(), W = wheel({ R: s.R, Rr: s.Rr, W: s.tyre, spokes: s.spokes, kind: s.kind, rim: s.rim, caliper: s.caliper }, m); const inset = .012; holder.position.set(a.x, s.R, g * (skin.w(a.x) - s.tyre / 2 - inset)); if (g < 0) W.group.rotation.y = Math.PI; if (g > 0) W.group.rotation.x = 0; holder.add(W.group); car.add(holder); car.userData.wheels.push({ holder, spin: W.spin, front: i === 0, sign: g }); }));
    car.userData.spin = dist => { for (const w of car.userData.wheels) w.spin.rotation.z = -w.sign * dist / s.R; };
    car.userData.steer = a => { for (const w of car.userData.wheels) if (w.front) w.holder.rotation.y = a; };
    car.userData.spec = { L: s.front - s.rear, W: skin.w(0) * 2, H: skin.top(0), name: s.name, wb: s.arches[0].x - s.arches[1].x };
    if (LITE) { // one mesh per material: a car in the city must cost a handful of draw calls
      const by = new Map(); for (const o of [...car.children]) if (o.isMesh) { o.updateMatrix(); const q = o.geometry.clone().applyMatrix4(o.matrix); if (!by.has(o.material)) by.set(o.material, []); by.get(o.material).push({ g: q, cast: o.castShadow }); car.remove(o); }
      for (const [mat, list] of by) { const o = new T.Mesh(merge(list.map(i => i.g)), mat); o.castShadow = list.some(i => i.cast) && !mat.transparent; o.receiveShadow = false; car.add(o); }
    }
    return car;
  }
  function fixOut(g, mid) { const p = g.attributes.position, n = g.attributes.normal; let v = 0; for (let i = 0; i < p.count; i += 7) v += (p.getY(i) - mid) * n.getY(i) + p.getZ(i) * n.getZ(i); if (v < 0) flip(g); }
  function fixFace(g, end) { const n = g.attributes.normal; let v = 0; for (let i = 0; i < n.count; i += 3) v += n.getX(i) * end; if (v < 0) flip(g); }
  function flip(g) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.computeVertexNormals(); }

  function plates({ s, m, face, skin, add }) {
    const y = { hatch: [.5, .6], sport: [.3, .39], suv: [.82, .93] }[s.kind], yr = { hatch: [.76, .87], sport: [.56, .66], suv: [.98, 1.09] }[s.kind], W = .26;
    const mk = (end, yy, rear) => { const mat = new T.MeshStandardMaterial({ map: plateTex(rear ? 'CL0U D' : 'CL0U D', rear), roughness: .4 }); const x = skin.faceX(end, (yy[0] + yy[1]) / 2, 0); const g = new T.PlaneGeometry(W * 2, yy[1] - yy[0]); const o = new T.Mesh(g, mat); o.position.set(x + end * .012, (yy[0] + yy[1]) / 2, 0); o.rotation.y = end > 0 ? Math.PI / 2 : -Math.PI / 2; add(o); };
    mk(1, y, false); mk(-1, yr, true);
  }

  function interior({ s, m, skin, add }) {
    const k = { hatch: { fy: .46, fx: -.22, rx: -1.0, z: .4, h: .56, dash: .78, sw: .5 }, sport: { fy: .3, fx: -.3, rx: null, z: .42, h: .46, dash: .4, sw: .42 }, suv: { fy: .72, fx: -.2, rx: -1.15, z: .42, h: .6, dash: .92, sw: .56 } }[s.kind];
    const seat = (x, z) => {
      const parts = [at(rbox(.5, .13, .46, .055), x, k.fy + .1, z, 0, 0, .08), at(rbox(.13, k.h, .46, .055), x - .24, k.fy + .17 + k.h / 2, z, 0, 0, .16), at(rbox(.09, .15, .24, .04), x - .33, k.fy + .22 + k.h + .05, z, 0, 0, .1)];
      for (const q of [-.17, .17]) parts.push(at(rbox(.16, k.h * .85, .09, .04), x - .2, k.fy + .17 + k.h * .46, z + q, 0, 0, .16));
      add(mesh(merge(parts), m.seat, false));
    };
    for (const g of [1, -1]) seat(k.fx, g * k.z);
    if (k.rx !== null) { add(mesh(merge([at(rbox(.5, .15, 1.34, .06), k.rx, k.fy + .1, 0), at(rbox(.14, k.h * .86, 1.34, .06), k.rx - .25, k.fy + .17 + k.h * .43, 0, 0, 0, .14)]), m.seat, false)); for (const z of [-.45, 0, .45]) add(mesh(at(rbox(.08, .14, .22, .04), k.rx - .32, k.fy + k.h * .92 + .17, z, 0, 0, .1), m.seat, false)); }
    const dx = s.wind[1] - .3, dy = k.fy + k.dash * .62; const w = skin.w(0);
    add(mesh(merge([at(rbox(.46, .2, (w - .08) * 2, .07), dx + .1, dy, 0), at(rbox(.72, .16, .2, .04), dx - .46, k.fy + .1, 0)]), m.dash, false));
    const scr = new T.BoxGeometry(.012, .15, .26); add(mesh(at(scr, dx - .125, dy + .1, 0), m.screen, false));
    const sw = new T.TorusGeometry(.17, .017, 12, 44); const sx = dx - .19, sy = dy + .05, sz = k.z; const tilt = -1.2; const swm = new T.Mesh(sw, m.dash); swm.rotation.set(0, Math.PI / 2, 0); swm.rotateX(0); const hold = new T.Group(); hold.add(swm); for (const a of [0, 2.1, 4.2]) { const sp = new T.Mesh(new T.BoxGeometry(.012, .15, .036), m.dash); sp.position.set(0, Math.cos(a) * .08, Math.sin(a) * .08); sp.rotation.x = -a; hold.add(sp); } hold.add(new T.Mesh(new T.CylinderGeometry(.05, .05, .03, 20).rotateZ(Math.PI / 2), m.dash)); hold.position.set(sx, sy, sz); hold.rotation.z = -tilt * .3; add(hold);
  }

  function fin(add, skin, x, paint) { const q = new T.Shape(); q.moveTo(.11, 0); q.bezierCurveTo(.02, .03, -.06, .07, -.12, .075); q.quadraticCurveTo(-.15, .07, -.15, .04); q.lineTo(-.14, 0); q.closePath(); const g = new T.ExtrudeGeometry(q, { depth: .014, bevelEnabled: true, bevelSize: .006, bevelThickness: .006, bevelSegments: 2, curveSegments: 12 }); g.translate(0, 0, -.007); g.scale(.72, .72, 1); const p = skin.S(x, 1); g.translate(x, p[1] - .004, 0); add(mesh(g, paint)); }
  function hatch({ s, m, skin, add, both, patch, strip, side, sidePatch, face, faceLine, pos, tube, beltY }) {
    const R = s.front, ER = s.rear, hl = z => .735 + .05 * (1 - (z - .3) / .55), hb = z => .66 + .015 * Math.sin((z - .3) * 5);
    // headlamps: housing, reflector bowls, LED brow, clear lens
    face(1, .32, .84, hb, hl, .002, m.house); face(1, .42, .8, z => hl(z) - .022, z => hl(z) - .008, .007, m.led, { nu: 22, nv: 2 });
    both(g => { for (const z of [.47, .65]) { const x = skin.faceX(1, .695, z); if (x === null) continue; const b = ball(.05, 22, 14); add(mesh(at(b, x - .018, .695, g * z), m.reflector, false)); } });
    face(1, .31, .85, z => hb(z) - .004, z => hl(z) + .005, .014, m.lens);
    faceLine(1, [[.3, .648], [.86, .655]], .006, .002, m.mesh);
    // upper grille with chrome bar, lower grille with slats, fog lamps
    face(1, 0, .3, .635, .705, .0035, m.gloss, { nu: 14, nv: 4 }); face(1, 0, .33, .66, .668, .0065, m.chrome, { nu: 14, nv: 1 });
    face(1, 0, .52, .29, z => .42 - z * .06, .003, m.mesh, { nu: 18, nv: 4 }); for (let i = 0; i < 4; i++) face(1, 0, .49, .315 + i * .027, .322 + i * .027, .0065, m.matte, { nu: 12, nv: 1 });
    both(g => { const x = skin.faceX(1, .4, .67); face(1, .59, .75, .365, .435, .003, m.matte, { nu: 8, nv: 3, mirror: g > 0 }); const f = ball(.028, 16, 12); add(mesh(at(f, x + .002, .4, g * .67), m.reflector, false)); });
    faceLine(1, [[0, .56], [.72, .54]], .007, .0015, m.mesh);
    // tail: wrap lamps, hatch lip, bumper strip, reflector, wiper, exhaust
    face(-1, .42, .86, .9, z => 1.0 - (z - .42) * .06, .003, m.tail); face(-1, .5, .84, .948, .958, .007, m.tailOn, { nu: 16, nv: 1 }); face(-1, .5, .84, .925, .931, .007, m.tailOn, { nu: 16, nv: 1 }); face(-1, .56, .66, .905, .918, .007, m.reflector, { nu: 5, nv: 1 });
    face(-1, 0, .42, .9, .925, .0035, m.gloss, { nu: 12, nv: 2 });
    faceLine(-1, [[0, .7], [.74, .69]], .007, .0015, m.mesh); face(-1, 0, .72, .5, .6, .003, m.matte, { nu: 16, nv: 3 }); face(-1, .46, .68, .62, .645, .004, m.tail, { nu: 8, nv: 1 });
    { const c = skin.faceX(-1, .39, .5); const e = new T.CylinderGeometry(.034, .04, .24, 18).rotateZ(Math.PI / 2); add(mesh(e.translate(c - .005, .3, .5), m.chrome)); }
    { const y = 1.0, rx = skin.faceX(-1, 1.2, 0) ?? ER + .2; add(tube([[rx - .012, 1.16, 0], [rx + .03, 1.25, .1], [rx + .08, 1.34, .2]], .007, m.matte, 10)); }
    // side rubbing strip, sill, chrome on the door tops, shark fin
    sidePatch(-.92, .96, x => skin.S(x, .3)[1] + .02, x => skin.S(x, .3)[1] + .1, .003, m.matte, 30, 3);
    fin(add, skin, -1.3, m.paint);
  }

  function sport({ s, m, skin, add, both, patch, strip, side, sidePatch, face, faceLine, pos, tube, beltY }) {
    const hB = z => .485 + (z - .34) * .1, hT = z => .54 - (z - .34) * .045;
    // slim eye lamps set into the bonnet edge: housing, three LED cells, DRL blade, clear cover
    const lamp = (x, u) => lerp(.875 - .004, .935, u) + (x - 1.7) * .018, lx0 = 1.72, lx1 = 2.1, l0 = x => .872 + (x - lx0) * .05, l1 = x => .925 - (x - lx0) * .05 + .03 * Math.sin((x - lx0) / (lx1 - lx0) * Math.PI);
    patch(lx0, lx1, l0, l1, .002, m.house, { nu: 24, nv: 6 }); patch(lx0 + .03, lx1 - .03, x => l0(x) + .005, x => l0(x) + .012, .007, m.led, { nu: 20, nv: 2 });
    both(g => { for (const x of [1.8, 1.9, 2]) { const p = skin.P(x, (l0(x) + l1(x)) / 2 + .006, g, -.004); add(mesh(at(ball(.03, 18, 12), p[0], p[1], p[2]), m.reflector, false)); } }); patch(lx0 - .01, lx1 + .01, x => l0(x) - .003, x => l1(x) + .003, .013, m.lens, { nu: 24, nv: 6 });
    // big three-part intake, splitter, canards
    face(1, 0, .46, .19, z => .36 - z * .12, .003, m.mesh, { nu: 18, nv: 3 }); for (let i = 1; i < 7; i++) { const z = i * .07; faceLine(1, [[z, .2], [z, .35 - z * .12]], .008, .006, m.matte); } for (let i = 0; i < 3; i++) face(1, 0, .44, .235 + i * .036, .241 + i * .036, .006, m.matte, { nu: 12, nv: 1 });
    face(1, .52, .84, .2, z => .34 - (z - .52) * .25, .003, m.mesh, { nu: 12, nv: 3 });
    { const r = []; for (let i = 0; i <= 40; i++) { const z = -.92 + 1.84 * i / 40, x = skin.faceX(1, .24, z) ?? s.front - .3, w = 1 - Math.pow(Math.abs(z) / .92, 4), p = x - .1; r.push([[p, .195, z], [x + .01 + .03 * w, .19, z], [x + .01 + .03 * w, .172, z], [p, .172, z]]); } add(grid(r, m.matte, { wrap: true })); }
    // bonnet vents with slats
    both(g => { const x0 = 1.26, x1 = 1.5; patch(x0, x1, .93, .965, .003, m.mesh, { nu: 8, nv: 3, signs: [g] }); for (let i = 1; i < 5; i++) { const x = x0 + (x1 - x0) * i / 5; strip([[x, .93], [x, .965]], .012, .006, m.gloss, [g]); } });
    // side intake ahead of the rear arch, black sill blade
    sidePatch(-1.0, -.78, x => .42 + (x + 1) * .1, x => .74 - (x + 1) * .55, .002, m.mesh, 14, 6); for (let i = 1; i < 4; i++) { const x = lerp(-.98, -.8, i / 4); side([[x, .46], [x, .68]], .012, .007, m.gloss); }
    sidePatch(-.98, .98, x => skin.S(x, .3)[1] + .005, x => skin.S(x, .3)[1] + .075, .004, m.gloss, 30, 3);
    // tail: full-width light bar, black panel, diffuser with fins, quad pipes
    face(-1, 0, .84, .695, .735, .0035, m.gloss, { nu: 22, nv: 2 }); face(-1, 0, .84, .708, .72, .008, m.tailOn, { nu: 24, nv: 1 }); face(-1, .46, .86, .64, .79, .005, m.tail, { nu: 16, nv: 5 }); for (const y of [.665, .755]) face(-1, .5, .84, y, y + .012, .009, m.tailOn, { nu: 14, nv: 1 });
    face(-1, 0, .74, .2, z => .44 - z * .1, .003, m.mesh, { nu: 18, nv: 3 }); for (let i = 0; i < 2; i++) { const z = .06 + i * .12; faceLine(-1, [[z, .22], [z, .4]], .012, .008, m.gloss); }
    both(g => { for (const z of [.3, .46]) { const x = s.rear + .1, e = new T.CylinderGeometry(.042, .046, .2, 28, 1, true).rotateZ(Math.PI / 2); add(mesh(e.translate(x, .335, g * z), m.chrome)); const i = new T.CircleGeometry(.042, 28).rotateY(-Math.PI / 2); add(mesh(i.translate(x - .07, .335, g * z), m.mesh, false)); } });
    // engine cover under the rear glass, louvres, and a bulkhead behind the seats
    patch(s.back[0] + .02, s.back[1] - .02, TS, 1, -.02, m.house, { nu: 16, nv: 18 }); for (let i = 1; i < 8; i++) { const x = lerp(s.back[0] + .1, s.back[1] - .1, i / 8); strip([[x, .9], [x, 1]], .03, -.012, m.gloss); }
    add(mesh(at(rbox(.05, .5, 1.3, .02), -.76, .66, 0), m.liner, false));
    // ducktail wing
    { const q = new T.Shape(); q.moveTo(0, 0); q.bezierCurveTo(.1, .03, .2, .06, .3, .075); q.lineTo(.31, .058); q.bezierCurveTo(.2, .03, .1, .0, 0, -.03); q.closePath(); const g = new T.ExtrudeGeometry(q, { depth: 1.62, bevelEnabled: true, bevelSize: .006, bevelThickness: .03, bevelSegments: 3, curveSegments: 12 }); g.translate(0, 0, -.81); g.rotateY(Math.PI); g.translate(s.rear + .34, .995, 0); add(mesh(g, m.paint)); }
  }

  function suv({ s, m, skin, add, both, patch, strip, side, sidePatch, face, faceLine, pos, tube, beltY }) {
    // tall rectangular lamps with a C-shaped signature joined by the grille
    face(1, .44, .88, .985, 1.09, .002, m.house, { nu: 24, nv: 8 }); face(1, .5, .84, 1.075, 1.086, .008, m.led, { nu: 20, nv: 1 }); face(1, .835, .85, 1, 1.08, .008, m.led, { nu: 2, nv: 8 }); face(1, .5, .84, .99, 1.0, .008, m.led, { nu: 20, nv: 1 });
    both(g => { for (const z of [.56, .72]) { const x = skin.faceX(1, 1.038, z); if (x !== null) add(mesh(at(ball(.046, 22, 14), x - .016, 1.038, g * z), m.reflector, false)); } }); face(1, .43, .89, .975, 1.1, .015, m.lens);
    // grille of heavy bars
    face(1, 0, .43, .92, 1.1, .003, m.mesh, { nu: 16, nv: 3 }); for (let i = 0; i < 6; i++) { const z = .025 + i * .075; face(1, z, z + .03, .93, 1.09, .009, m.trim, { nu: 2, nv: 6 }); } face(1, 0, .44, 1.09, 1.11, .009, m.chrome, { nu: 14, nv: 1 }); face(1, 0, .44, .91, .928, .009, m.chrome, { nu: 14, nv: 1 });
    // bumper: black lower, silver skid plate, tow eye, fogs
    face(1, 0, .9, .44, z => .86 - z * z * .05, .004, m.matte, { nu: 24, nv: 6 }); face(1, 0, .62, .42, z => .56 - z * .05, .008, m.steel, { nu: 18, nv: 3 }); face(1, 0, .52, .63, .79, .008, m.mesh, { nu: 16, nv: 2 }); for (let i = 0; i < 3; i++) face(1, 0, .5, .665 + i * .04, .673 + i * .04, .011, m.matte, { nu: 12, nv: 1 });
    both(g => { const x = skin.faceX(1, .72, .75); if (x !== null) add(mesh(at(ball(.05, 20, 14), x - .022, .72, g * .75), m.reflector, false)); }); { const x = skin.faceX(1, .6, .32); const t = new T.TorusGeometry(.026, .009, 10, 20).rotateY(Math.PI / 2); add(mesh(t.translate(x + .02, .56, .34), m.chrome)); }
    // arch cladding, rocker cover, chunky side step
    for (const a of s.arches) both(g => { const r = [], n = 34; for (let i = 0; i <= n; i++) { const th = lerp(-.17, Math.PI + .17, i / n), c = []; for (const q of [a.r - .004, a.r + .025, a.r + .085, a.r + .095]) { const x = a.x + Math.cos(th) * q, y = s.axle + Math.sin(th) * q; c.push(skin.P(x, skin.tOf(x, Math.max(y, skin.S(x, .3)[1] + .004)), g, q > a.r + .09 ? .002 : .012)); } r.push(c); } const o = grid(r, m.matte, { shadow: false }); add(o); fixOut(o.geometry, s.mid); });
    sidePatch(-.96, 1.01, x => skin.S(x, .3)[1] + .0, x => skin.S(x, .3)[1] + .15, .006, m.matte, 30, 3);
    both(g => { add(tube([[-.92, .29, g * .86], [-.86, .25, g * .97], [.9, .25, g * .97], [.96, .29, g * .86]], .026, m.steel, 40)); const b = rbox(1.72, .03, .14, .012); add(mesh(at(b, .02, .272, g * .94), m.matte)); });
    // roof rails, shark fin, tail, ladder of details
    both(g => { const rail = []; for (let i = 0; i <= 8; i++) { const x = lerp(-1.9, .36, i / 8), p = skin.S(x, .93, g); rail.push([x, p[1] + .05 + .018 * Math.sin(i / 8 * Math.PI), p[2]]); } add(tube(rail, .016, m.steel, 60)); for (const x of [-1.9, -1.15, -.4, .36]) { const p = skin.S(x, .93, g); add(mesh(at(rbox(.09, .06, .034, .012), x, p[1] + .022, p[2]), m.matte)); } });
    for (const x of [-1.05, -.2]) { const a = skin.S(x, .93); add(mesh(at(rbox(.05, .025, a[2] * 2, .01), x, a[1] + .062, 0), m.matte)); }
    fin(add, skin, -1.7, m.paint);
    // rear screen on the tailgate, lamps, bumper, wheel carrier
    face(-1, 0, .72, 1.36, z => 1.74 - z * z * .25, .004, m.gloss, { nu: 18, nv: 8 }); face(-1, 0, .7, 1.38, z => 1.72 - z * z * .25, .009, m.glass, { nu: 18, nv: 8 });
    face(-1, .6, .9, 1.02, 1.5, .004, m.tail, { nu: 8, nv: 14 }); face(-1, .72, .78, 1.05, 1.47, .009, m.tailOn, { nu: 2, nv: 12 }); face(-1, .84, .875, 1.05, 1.47, .009, m.tailOn, { nu: 2, nv: 12 }); face(-1, .62, .69, 1.22, 1.3, .009, m.reflector, { nu: 3, nv: 3 });
    faceLine(-1, [[0, 1.34], [.8, 1.34]], .008, .0015, m.mesh); faceLine(-1, [[.62, 1.76], [.6, 1.02], [0, 1.02]], .008, .0015, m.mesh);
    face(-1, 0, .92, .5, .86, .004, m.matte, { nu: 24, nv: 6 }); face(-1, 0, .56, .48, .62, .008, m.steel, { nu: 16, nv: 3 });
    { const x = skin.faceX(-1, 1.15, 0), R = s.R, t = wheel({ R, Rr: s.Rr, W: s.tyre, spokes: 6, kind: 'suv', rim: 'gold', caliper: '#333' }, m), h = new T.Group(); h.add(t.group); h.rotation.y = -Math.PI / 2; h.position.set(x - s.tyre / 2 - .05, 1.28, 0); add(h); add(mesh(at(rbox(.1, .3, .3, .02), x - .03, 1.28, 0), m.matte)); }
    both(g => { const c = skin.faceX(-1, .6, .3); })
  }

  window.CloudCars = { build, SPEC };
})();
