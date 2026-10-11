/* Dirty hands: finger-painting in thick clay on the page background.
   Every mark is a height field of clay that is lit as a raised relief (impasto): a tap leaves a fingertip dab
   (paint squeezed into a rim, the skin pattern only faintly visible), dragging paints a thick stroke with
   bristle-like grooves, ridges along the edges, a heap where it starts and paint gathered at the end; when the
   finger runs out of clay the stroke breaks up like a dry brush. Holding the press leaves part of a palm.
   Usage: DirtyHands.init({ layer, surfaces: [el...], presets: () => [[x, y, kind, angle, size], ...], seed, onTouch }) */
(function () {
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  const PXCM = 38 * DPR;                                   // ~38 CSS px per centimetre

  function hash2(x, y, k) { const v = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); }
  function vnoise(x, y, k = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (hash2(xi, yi, k) * (1 - u) + hash2(xi + 1, yi, k) * u) * (1 - v) + (hash2(xi, yi + 1, k) * (1 - u) + hash2(xi + 1, yi + 1, k) * u) * v;
  }
  function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

  // ---------- fingerprint synthesis ----------
  const GW = 112, GH = 148, PERIOD = 5.6;                   // generation grid; ~20 ridges across a fingertip
  const NQ = 24, KR = 6, kernels = [];
  for (let q = 0; q < NQ; q++) {
    const th = q * Math.PI / NQ, k = new Float32Array((2 * KR + 1) ** 2), ss = PERIOD * 0.5, st = PERIOD * 0.85;
    let i = 0;
    for (let v = -KR; v <= KR; v++) for (let u = -KR; u <= KR; u++, i++) {
      const s = -u * Math.sin(th) + v * Math.cos(th), t = u * Math.cos(th) + v * Math.sin(th);   // across / along the ridge
      k[i] = Math.exp(-(s * s) / (2 * ss * ss) - (t * t) / (2 * st * st)) * Math.cos(2 * Math.PI * s / PERIOD);
    }
    kernels.push(k);
  }

  function orientation(type, r) {
    const th = new Float32Array(GW * GH), j = () => (r() - 0.5) * 0.16;
    let cores = [], deltas = [];
    if (type === 'loop') { cores = [[j(), -0.12 + j()]]; deltas = [[(r() < 0.5 ? -1 : 1) * (0.62 + j()), 0.62 + j()]]; }
    if (type === 'whorl') { cores = [[-0.1 + j(), -0.15 + j()], [0.1 + j(), 0.02 + j()]]; deltas = [[-0.68 + j(), 0.66 + j()], [0.68 + j(), 0.66 + j()]]; }
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const X = (x / GW) * 2 - 1, Y = ((y / GH) * 2 - 1) * (GH / GW);
      let a;
      if (type === 'arch') {
        const h = 0.55 * Math.exp(-((Y + 0.1) ** 2) * 2.2);
        a = Math.atan(-2 * h * X * Math.exp(-X * X * 2.5) * 2.4);
      } else {
        a = 0;
        for (const c of cores) a += Math.atan2(Y - c[1], X - c[0]);
        for (const d of deltas) a -= Math.atan2(Y - d[1], X - d[0]);
        a *= 0.5;
      }
      // towards the flexion crease the ridges run straight across the finger
      const b = Math.min(1, Math.max(0, (Y - 0.95) / 0.3));
      th[y * GW + x] = a * (1 - b);
    }
    return th;
  }

  // grow ridges along an orientation field by iterated oriented Gabor filtering of noise
  function gaborRidges(th, GW, GH, r, iters = 9) {
    const N = GW * GH, qi = new Uint8Array(N);
    for (let p = 0; p < N; p++) { let a = th[p] % Math.PI; if (a < 0) a += Math.PI; qi[p] = Math.round(a / Math.PI * NQ) % NQ; }
    let img = new Float32Array(N), out = new Float32Array(N);
    for (let p = 0; p < N; p++) img[p] = r() < 0.08 ? (r() < 0.5 ? -1 : 1) : 0;
    for (let it = 0; it < iters; it++) {
      let mx = 1e-6;
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const k = kernels[qi[y * GW + x]];
        let s = 0, i = 0;
        for (let v = -KR; v <= KR; v++) {
          const yy = y + v;
          if (yy < 0 || yy >= GH) { i += 2 * KR + 1; continue; }
          const row = yy * GW;
          for (let u = -KR; u <= KR; u++, i++) { const xx = x + u; if (xx >= 0 && xx < GW) s += k[i] * img[row + xx]; }
        }
        out[y * GW + x] = s; if (Math.abs(s) > mx) mx = Math.abs(s);
      }
      for (let p = 0; p < N; p++) img[p] = Math.tanh(out[p] / mx * 4);
    }
    return img;
  }

  function synthesize(type, r, mirror) {
    const img = gaborRidges(orientation(type, r), GW, GH, r);
    // fingertip footprint: oval, cut by the crease at the bottom, softer at the rim
    const c = document.createElement('canvas'); c.width = GW; c.height = GH;
    const g = c.getContext('2d'), id = g.createImageData(GW, GH), d = id.data;
    const pressAng = r() * Math.PI * 2, px = Math.cos(pressAng), py = Math.sin(pressAng);
    const K = r() * 100;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const X = (x / GW) * 2 - 1, Y = ((y / GH) * 2 - 1);
      const lo = vnoise(x * 0.06, y * 0.06, K), mid = vnoise(x * 0.17, y * 0.17, K + 9), hi = vnoise(x * 0.5, y * 0.5, K + 17);
      // ragged, lumpy rim: clay squeezes out unevenly
      const e = Math.sqrt(X * X / 0.92 + (Y < 0 ? Y * Y / 0.98 : Y * Y / 1.12)) + (mid - 0.5) * 0.22 + (lo - 0.5) * 0.16;
      let m = Math.min(1, Math.max(0, (1 - e) / 0.12));
      m *= 1 - Math.min(1, Math.max(0, (Y - 0.84) / 0.06)) * 0.75;          // crease gap
      m *= 0.6 + 0.4 * Math.min(1, Math.max(0, 0.75 + 0.5 * (X * px + Y * py)));   // uneven pressure
      let ridge = Math.min(1, Math.max(0, (img[y * GW + x] + 0.15) / 0.7));
      // patches where wet clay fills the valleys completely, and dry patches where ridges break up
      const clog = Math.min(1, Math.max(0, (lo - 0.45) / 0.2));
      const dry = Math.min(1, Math.max(0, (0.36 - lo) / 0.16));
      ridge = ridge * (1 - dry * (hi > 0.5 ? 1 : 0.4));
      const pore = r() < 0.015 ? 0.15 : 1;
      const v = Math.max(0.42 + 0.58 * ridge * pore, clog * (0.8 + 0.2 * hi));   // ridges half-filled with clay
      const o = ((mirror ? GW - 1 - x : x) + y * GW) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255;
      d[o + 3] = Math.round(255 * m * v);
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  // part of a palm: finger-base pads, the heel of the hand, the main creases, a hollow centre that barely touches
  const PW = 230, PH = 230;
  function synthPalm(r) {
    const th = new Float32Array(PW * PH), ph = r() * 6.28;
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const X = x / PW * 2 - 1, Y = y / PH * 2 - 1;
      // palm ridges sweep across the hand and curve around the pads
      th[y * PW + x] = 0.35 + 0.45 * Math.sin(X * 1.6 + Y * 0.9 + ph) + 0.25 * Math.atan2(Y + 0.62, X * 1.4);
    }
    const img = gaborRidges(th, PW, PH, r, 6);
    const c = document.createElement('canvas'); c.width = PW; c.height = PH;
    const g = c.getContext('2d'), id = g.createImageData(PW, PH), d = id.data;
    const K = r() * 100, keep = r() * Math.PI * 2, kx = Math.cos(keep), ky = Math.sin(keep), cut = -0.15 + r() * 0.35;
    const crease = (Y, X, f, w) => Math.exp(-((Y - f(X)) ** 2) / (w * w));
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const X = x / PW * 2 - 1, Y = y / PH * 2 - 1;
      const lo = vnoise(x * 0.036, y * 0.036, K), mid = vnoise(x * 0.1, y * 0.1, K + 9), hi = vnoise(x * 0.32, y * 0.32, K + 17);
      // palm outline: rounded body plus four finger-base pads along the top
      const bx = Math.abs(X) / 0.84, by = Y < 0 ? -Y / 0.52 : Y / 0.95;
      let body = Math.pow(Math.pow(bx, 2.6) + Math.pow(by, 2.6), 1 / 2.6);   // rounded, slightly squarish palm
      let pad = 9;
      for (const px of [-0.62, -0.21, 0.21, 0.62]) pad = Math.min(pad, Math.hypot((X - px) / 0.21, (Y + 0.62) / 0.2));
      const e = Math.min(body, pad) + (mid - 0.5) * 0.2 + (lo - 0.5) * 0.14;
      let m = Math.min(1, Math.max(0, (1 - e) / 0.1));
      // the hollow of the palm hardly touches the surface
      m *= 1 - 0.85 * Math.exp(-((X + 0.05) ** 2 / 0.16 + (Y - 0.12) ** 2 / 0.12));
      // main creases: heart, head, life, and the line under the fingers
      const cr = Math.max(
        crease(Y, X, X => -0.32 + 0.12 * (X + 0.2) ** 2, 0.035) * (X < 0.55 ? 1 : 0),
        crease(Y, X, X => -0.02 + 0.16 * X, 0.03) * (X > -0.55 ? 1 : 0),
        crease(Math.hypot(X - 0.95, Y - 0.95), 0, () => 0.78, 0.032) * (Y > -0.2 ? 1 : 0),
        crease(Y, X, () => -0.43, 0.025) * 0.7);
      m *= 1 - 0.85 * cr;
      // only part of the palm pressed into the surface
      m *= Math.min(1, Math.max(0, ((X * kx + Y * ky) + 0.25 * (X * ky - Y * kx) ** 2 - cut + (lo - 0.5) * 0.5) / 0.3 + 0.5));
      let ridge = Math.min(1, Math.max(0, (img[y * PW + x] + 0.15) / 0.7));
      const clog = Math.min(1, Math.max(0, (lo - 0.45) / 0.2));
      const dry = Math.min(1, Math.max(0, (0.34 - lo) / 0.16));
      ridge *= 1 - dry * (hi > 0.5 ? 1 : 0.4);
      const v = Math.max(0.55 + 0.45 * ridge, clog * (0.85 + 0.15 * hi));
      const o = (x + y * PW) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255;
      d[o + 3] = Math.round(255 * m * v);
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  const palms = [];
  const pickPalm = r => { if (!palms.length) palms.push(synthPalm(r)); return palms[Math.floor(r() * palms.length)]; };

  const prints = [];
  function ensurePrints(count, r) {
    const types = ['loop', 'whorl', 'loop', 'arch', 'loop', 'whorl', 'loop', 'whorl'];
    while (prints.length < count) { const i = prints.length; prints.push(synthesize(types[i % types.length], r, i % 2 === 1)); }
  }
  const pickPrint = r => prints[Math.floor(r() * prints.length)];

  const alphaOf = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, a = new Float32Array(c.width * c.height); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255; return { a, w: c.width, h: c.height }; };
  const printFields = [];
  const pickPrintField = r => { while (printFields.length < prints.length) printFields.push(alphaOf(prints[printFields.length])); return printFields[Math.floor(r() * printFields.length)]; };
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------- clay colour ----------
  function clayColour(r) {                               // stoneware clay: wet umber to drying beige
    const wet = [104, 82, 62], dry = [150, 126, 98], k = r() * 0.7;
    return wet.map((v, i) => v + (dry[i] - v) * k);
  }

  // ---------- lighting a height field (impasto) ----------
  // H: Float32Array w*h (0 = bare, ~1 = thick), gx/gy: position of the field on the surface (for continuous noise)
  const L = (() => { const v = [-0.48, -0.6, 0.64], n = Math.hypot(...v); return v.map(x => x / n); })();
  const HV = (() => { const v = [L[0], L[1], L[2] + 1], n = Math.hypot(...v); return v.map(x => x / n); })();
  // shade the window (ox, oy, w, h) of a field H that is fw x fh; neighbours outside the window are read from H
  function shadeField(H, fw, fh, col, gx, gy, ox = 0, oy = 0, w = fw, h = fh) {
    const out = new ImageData(w, h), d = out.data, R = 6 * DPR;     // relief strength (gradients are per device px)
    const so = Math.round(2.4 * DPR), sx = so, sy = Math.round(so * 1.15);
    const at = (X, Y) => (X < 0 || Y < 0 || X >= fw || Y >= fh) ? 0 : H[Y * fw + X];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = ox + x, Y = oy + y, p = y * w + x, z = at(X, Y);
      const zs = at(X - sx, Y - sy);                              // cast shadow from clay up-left of this pixel
      const sa = Math.min(0.42, Math.max(0, (zs - z) * 1.4));
      if (z < 0.01 && sa < 0.01) continue;
      const a = Math.min(1, z / 0.07);
      let r = 0, g = 0, b = 0;
      if (a > 0) {
        const dx = (at(X + 1, Y) - at(X - 1, Y)) * R, dy = (at(X, Y + 1) - at(X, Y - 1)) * R;
        const nl = Math.hypot(dx, dy, 1), nx = -dx / nl, ny = -dy / nl, nz = 1 / nl;
        const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const spec = Math.pow(Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), 26) * 0.3;    // wet clay sheen, not plastic
        const tint = 0.9 + 0.2 * vnoise((gx + X) / (14 * DPR), (gy + Y) / (14 * DPR), 3) + (hash2(gx + X, gy + Y, 7) - 0.5) * 0.06;
        const k = (0.36 + 0.86 * lam) * tint * (0.9 + 0.12 * Math.min(1, z));   // thicker clay is a touch lighter/wetter
        r = col[0] * k + 255 * spec; g = col[1] * k + 246 * spec; b = col[2] * k + 228 * spec;
      }
      // paint over its own shadow
      const A = a + sa * (1 - a);
      if (A <= 0) continue;
      const shc = [46, 36, 27];
      d[p * 4] = Math.min(255, (r * a + shc[0] * sa * (1 - a)) / A);
      d[p * 4 + 1] = Math.min(255, (g * a + shc[1] * sa * (1 - a)) / A);
      d[p * 4 + 2] = Math.min(255, (b * a + shc[2] * sa * (1 - a)) / A);
      d[p * 4 + 3] = A * 255;
    }
    return out;
  }
  const tmp = document.createElement('canvas');
  function blit(ctx, img, x, y) {
    tmp.width = img.width; tmp.height = img.height;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, x, y);
  }

  // ---------- marks dry out and fall away after a while ----------
  const marks = [];
  let busy = false;                                         // no fading while a stroke is being painted
  const surfOf = ctx => surfaces.find(s => s.ctx === ctx);
  function addMark(surf, x, y, w, h) {
    if (!surf) return;
    marks.push({ surf, x: Math.floor(x), y: Math.floor(y), w: Math.ceil(w), h: Math.ceil(h), t: performance.now(), life: 5000 + Math.random() * 8000, k: 0 });
  }
  setInterval(() => {
    if (busy || !marks.length) return;
    const now = performance.now();
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      if (now - m.t < m.life) continue;
      const c = m.surf.ctx;
      c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(m.x, m.y, m.w, m.h); c.restore();
      if (++m.k >= 14) {                                    // gone: wipe the faint residue that 8-bit alpha leaves
        const x = Math.max(0, m.x), y = Math.max(0, m.y), w = Math.min(m.surf.W - x, m.w), h = Math.min(m.surf.H - y, m.h);
        if (w > 0 && h > 0) {
          const img = c.getImageData(x, y, w, h), d = img.data;
          for (let p = 3; p < d.length; p += 4) if (d[p] < 40) d[p] = 0;
          c.putImageData(img, x, y);
        }
        marks.splice(i, 1);
      }
    }
  }, 110);

  // ---------- fingertip dab ----------
  // a finger loaded with clay pressed once: paint squeezed out into a raised rim, a thin layer inside where the skin
  // pattern shows only faintly, a few peaks pulled up as the finger lifts, and a couple of crumbs
  function dab(ctx, x, y, ang, sz = 1, r = Math.random, strength = 1) {
    const rx = 0.58 * PXCM * sz, ry = 0.78 * PXCM * sz, S = Math.ceil(ry * 3.2), h0 = S / 2;
    const H = new Float32Array(S * S), ca = Math.cos(ang), sa = Math.sin(ang);
    const fp = pickPrintField(r), K = r() * 100, load = 0.75 + 0.35 * r();
    const peaks = Array.from({ length: 2 + Math.floor(r() * 3) }, () => [(r() - 0.5) * 1.1, (r() - 0.5) * 1.2, 0.18 + r() * 0.3, 0.08 + r() * 0.08]);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const dx = i - h0, dy = j - h0, u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
      const wob = (vnoise(i / (6 * DPR), j / (6 * DPR), K) - 0.5) * 0.28 + (vnoise(i / (2.2 * DPR), j / (2.2 * DPR), K + 3) - 0.5) * 0.1;
      const e = Math.hypot(u, v) + wob;
      if (e > 1.45) continue;
      // faint skin pattern from a synthetic fingerprint, sampled in finger space
      const fx = Math.floor((u * 0.5 + 0.5) * (fp.w - 1)), fy = Math.floor((v * 0.5 + 0.5) * (fp.h - 1));
      const skin = (fx >= 0 && fy >= 0 && fx < fp.w && fy < fp.h) ? fp.a[fy * fp.w + fx] : 0;
      const inner = (0.3 + 0.16 * skin) * (1 - ss(0.82, 1.0, e));
      const rim = Math.exp(-(((e - 0.98) / 0.13) ** 2)) * (0.62 + 0.55 * vnoise(Math.atan2(v, u) * 2.5 + 9, 1, K + 5));
      let z = Math.max(inner, rim) * load;
      for (const [pu, pv, ph, pr] of peaks) z += ph * Math.exp(-((u - pu) ** 2 + (v - pv) ** 2) / (pr * pr)) * (e < 0.9 ? 1 : 0);
      H[j * S + i] = z * strength;
    }
    // crumbs flicked off around the dab
    for (let k = 0, n = 2 + Math.floor(r() * 5); k < n; k++) {
      const a = r() * Math.PI * 2, d = (1.25 + r() * 0.5) * ry, cx = h0 + Math.cos(a) * d, cy = h0 + Math.sin(a) * d, cr = (0.6 + r() ** 2 * 1.8) * DPR;
      for (let j = Math.max(0, Math.floor(cy - cr)); j < Math.min(S, cy + cr + 1); j++) for (let i = Math.max(0, Math.floor(cx - cr)); i < Math.min(S, cx + cr + 1); i++) {
        const q = 1 - ((i - cx) ** 2 + (j - cy) ** 2) / (cr * cr);
        if (q > 0) H[j * S + i] = Math.max(H[j * S + i], 0.55 * Math.sqrt(q));
      }
    }
    blit(ctx, shadeField(H, S, S, clayColour(r), x - h0, y - h0), Math.round(x - h0), Math.round(y - h0));
    addMark(surfOf(ctx), x - h0, y - h0, S, S);
  }
  function fingers(ctx, x, y, ang, count, r = Math.random, strength = 1) {
    const sizes = [1, 1.06, 1, 0.84];
    for (let i = 0; i < count; i++) {
      const t = i - (count - 1) / 2, d = 1.4 * PXCM;
      dab(ctx, x + Math.cos(ang) * t * d, y + Math.sin(ang) * t * d - Math.abs(t) * 0.35 * PXCM * Math.cos(ang),
        ang + t * 0.12 + (r() - 0.5) * 0.2, sizes[i % 4] * (0.92 + r() * 0.16), r, strength);
    }
  }

  // ---------- palm (press and hold) ----------
  function palmPrint(ctx, x, y, ang, sz = 1, r = Math.random) {
    const P = palms.length ? palms[Math.floor(r() * palms.length)] : (palms.push(synthPalm(r)), palms[0]);
    const pf = P._f || (P._f = alphaOf(P));
    const span = 6.2 * PXCM * sz, S = Math.ceil(span * 1.45), h0 = S / 2, k = pf.w / span, ca = Math.cos(ang), sa = Math.sin(ang);
    const H = new Float32Array(S * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const dx = i - h0, dy = j - h0, u = (dx * ca + dy * sa) * k + pf.w / 2, v = (-dx * sa + dy * ca) * k + pf.h / 2;
      if (u < 0 || v < 0 || u >= pf.w - 1 || v >= pf.h - 1) continue;
      const a = pf.a[Math.floor(v) * pf.w + Math.floor(u)];
      H[j * S + i] = a * 0.42 + 4 * a * (1 - a) * 0.35;          // thin layer + paint pushed up where contact ends
    }
    blit(ctx, shadeField(H, S, S, clayColour(r), x - h0, y - h0), Math.round(x - h0), Math.round(y - h0));
    addMark(surfOf(ctx), x - h0, y - h0, S, S);
  }

  // ---------- strokes (press and drag) ----------
  // The stroke lives in its own height field over a region of the surface. Each move stamps new clay (max blend),
  // restores the untouched surface under the changed rectangle and re-lights it, so the relief merges correctly.
  function startStroke(surf, x, y, region, r = Math.random) {
    let [rx, ry, rw, rh] = region.map(Math.round);
    rx = Math.max(0, rx); ry = Math.max(0, ry); rw = Math.min(surf.W - rx, rw); rh = Math.min(surf.H - ry, rh);
    const N = 72, prof = Array.from({ length: N }, () => r());   // bristle / skin streaks across the width
    for (let i = 1; i < N - 1; i++) prof[i] = (prof[i - 1] + prof[i] * 2 + prof[i + 1]) / 4;
    return {
      surf, rx, ry, rw, rh, snap: surf.ctx.getImageData(rx, ry, rw, rh), H: new Float32Array(rw * rh),
      x: x - rx, y: y - ry, dir: null, load: 1, travel: 0, W: (1.05 + r() * 0.25) * PXCM, prof, col: clayColour(() => r() * 0.5), r,
      box: null, started: false,
    };
  }
  function grow(st, x0, y0, x1, y1) {
    const b = st.box; st.box = b ? [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)] : [x0, y0, x1, y1];
    const a = st.all; st.all = a ? [Math.min(a[0], x0), Math.min(a[1], y0), Math.max(a[2], x1), Math.max(a[3], y1)] : [x0, y0, x1, y1];
  }
  function blob(st, cx, cy, rad, height, squash = 1, ang = 0) {   // rounded heap of clay (start / end of a stroke)
    const { H, rw, rh } = st, ca = Math.cos(ang), sa = Math.sin(ang);
    const x0 = Math.max(1, Math.floor(cx - rad - 2)), x1 = Math.min(rw - 2, Math.ceil(cx + rad + 2));
    const y0 = Math.max(1, Math.floor(cy - rad - 2)), y1 = Math.min(rh - 2, Math.ceil(cy + rad + 2));
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const dx = i - cx, dy = j - cy, a = (dx * ca + dy * sa) / (rad * squash), b = (-dx * sa + dy * ca) / rad;
      const e = Math.hypot(a, b) + (vnoise(i / (5 * DPR), j / (5 * DPR), 11) - 0.5) * 0.3;
      if (e >= 1) continue;
      const z = height * Math.pow(1 - e * e, 0.6) + Math.exp(-(((e - 0.85) / 0.12) ** 2)) * height * 0.35;
      const p = j * rw + i; if (z > H[p]) H[p] = z;
    }
    grow(st, x0, y0, x1, y1);
  }
  function stamp(st, px, py, dx, dy) {
    const { H, rw, rh, prof } = st, N = prof.length;
    const W = st.W * (0.72 + 0.28 * st.load) * (0.9 + 0.2 * vnoise(st.travel / (3 * PXCM), 0, 26)), half = W / 2, nx = -dy, ny = dx, T = 3.4 * DPR;
    const ext = half + T + 2;
    const x0 = Math.max(1, Math.floor(px - ext)), x1 = Math.min(rw - 2, Math.ceil(px + ext));
    const y0 = Math.max(1, Math.floor(py - ext)), y1 = Math.min(rh - 2, Math.ceil(py + ext));
    const dry = Math.max(0, 0.5 - st.load) * 2;                    // how broken-up the stroke gets (0..1)
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const qx = i - px, qy = j - py, a = qx * dx + qy * dy, b = qx * nx + qy * ny;
      if (a > T || a < -T) continue;
      const u = b / half; if (u >= 1 || u <= -1) continue;
      // streaks wander a little along the stroke, like bristles splaying
      const sh = (vnoise(st.travel / (2.2 * PXCM), u * 1.5, 21) - 0.5) * 7;
      const f = Math.min(N - 1.001, Math.max(0, (u * 0.5 + 0.5) * (N - 1) + sh)), i0 = Math.floor(f), pr = prof[i0] + (prof[i0 + 1] - prof[i0]) * (f - i0);
      const dome = Math.pow(1 - u * u, 0.35);
      const rimW = 0.09 + 0.05 * vnoise(st.travel / (1.2 * PXCM), Math.sign(u) * 3, 23);
      const rim = Math.exp(-(((Math.abs(u) - 0.86) / rimW) ** 2)) * (0.7 + 0.6 * vnoise(st.travel / (0.8 * PXCM), Math.sign(u) * 5, 24));
      const lump = 0.82 + 0.36 * vnoise(i / (4.5 * DPR), j / (4.5 * DPR), 25);
      let z = st.load * (0.46 * dome * (0.35 + 0.9 * pr) * lump + rim * (0.3 + 0.3 * pr));
      if (dry > 0) { const thr = 0.2 + dry * 0.7; z *= 0.08 + 0.92 * ss(thr - 0.12, thr + 0.06, pr); }   // dry brush: only the strongest streaks still carry clay
      z *= 1 - (a / T) ** 2 * 0.06;
      const p = j * rw + i; if (z > H[p]) H[p] = z;
    }
    grow(st, x0, y0, x1, y1);
  }
  function render(st) {
    if (!st.box) return;
    const m = Math.ceil(6 * DPR);
    const x0 = Math.max(0, st.box[0] - m), y0 = Math.max(0, st.box[1] - m), x1 = Math.min(st.rw, st.box[2] + m), y1 = Math.min(st.rh, st.box[3] + m);
    const w = x1 - x0, h = y1 - y0; if (w <= 2 || h <= 2) return;
    const ctx = st.surf.ctx;
    ctx.putImageData(st.snap, st.rx, st.ry, x0, y0, w, h);       // surface as it was before this stroke
    blit(ctx, shadeField(st.H, st.rw, st.rh, st.col, st.rx, st.ry, x0, y0, w, h), st.rx + x0, st.ry + y0);
    st.box = null;
  }
  function strokeTo(st, X, Y) {
    const x = X - st.rx, y = Y - st.ry, ddx = x - st.x, ddy = y - st.y, len = Math.hypot(ddx, ddy);
    if (len < 0.5) return;
    let dx = ddx / len, dy = ddy / len;
    if (!st.started) { st.started = true; blob(st, st.x, st.y, st.W * 0.56, 0.78, 1.05, Math.atan2(dy, dx)); }   // the finger lands: a heap
    if (st.dir) {                                                  // smooth the direction a little
      dx = st.dir[0] * 0.35 + dx * 0.65; dy = st.dir[1] * 0.35 + dy * 0.65; const n = Math.hypot(dx, dy); dx /= n; dy /= n;
    }
    st.dir = [dx, dy];
    const step = 1.2 * DPR, n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      st.travel += len / n;
      st.load *= Math.exp(-(len / n) / (17 * PXCM));                // clay on the finger runs out after ~20 cm
      if (st.load > 0.05) stamp(st, st.x + ddx * t, st.y + ddy * t, dx, dy);
    }
    st.x = x; st.y = y;
    render(st);
  }
  function endStroke(st) {
    if (st.started && st.dir && st.load > 0.3) {                   // clay pushed ahead of the finger gathers at the end
      const [dx, dy] = st.dir, W = st.W * (0.72 + 0.28 * st.load);
      blob(st, st.x + dx * W * 0.12, st.y + dy * W * 0.12, W * 0.52, 0.2 + 0.75 * st.load * st.load, 0.55, Math.atan2(dy, dx));
    } else if (!st.started) blob(st, st.x, st.y, st.W * 0.5, 0.7);
    render(st);
    if (st.all) { const m = Math.ceil(8 * DPR); addMark(st.surf, st.rx + st.all[0] - m, st.ry + st.all[1] - m, st.all[2] - st.all[0] + 2 * m, st.all[3] - st.all[1] + 2 * m); }
  }

  // ---------- surfaces ----------
  // The page surface covers the whole document. Extra surfaces (e.g. a pinned/sticky section) get their own canvas
  // inside the element, so their prints stay put while it is pinned and blend with its text.
  const surfaces = [];
  function makeSurface(el, page) {
    const c = document.createElement('canvas');
    c.className = 'dirt-layer'; c.setAttribute('aria-hidden', 'true');
    el.prepend(c);
    const s = { el, page, canvas: c, ctx: c.getContext('2d'), W: 0, H: 0 };
    surfaces.push(s); fit(s);
    return s;
  }
  function fit(s) {
    const w = Math.ceil((s.page ? document.documentElement.scrollWidth : s.el.clientWidth) * DPR);
    const h = Math.ceil((s.page ? document.documentElement.scrollHeight : s.el.clientHeight) * DPR);
    if (w === s.W && h === s.H) return;
    const old = s.W ? (() => { const c = document.createElement('canvas'); c.width = s.W; c.height = s.H; c.getContext('2d').drawImage(s.canvas, 0, 0); return c; })() : null;
    s.W = w; s.H = h; s.canvas.width = w; s.canvas.height = h;
    s.canvas.style.width = w / DPR + 'px'; s.canvas.style.height = h / DPR + 'px';
    if (old) s.ctx.drawImage(old, 0, 0);
  }
  const fitAll = () => surfaces.forEach(fit);
  // page coordinates (CSS px) -> surface + device px inside it
  function locate(pageX, pageY, target) {
    let s = surfaces.find(q => !q.page && target && q.el.contains(target));
    if (!s && !target) s = surfaces.find(q => { if (q.page) return false; const r = q.el.getBoundingClientRect(); const x = pageX - scrollX, y = pageY - scrollY; return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
    if (s) { const r = s.el.getBoundingClientRect(); return { s, x: (pageX - scrollX - r.left) * DPR, y: (pageY - scrollY - r.top) * DPR }; }
    s = surfaces.find(q => q.page);
    return { s, x: pageX * DPR, y: pageY * DPR };
  }
  function clear() { surfaces.forEach(s => s.ctx.clearRect(0, 0, s.W, s.H)); }

  function init(opts = {}) {
    makeSurface(opts.layer || document.body, true);
    (opts.surfaces || []).forEach(el => makeSurface(el, false));
    const ro = new ResizeObserver(fitAll); ro.observe(document.body); surfaces.forEach(s => s.page || ro.observe(s.el));
    addEventListener('resize', fitAll);

    const r = rng(opts.seed || 42);
    ensurePrints(3, r);
    const more = () => ensurePrints(6, rng((opts.seed || 1) * 7 + 3));
    if (window.requestIdleCallback) requestIdleCallback(more, { timeout: 2500 }); else setTimeout(more, 500);

    const drawPresets = list => {
      for (const [x, y, kind, ang = 0, sz = 1] of list) {
        const L0 = locate(x, y, null), c = L0.s.ctx, X = L0.x, Y = L0.y;
        if (kind === 'smear') {
          const len = sz * 9 * PXCM, pad = 3 * PXCM;
          const ex = X + Math.cos(ang) * len, ey = Y + Math.sin(ang) * len;
          const st = startStroke(L0.s, X, Y, [Math.min(X, ex) - pad, Math.min(Y, ey) - pad, Math.abs(ex - X) + 2 * pad, Math.abs(ey - Y) + 2 * pad], r);
          for (let i = 1; i <= 40; i++) { const t = i / 40; strokeTo(st, X + Math.cos(ang) * len * t - Math.sin(ang) * Math.sin(t * 5) * 6 * DPR, Y + Math.sin(ang) * len * t + Math.cos(ang) * Math.sin(t * 5) * 6 * DPR); }
          endStroke(st);
        } else if (kind === 'palm') palmPrint(c, X, Y, ang, sz, r);
        else if (kind > 1) fingers(c, X, Y, ang, kind, r, 0.95);
        else dab(c, X, Y, ang, sz, r);
      }
    };
    if (opts.presets) {
      const list = opts.presets();
      drawPresets(list.filter(p => p[2] !== 'palm'));
      const later = () => drawPresets(list.filter(p => p[2] === 'palm'));
      setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(later, { timeout: 1500 }) : later()), 80);
    }

    let press = null;
    const skip = el => el.closest('button, input, textarea, select, [data-no-dirt]');   // clay can go anywhere else, links included
    const local = (e, surf) => {
      if (surf.page) return [e.pageX * DPR, e.pageY * DPR];
      const rr = surf.el.getBoundingClientRect(); return [(e.clientX - rr.left) * DPR, (e.clientY - rr.top) * DPR];
    };
    const viewRegion = surf => {                                   // the visible part of a surface, in its device px
      if (surf.page) return [scrollX * DPR, scrollY * DPR, innerWidth * DPR, innerHeight * DPR];
      const rr = surf.el.getBoundingClientRect();
      return [Math.max(0, -rr.left) * DPR, Math.max(0, -rr.top) * DPR, Math.min(innerWidth, rr.right) * DPR, Math.min(innerHeight, rr.bottom) * DPR];
    };
    document.addEventListener('pointerdown', e => {
      if (e.button > 0 || skip(e.target)) return;
      fitAll();
      const L0 = locate(e.pageX, e.pageY, e.target);
      press = { surf: L0.s, x: L0.x, y: L0.y, shift: e.shiftKey, touch: e.pointerType === 'touch', st: null, palm: false };
      busy = true;
      if (!press.touch) e.preventDefault();                       // no text selection while painting
      if (opts.onTouch) opts.onTouch();
      const p0 = press;
      p0.timer = setTimeout(() => {                               // press and hold: part of the palm comes down
        if (press !== p0 || p0.st) return;
        p0.palm = true; palmPrint(p0.surf.ctx, p0.x, p0.y, (Math.random() - 0.5) * 1.2, 0.85 + Math.random() * 0.3);
      }, 450);
    });
    document.addEventListener('pointermove', e => {
      if (!press || press.touch || press.palm) return;
      const [x, y] = local(e, press.surf);
      if (!press.st) {
        if (Math.hypot(x - press.x, y - press.y) < 4 * DPR) return;
        clearTimeout(press.timer);
        press.st = startStroke(press.surf, press.x, press.y, viewRegion(press.surf));
      }
      strokeTo(press.st, x, y);
    });
    const up = () => {
      if (!press) { busy = false; return; }
      clearTimeout(press.timer);
      if (press.st) endStroke(press.st);
      else if (!press.palm) {
        if (press.shift) fingers(press.surf.ctx, press.x, press.y, (Math.random() - 0.5) * 0.6, 4);
        else dab(press.surf.ctx, press.x, press.y, (Math.random() - 0.5) * 0.9, 0.95 + Math.random() * 0.15);
      }
      press = null; busy = false;
    };
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', () => { if (press) { clearTimeout(press.timer); if (press.st) endStroke(press.st); } press = null; busy = false; });
    return { clear };
  }

  window.DirtyHands = { init };
})();
