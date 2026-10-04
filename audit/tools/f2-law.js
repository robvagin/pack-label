// F2: law profile switch. EU profile drops Ukrainian requirements; every problem carries its basis.
'use strict';
const { open, report } = require('./lib.js');
(async () => {
  const o = await open({ file: process.argv[2] });
  const r = await o.page.evaluate(() => {
    const P = window.PACKLABEL, A = P.api, S = P.S, out = {};
    out.def = S.info.law;
    const pass = () => { A.reset(); A.set({ blocks: { note: { on: 0 }, site: { on: 0 }, method: { on: 0 }, scales: { on: 0 } }, type: { scalePct: 114 } }); };
    // lot name off: UA requires it, EU does not
    pass(); A.set({ blocks: { name: { on: 0 } } });
    out.uaNoName = A.check(); 
    A.set({ info: { law: 'eu' } }); out.euNoName = A.check();
    // DSTU chip
    P.render(); out.euChips = [...document.querySelectorAll('#chips .chip')].map(c => c.textContent);
    A.set({ info: { law: 'eu_ua' } }); P.render(); out.uaChips = [...document.querySelectorAll('#chips .chip')].map(c => c.textContent);
    // basis on every problem, in both profiles
    A.reset(); A.set({ lot: { weight: '250', bestDate: '20.08.26', bestPrec: 'month', storage: '' } });
    out.uaProblems = A.check().problems;
    A.set({ info: { law: 'eu' } }); out.euProblems = A.check().problems; P.render();
    out.euNotes = document.querySelector('#notes').innerText;
    out.legalIdsEU = P.legalIds();
    A.set({ info: { law: 'eu_ua' } }); out.legalIdsUA = P.legalIds();
    out.panelRow = [...document.querySelectorAll('#groups .lbt')].some(e => e.textContent === 'Law profile');
    return out;
  });
  const rows = [];
  rows.push({ id: 'F2-default', ok: r.def === 'eu_ua', what: 'default profile stays EU + Ukraine', detail: r.def });
  rows.push({ id: 'F2-name', ok: !r.uaNoName.ok && r.uaNoName.problems.some(p => (p.items || []).indexOf('name') >= 0) && r.euNoName.ok, what: 'lot name required only in EU + Ukraine', detail: 'ua ok ' + r.uaNoName.ok + ' · eu ok ' + r.euNoName.ok });
  rows.push({ id: 'F2-dstu', ok: r.uaChips.some(t => /DSTU/.test(t)) && !r.euChips.some(t => /DSTU/.test(t)), what: 'DSTU 4518 check only in EU + Ukraine', detail: '' });
  const allBasis = ps => ps.filter(p => p.kind !== 'dropped').every(p => p.basis);
  rows.push({ id: 'F2-basis', ok: allBasis(r.uaProblems) && allBasis(r.euProblems), what: 'every problem names its basis', detail: r.euProblems.map(p => p.what + ' ← ' + p.basis).join(' | ') });
  rows.push({ id: 'F2-eu-no-ua', ok: !JSON.stringify(r.euProblems).match(/2639|DSTU/), what: 'EU profile cites no Ukrainian norm', detail: '' });
  rows.push({ id: 'F2-ua-cites', ok: /2639/.test(JSON.stringify(r.uaProblems)), what: 'EU + Ukraine cites Law 2639-VIII', detail: '' });
  rows.push({ id: 'F2-ui', ok: r.panelRow && /EU 1169\/2011/.test(r.euNotes), what: 'panel has the switch, check cards show the article', detail: r.euNotes.replace(/\n/g, ' / ').slice(0, 200) });
  rows.push({ id: 'F2-ids', ok: r.legalIdsEU.indexOf('name') < 0 && r.legalIdsUA.indexOf('name') >= 0, what: 'protected blocks follow the profile', detail: '' });
  rows.push({ id: 'F2-console', ok: o.errors.length === 0, what: 'no console errors', detail: o.errors.join(' | ') });
  await o.browser.close();
  process.exitCode = report(rows) ? 1 : 0;
})();
