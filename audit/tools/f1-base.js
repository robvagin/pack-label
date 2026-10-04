// F1: load three custom bases through the panel, check derived geometry, the pack view and the base export.
'use strict';
const { open, download, report, path, fs } = require('./lib.js');
const fc = require('./filecheck.js');
const OUT = process.env.OUT || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const rows = [];
  for (const name of ['square', 'tall', 'shaped']) {
    const o = await open({ file: process.argv[2] });
    const p = o.page;
    await p.evaluate(() => { window.PACKLABEL.S.ui.open = { 'panel:Base': 1, Base: 1 }; window.PACKLABEL.buildPanel(); });
    await p.setInputFiles('#groups fieldset input[type=file]', path.join(__dirname, 'bases', name + '.svg'));
    await p.waitForTimeout(700);
    const st = await p.evaluate(() => {
      const P = window.PACKLABEL, S = P.S, g = P.baseGeom(), c = P.api.check();
      return { lw: S.label.w, lh: S.label.h, on: S.base.custom.on, cut: S.base.custom.cut, w: +g.w.toFixed(2), h: +g.h.toFixed(2), field: S.base.custom.field, seat: P.stockFit(P.stockById(S.label.preset)), cutW: P.baseCutBox()[2] - P.baseCutBox()[0], probs: c.problems.map(x => x.kind + ':' + x.what), script: window.__baseScript };
    });
    const exp = { square: [110, 110, 'file'], tall: [64, 150, 'round'], shaped: [130, 100, 'file'] }[name];
    rows.push({ id: 'F1-' + name + '-size', ok: st.on === 1 && Math.abs(st.w - exp[0]) < .05 && Math.abs(st.h - exp[1]) < .05 && st.cut === exp[2], what: 'base size and cut source from file', detail: st.w + '×' + st.h + ' cut ' + st.cut });
    // label sits inside the free field
    const f = st.field, s = st.seat, wantX = f.x + (f.w - st.lw) / 2;
    rows.push({ id: 'F1-' + name + '-seat', ok: Math.abs(s.x - wantX) < .01 && (s.ok ? s.y >= f.y - .01 && s.y + st.lh <= f.y + f.h + .01 : st.probs.some(x => /free area of the base/.test(x))), what: 'label seat derived from the free field (centered; a label that does not fit is reported)', detail: 'seat x ' + s.x.toFixed(2) + ' want ' + wantX.toFixed(2) + ' y ' + s.y.toFixed(2) + ' fits ' + s.ok });
    await p.screenshot({ path: path.join(OUT, 'f1-' + name + '-pack.png') });
    const file = await download(p, () => p.evaluate(() => [...document.querySelectorAll('#out button.act')].find(b => /Download base for print/.test(b.textContent)).click()), OUT);
    fs.renameSync(file, path.join(OUT, 'f1-' + name + '-base-print.svg'));
    const v = fc.svg(path.join(OUT, 'f1-' + name + '-base-print.svg'));
    const svgText = fs.readFileSync(path.join(OUT, 'f1-' + name + '-base-print.svg'), 'utf8');
    const bleed = 2, expW = st.cutW + 2 * bleed;
    if (name === 'shaped') v.ok = v.why.every(w => /font not embedded: Georgia/.test(w));
    rows.push({ id: 'F1-' + name + '-export', ok: v.ok && v.cut && Math.abs(+v.size[0] - expW) < .6 && /<g id="Bleed">/.test(svgText) && /<g id="Artwork">/.test(svgText), what: 'base SVG export: XML ok, Cut and Bleed layers, size = trim + 2×bleed', detail: 'size ' + v.size.map(x => (+x).toFixed(2)).join('×') + ' ' + v.why.join(';') });
    rows.push({ id: 'F1-' + name + '-safe', ok: !st.script && !/<script|onload=|onclick=|foreignObject|example\.com|javascript:/i.test(svgText) && o.requests.length === 0, what: 'no script, handlers, foreign objects or network references survive', detail: 'requests ' + o.requests.length });
    if (name === 'shaped') rows.push({ id: 'F1-shaped-text', ok: st.probs.some(x => /live text/.test(x)), what: 'live text in the base file is reported', detail: st.probs.join(' | ') });
    // field outside the cut is reported
    const out2 = await p.evaluate(() => { const P = window.PACKLABEL; P.S.base.custom.field.x = -5; P.apply('base.custom.field.x'); return P.api.check().problems.map(x => x.what); });
    rows.push({ id: 'F1-' + name + '-field', ok: out2.some(x => /free field/.test(x)), what: 'free field past the cut line is reported', detail: '' });
    if (name === 'tall') {
      const t = await p.evaluate(() => { const P = window.PACKLABEL, S = P.S; S.base.custom.field = { x: 3, y: 60, w: 58, h: 60 }; S.label.preset = '52.5x29.7'; P.apply('label.preset'); const f = P.stockFit(P.stockById('52.5x29.7')); return { ok: f.ok, x: f.x, y: f.y, probs: P.api.check().problems.map(x => x.what) }; });
      rows.push({ id: 'F1-tall-fit', ok: t.ok && Math.abs(t.x - (3 + (58 - 52.5) / 2)) < .01 && !t.probs.some(x => /free area|free field/.test(x)), what: '52.5×29.7 label fits the 58 mm field of the tall base', detail: JSON.stringify(t) });
    }
    if (name === 'shaped') {
      await p.waitForTimeout(600);
      await p.reload();
      await p.waitForFunction(() => window.PACKLABEL && window.PACKLABEL.fontsWarm);
      const r = await p.evaluate(() => [window.PACKLABEL.S.base.custom.on, +window.PACKLABEL.baseGeom().w.toFixed(2), window.PACKLABEL.S.base.custom.name]);
      rows.push({ id: 'F1-shaped-reload', ok: r[0] === 1 && r[1] === 130, what: 'custom base survives a page reload (autosave)', detail: JSON.stringify(r) });
    }
    rows.push({ id: 'F1-' + name + '-console', ok: o.errors.filter(e => !/ERR_FILE_NOT_FOUND/.test(e)).length === 0, what: 'no console errors', detail: o.errors.join(' | ') });
    await o.browser.close();
  }
  // placeholder stays default and returns after a custom base
  const o = await open({ file: process.argv[2] });
  const d = await o.page.evaluate(() => { const P = window.PACKLABEL; const a = [P.baseGeom().w, P.S.base.custom.on]; return a; });
  rows.push({ id: 'F1-default', ok: d[0] === 126 && d[1] === 0, what: 'placeholder base is the default', detail: JSON.stringify(d) });
  await o.browser.close();
  process.exitCode = report(rows) ? 1 : 0;
})();
