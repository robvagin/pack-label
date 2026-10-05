// Validate exported files offline: PNG size and bit depth, ZPL ^GFA, TSPL BITMAP, SVG XML and embedded fonts.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

function png(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], ctype = b[25];
  let pHYs = null, idat = [], off = 8;
  while (off < b.length) {
    const len = b.readUInt32BE(off), type = b.toString('ascii', off + 4, off + 8);
    if (type === 'pHYs') pHYs = { x: b.readUInt32BE(off + 8), y: b.readUInt32BE(off + 12), unit: b[off + 16] };
    if (type === 'IDAT') idat.push(b.slice(off + 8, off + 8 + len));
    off += 12 + len;
  }
  // count distinct grey levels (RGBA 8-bit assumed for canvas output)
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = ctype === 6 ? 4 : ctype === 2 ? 3 : 1, stride = w * bpp + 1;
  const levels = new Set(); let prev = Buffer.alloc(w * bpp), cur = Buffer.alloc(w * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * stride], line = raw.slice(y * stride + 1, (y + 1) * stride);
    for (let i = 0; i < line.length; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) levels.add(cur[x * bpp]);
    [prev, cur] = [cur, prev];
  }
  return { w, h, depth, ctype, pHYs, levels: levels.size };
}

function zpl(file) {
  const s = fs.readFileSync(file, 'latin1'), out = { ok: true, why: [] };
  const m = s.match(/\^GFA,(\d+),(\d+),(\d+),\n?([0-9A-F]+)\n?\^FS/);
  if (!/^\^XA/.test(s) || !/\^XZ\s*$/.test(s)) { out.ok = false; out.why.push('no ^XA..^XZ'); }
  if (!m) { out.ok = false; out.why.push('no ^GFA block'); return out; }
  const b = +m[1], c = +m[2], d = +m[3], hex = m[4];
  out.pw = +(s.match(/\^PW(\d+)/) || [])[1]; out.ll = +(s.match(/\^LL(\d+)/) || [])[1];
  out.bytes = b; out.bpr = d; out.rows = b / d;
  if (b !== c) { out.ok = false; out.why.push('byte count != field count'); }
  if (hex.length !== 2 * b) { out.ok = false; out.why.push('hex length ' + hex.length + ' != 2*' + b); }
  if (d !== Math.ceil(out.pw / 8)) { out.ok = false; out.why.push('bytes per row != ceil(PW/8)'); }
  if (out.rows !== out.ll) { out.ok = false; out.why.push('rows ' + out.rows + ' != LL ' + out.ll); }
  let ones = 0; for (let i = 0; i < hex.length; i += 2) { let v = parseInt(hex.substr(i, 2), 16); while (v) { ones += v & 1; v >>= 1; } }
  out.blackShare = +(ones / (b * 8)).toFixed(4);
  return out;
}

function tspl(file) {
  const buf = fs.readFileSync(file), s = buf.toString('latin1'), out = { ok: true, why: [] };
  const m = s.match(/BITMAP (\d+),(\d+),(\d+),(\d+),(\d),/);
  if (!m) { out.ok = false; out.why.push('no BITMAP header'); return out; }
  const start = m.index + m[0].length, bpr = +m[3], h = +m[4];
  out.size = (s.match(/SIZE ([\d.]+) mm,([\d.]+) mm/) || []).slice(1);
  out.bpr = bpr; out.h = h;
  const tail = s.slice(start + bpr * h);
  if (!/^\r?\nPRINT 1,1\r?\n$/.test(tail)) { out.ok = false; out.why.push('data length does not match bpr*h (tail ' + JSON.stringify(tail.slice(0, 20)) + ')'); }
  let ones = 0; for (let i = start; i < start + bpr * h; i++) { let v = buf[i]; while (v) { ones += v & 1; v >>= 1; } }
  out.oneShare = +(ones / (bpr * h * 8)).toFixed(4);
  return out;
}

function svg(file) {
  const s = fs.readFileSync(file, 'utf8'), out = { ok: true, why: [] };
  // XML well-formedness via a tiny tag balance check (no DOM in Node): strip CDATA/comments, then balance tags.
  const body = s.replace(/<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<style>[\s\S]*?<\/style>/g, '<style/>');
  const stack = []; const re = /<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g; let m, last = 0;
  while ((m = re.exec(body))) {
    const between = body.slice(last, m.index); last = re.lastIndex;
    if (/[<>]/.test(between)) { out.ok = false; out.why.push('stray < or > near ' + JSON.stringify(between.slice(0, 40))); break; }
    if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i.test(between)) { out.ok = false; out.why.push('bare & in text'); break; }
    if (m[1]) { if (stack.pop() !== m[2]) { out.ok = false; out.why.push('unbalanced </' + m[2] + '>'); break; } }
    else if (!m[4]) stack.push(m[2]);
  }
  if (stack.length) { out.ok = false; out.why.push('unclosed ' + stack.join(',')); }
  if (/<script/i.test(s) || /\son\w+=/i.test(s)) { out.ok = false; out.why.push('script or event handler inside SVG'); }
  const faces = {}; (s.match(/@font-face\{font-family:'([^']+)';font-style:normal;font-weight:(\d+) (\d+)/g) || []).forEach(f => {
    const q = f.match(/'([^']+)'.*weight:(\d+) (\d+)/); (faces[q[1]] = faces[q[1]] || []).push([+q[2], +q[3]]);
  });
  const used = {}; (s.match(/<text[^>]*>/g) || []).forEach(t => {
    const fam = ((t.match(/font-family="([^"]*)"/) || [])[1] || '').replace(/&#39;|&apos;/g, "'");
    const first = (fam.match(/^'([^']+)'/) || [])[1] || fam.split(',')[0];
    const w = +((t.match(/font-weight="(\d+)"/) || [])[1] || 400);
    (used[first] = used[first] || new Set()).add(w);
  });
  out.faces = Object.keys(faces); out.used = {};
  Object.keys(used).forEach(f => {
    out.used[f] = [...used[f]];
    used[f].forEach(w => { if (!(faces[f] || []).some(r => w >= r[0] && w <= r[1])) { out.ok = false; out.why.push('font not embedded: ' + f + ' ' + w); } });
  });
  out.cmyk = (s.match(/device-cmyk\(/g) || []).length;
  out.cut = /<g id="Cut"/.test(s);
  const vb = (s.match(/viewBox="([^"]+)"/) || [])[1]; out.viewBox = vb; out.size = [(s.match(/width="([\d.]+)mm"/) || [])[1], (s.match(/height="([\d.]+)mm"/) || [])[1]];
  return out;
}

module.exports = { png, zpl, tspl, svg };
if (require.main === module) {
  const f = process.argv[2], ext = path.extname(f).slice(1);
  console.log(JSON.stringify(module.exports[ext](f), null, 1));
}
