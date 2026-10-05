// Compare default exports of two builds: base print SVG, label SVG, sheet SVG and the pack view markup.
'use strict';
const { open } = require('./lib.js');
(async () => {
  const get = async f => { const o = await open({ file: f }); const r = await o.page.evaluate(() => { const P = window.PACKLABEL; P.render(); return { base: basePrintDoc(true), label: P.svgDoc(true, true), sheet: P.sheetDoc(), pack: document.querySelector('#sheet').innerHTML }; }); await o.browser.close(); return r; };
  const a = await get(process.argv[2]), b = await get(process.argv[3]);
  let bad = 0;
  Object.keys(a).forEach(k => { const same = a[k] === b[k]; if (!same) bad++; console.log((same ? 'SAME ' : 'DIFF ') + k + ' ' + a[k].length + ' / ' + b[k].length); });
  process.exitCode = bad ? 1 : 0;
})();
