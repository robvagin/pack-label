// Fuzz: lot-line parser, special characters in every lot field, every composition × stock × law profile.
// Fails on any exception, invalid SVG, markup leaking out of text, or a hang.
'use strict';
const { open, report } = require('./lib.js');
(async () => {
  const o = await open({ file: process.argv[2] });
  const r = await o.page.evaluate(() => {
    const P = window.PACKLABEL, A = P.api, S = P.S, out = { errors: [], bad: [] };
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const parts = ['Kenya', '1,5 kg', '250g', '0', '', ' ', ',', ';', '|', ' — ', '11.08.26', '31.02.26', '2026-08-11', 'L-0824', 'Loja', 'lot 7', 'natural', 'washed', 'Berries', 'x'.repeat(300), '<b>', '&amp;', '"q"', "'", '‮', '😀', 'Ґрунт', '١٢٣', '\u0000', '℮', '%', '../../', 'javascript:alert(1)'];
    const t0 = performance.now();
    for (let i = 0; i < 400; i++) {
      const n = 1 + Math.floor(rnd() * 8), line = Array.from({ length: n }, () => parts[Math.floor(rnd() * parts.length)]).join(rnd() < .5 ? ', ' : ' ');
      try { const p = P.parseLot(line); if (p.ok && typeof p.lot !== 'object') out.bad.push('parse ' + line); } catch (e) { out.errors.push('parseLot: ' + e.message + ' · ' + JSON.stringify(line).slice(0, 80)); }
    }
    out.parseMs = Math.round(performance.now() - t0);
    const evil = '<script>x</script> & "q" \'a\' <img src=x onerror=alert(1)> ]]> ‮😀 Ґ';
    const parser = new DOMParser();
    const valid = svg => { const d = parser.parseFromString(svg.replace(/^<\?xml[^>]*\?>/, ''), 'image/svg+xml'); return !d.getElementsByTagName('parsererror').length && !d.querySelector('script,[onerror]'); };
    A.reset();
    const lot = {}; ['name', 'legalName', 'madeIn', 'country', 'region', 'farm', 'altitude', 'variety', 'weight', 'batch', 'note', 'producer', 'storage', 'site'].forEach(k => lot[k] = evil + ' ' + k);
    A.set({ lot });
    let combos = 0;
    for (const law of ['eu', 'eu_ua']) for (const comp of P.COMPS.map(c => c.id)) for (const st of P.STOCK.map(s => s.id)) {
      combos++;
      try {
        S.info.law = law; S.layout.mode = comp; S.label.preset = st; P.apply('label.preset');
        const svg = P.svgDoc(true, true); if (!valid(svg)) out.bad.push('svg ' + law + ' ' + comp + ' ' + st);
        P.checkData();
        if (st !== '100x40') { const sh = P.sheetDoc(); if (!valid(sh)) out.bad.push('sheet ' + comp + ' ' + st); }
      } catch (e) { out.errors.push(law + ' ' + comp + ' ' + st + ': ' + e.message); }
    }
    out.combos = combos;
    const b = basePrintDoc(true); if (!valid(b)) out.bad.push('base svg');
    out.leaked = !!document.querySelector('#sheet script, #sheet [onerror], #groups script, #out script') || window.__x === 1;
    return out;
  });
  const rows = [
    { id: 'FZ-parse', ok: !r.errors.some(e => /^parseLot/.test(e)) && !r.bad.some(b => /^parse/.test(b)), what: '400 random lot lines parse without throwing', detail: r.parseMs + ' ms' },
    { id: 'FZ-render', ok: !r.errors.length, what: r.combos + ' composition × stock × profile renders without throwing', detail: r.errors.slice(0, 3).join(' | ') },
    { id: 'FZ-svg', ok: !r.bad.length, what: 'label, sheet and base SVG stay valid XML with markup in every lot field', detail: r.bad.slice(0, 5).join(' | ') },
    { id: 'FZ-dom', ok: !r.leaked && !o.errors.filter(e => !/ERR_FILE_NOT_FOUND/.test(e)).length, what: 'no markup leaks into the page, no console errors', detail: o.errors.slice(0, 3).join(' | ') }
  ];
  await o.browser.close();
  process.exitCode = report(rows) ? 1 : 0;
})();
