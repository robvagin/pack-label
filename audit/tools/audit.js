// Regression gate for findings P-01..P-16. Run against the original build to see it red:
//   node audit/tools/audit.js [path/to/index.html]
'use strict';
const { open, download, report, path, fs } = require('./lib.js');
const fc = require('./filecheck.js');
const file = process.argv[2];
const OUT = process.env.OUT || path.join(require('os').tmpdir(), 'packlabel-audit');
fs.mkdirSync(OUT, { recursive: true });
const PASS_STATE = { blocks: { note: { on: 0 }, site: { on: 0 }, method: { on: 0 }, scales: { on: 0 } }, type: { scalePct: 114 }, lot: { region: 'Guji', altitude: '2000 m', storage: 'Keep dry' } };

(async () => {
  const rows = [], add = (id, ok, what, detail) => rows.push({ id, ok: !!ok, what, detail: detail || '' });
  let o;
  // P-01 XSS and prototype pollution through the URL and postMessage
  o = await open({ file, hash: '#lot=' + encodeURIComponent('{"label":{},"size":{"bleed":"<img src=x onerror=\\"window.__pwned=1\\">"}}') });
  add('P-01a', !(await o.page.evaluate(() => window.__pwned)), 'no script from #lot= payload');
  await o.browser.close();
  o = await open({ file, hash: '#lot=' + encodeURIComponent('{"__proto__":{"polluted":"yes"}}') });
  add('P-01b', !(await o.page.evaluate(() => ({}).polluted)), 'no prototype pollution from #lot=');
  await o.page.evaluate(() => window.postMessage({ packlabel: { cmd: 'set', args: [{ label: {}, size: { bleed: '<img src=x onerror="window.__pm=1">' } }] } }, '*'));
  await o.page.waitForTimeout(500);
  add('P-01c', !(await o.page.evaluate(() => window.__pm)), 'no script from a postMessage set');
  // P-02 chip text escaped (bypass sanitize by writing state directly)
  const chip = await o.page.evaluate(() => { const P = window.PACKLABEL; P.S.size.bleed = '<i id="chipx">x</i>'; P.render(); const r = !!document.getElementById('chipx'); P.S.size.bleed = 0; P.render(); return r; });
  add('P-02', !chip, 'chip text is escaped');
  await o.browser.close();

  o = await open({ file });
  const r = await o.page.evaluate((PASS_STATE) => {
    const P = window.PACKLABEL, A = P.api, S = P.S, out = {};
    out.p03 = P.parseLot('Kenya Nyeri, 1,5 kg, 11.08.26, L-0824').lot.weight;
    out.p04 = P.parseLot('Ecuador, Loja, washed, 250 g').lot;
    const pass = () => { A.reset(); A.set(JSON.parse(JSON.stringify(PASS_STATE))); };
    pass(); out.passOk = A.check().ok;
    pass(); S.info.legalOnBase = 1; P.apply('info.legalOnBase'); out.p05 = A.check().ok;
    pass(); A.set({ lot: { weight: '250' } }); out.p06 = A.check().ok;
    S.lot.bestDate = '20.08.26'; S.lot.bestPrec = 'month'; out.p07 = P.bestLine(S.lot);
    pass(); A.set({ blocks: { roasted: { on: 0 }, grind: { on: 0 } }, lot: { date: '11.08.26', bestDate: '31.08.26', bestPrec: 'month' } }); out.p08 = A.check().ok;
    pass(); const sp = P.sheetPlan(); out.p12 = { m: sp.m, skipped: sp.skipped };
    return out;
  }, PASS_STATE);
  add('P-03', r.p03 === '1,5 kg', '"1,5 kg" stays 1.5 kg', r.p03);
  add('P-04', r.p04.region === 'Loja' && !r.p04.batch, 'region "Loja" is not a batch code', JSON.stringify(r.p04));
  add('P-05', r.passOk && !r.p05, 'fixed info on the placeholder base locks export', 'baseline ok ' + r.passOk);
  add('P-06', !r.p06, 'net "250" without unit fails the check');
  add('P-07', r.p07 !== 'Best before end of 08.2026', 'month precision does not extend 20.08.26', r.p07);
  add('P-08', !r.p08, 'month-only best before with < 3 months shelf life fails');
  add('P-12', r.p12.m === 5 && r.p12.skipped > 0, 'A4 sheet honours the 5 mm printer margin', JSON.stringify(r.p12));
  // P-09/10/11 export files
  await o.page.evaluate((PASS_STATE) => { window.PACKLABEL.api.reset(); window.PACKLABEL.api.set(JSON.parse(JSON.stringify(PASS_STATE))); }, PASS_STATE);
  await o.page.waitForTimeout(400);
  const click = t => () => o.page.evaluate(t => { const b = [...document.querySelectorAll('#out button.act')].find(b => b.textContent.trim() === t); b.click(); }, t);
  const files = {};
  for (const t of ['PNG 203 ppi · thermal printer', 'ZPL · straight to the printer', 'TSPL · straight to the printer', 'Label SVG · separate Cut layer', 'SVG for a laser printer', 'Download base for print · SVG']) files[t] = await download(o.page, click(t), OUT);
  const png = fc.png(files['PNG 203 ppi · thermal printer']), zpl = fc.zpl(files['ZPL · straight to the printer']), tspl = fc.tspl(files['TSPL · straight to the printer']);
  const lsvg = fc.svg(files['Label SVG · separate Cut layer']), asvg = fc.svg(files['SVG for a laser printer']), bsvg = fc.svg(files['Download base for print · SVG']);
  add('X-png', png.w === 839 && png.h === 296 && png.levels === 2, 'PNG 203: 839×296 dots for 105×37 mm, 1-bit', png.w + '×' + png.h + ' levels ' + png.levels);
  add('X-zpl', zpl.ok && zpl.pw === 839 && zpl.ll === 296, 'ZPL ^GFA: byte count, bytes per row and rows match ^PW/^LL', JSON.stringify({ bytes: zpl.bytes, bpr: zpl.bpr, why: zpl.why }));
  add('X-tspl', tspl.ok && tspl.bpr === 105 && tspl.h === 296, 'TSPL BITMAP: data length = bpr × height', JSON.stringify(tspl.size));
  add('P-09', Math.abs(tspl.oneShare - (1 - zpl.blackShare)) < 1e-3, 'TSPL bits are the inverse of ZPL (0 = printed dot)', 'TSPL ones ' + tspl.oneShare + ' · ZPL black ' + zpl.blackShare);
  add('X-svg', lsvg.ok && asvg.ok && lsvg.cut && lsvg.cmyk > 0, 'label and A4 SVG: XML ok, fonts embedded, Cut layer, device-cmyk', [lsvg.why, asvg.why].join(' '));
  add('P-10', bsvg.ok && bsvg.cmyk > 0, 'base print SVG carries device-cmyk', 'device-cmyk count ' + bsvg.cmyk);
  add('P-11', png.pHYs && Math.round(png.pHYs.x * .0254) === 203, 'PNG declares 203 ppi in pHYs', JSON.stringify(png.pHYs));
  // P-14
  o.errors.length = 0;
  await o.page.click('#segUik button[data-uik="1.15"]');
  await o.page.waitForTimeout(300);
  add('P-14', !o.errors.length, 'interface scale button throws nothing', o.errors.join(' | '));
  add('X-net', o.requests.length === 0, 'zero network requests', o.requests.join(' '));
  await o.browser.close();

  // P-13 hostile config
  o = await open({ file });
  await o.page.setInputFiles('#fileCfg', path.join(__dirname, 'json', 'hostile.json'));
  await o.page.waitForTimeout(800);
  const h = await o.page.evaluate(() => ({ w: window.PACKLABEL.S.label.w, h: window.PACKLABEL.S.label.h, script: /<script/.test(window.PACKLABEL.api.render({}).svg) }));
  add('P-13', h.w === 105 && h.h === 37 && !h.script, 'hostile config cannot set label 0×−5 mm or inject <script>', JSON.stringify(h));
  await o.browser.close();

  // P-15 suggestion search finds the 114 % fix on the original sample lot
  o = await open({ file });
  await o.page.evaluate(() => { const A = window.PACKLABEL.api; A.reset(); A.set({ blocks: { scales: { on: 1 }, note: { on: 1 } }, type: { scalePct: 100 }, lot: { region: 'Guji, Hambela', altitude: '1950–2100 m', storage: 'Store in a dry place', site: 'roastery.example' } }); });
  await o.page.waitForFunction(() => { const s = document.querySelector('#noteSolution'); return s && !/^Checking/.test(s.textContent); }, null, { timeout: 90000 });
  const sol = await o.page.evaluate(() => document.querySelector('#noteSolution').textContent);
  add('P-15', /Apply suggestion/.test(sol), 'suggestion search finds a passing change for the old sample', sol.slice(0, 120));
  await o.browser.close();

  // P-16 narrow window: export panel reachable
  o = await open({ file, viewport: { width: 1024, height: 768 } });
  const n = await o.page.evaluate(() => { const b = [...document.querySelectorAll('#out button.act')].find(b => /PNG 203/.test(b.textContent)); b.scrollIntoView(); const r = b.getBoundingClientRect(); return { top: Math.round(r.top), vh: innerHeight, panelH: Math.round(document.querySelector('#panel').getBoundingClientRect().height) }; });
  add('P-16', n.top >= 0 && n.top < n.vh && n.panelH <= n.vh, 'at 1024 px the export buttons scroll into view, panel fits the viewport', JSON.stringify(n));
  await o.browser.close();

  process.exitCode = report(rows) ? 1 : 0;
})();
