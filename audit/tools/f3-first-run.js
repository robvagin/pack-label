// F3: the sample lot opens with every check green and exports unlocked, in both law profiles.
'use strict';
const { open, report } = require('./lib.js');
(async () => {
  const o = await open({ file: process.argv[2] });
  const r = await o.page.evaluate(() => {
    const P = window.PACKLABEL, A = P.api, out = {};
    const c = A.check();
    out.ok = c.ok; out.problems = c.problems.map(p => p.what); out.small = c.measures.sizes.small; out.xh = c.measures.xHeight; out.stroke = c.measures.stroke;
    out.notesHidden = document.querySelector('#notes').hidden;
    out.locked = [...document.querySelectorAll('#out button.act')].filter(b => b.disabled).map(b => b.textContent);
    A.set({ info: { law: 'eu' } }); out.euOk = A.check().ok;
    A.reset(); out.resetOk = A.check().ok;
    out.blocksOn = P.BLOCK_DEFS.filter(b => P.S.blocks[b.id].on).map(b => b.id);
    return out;
  });
  const rows = [
    { id: 'F3-ok', ok: r.ok && !r.problems.length, what: 'sample lot passes every check', detail: 'small ' + r.small + ' mm · x-height ' + r.xh + ' · stroke ' + r.stroke + ' · ' + r.problems.join(';') },
    { id: 'F3-unlocked', ok: r.notesHidden && r.locked.length === 0, what: 'no “Type needs adjusting” card, no export locked', detail: r.locked.join(', ') },
    { id: 'F3-eu', ok: r.euOk, what: 'passes in the EU profile too', detail: '' },
    { id: 'F3-reset', ok: r.resetOk, what: '“Start fresh” / reset lands on the passing sample', detail: r.blocksOn.join(',') },
    { id: 'F3-console', ok: o.errors.length === 0, what: 'no console errors', detail: o.errors.join(' | ') }
  ];
  await o.browser.close();
  process.exitCode = report(rows) ? 1 : 0;
})();
