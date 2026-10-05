// Build the same HTML that expPdf() sends to the print dialog and print it with Chromium's PDF engine.
'use strict';
const { open } = require('./lib.js');
const out = process.argv[2] || '/tmp/label.pdf';
(async () => {
  const o = await open({ file: process.argv[3] });
  const html = await o.page.evaluate(() => {
    const A = window.PACKLABEL.api; A.set({ blocks: { note: { on: 0 }, site: { on: 0 }, method: { on: 0 }, scales: { on: 0 } }, type: { scalePct: 114 } });
    const S = window.PACKLABEL.S, W = S.size.w, H = S.size.h, svg = window.PACKLABEL.svgDoc(false, false).replace(/^<\?xml[^>]*\?>\s*/, '');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:' + W + 'mm ' + H + 'mm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:' + W + 'mm;height:' + H + 'mm}</style></head><body>' + svg + '</body></html>';
  });
  const p2 = await o.ctx.newPage();
  await p2.setContent(html);
  await p2.evaluate(() => document.fonts.ready);
  await p2.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
  await o.browser.close();
  console.log('pdf', out);
})();
