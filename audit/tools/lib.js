// Shared harness: open index.html in headless Chromium, collect errors, capture downloads.
'use strict';
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..', '..');

async function open(opts) {
  opts = opts || {};
  const file = path.resolve(opts.file || path.join(ROOT, 'index.html'));
  const browser = await pw.chromium.launch(opts.exe ? { executablePath: opts.exe } : {});
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', r => { const u = r.url(); if (!/^(file|data|blob|about):/.test(u)) requests.push(u); });
  page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
  const url = 'file://' + file + (opts.hash || '');
  await page.goto(url);
  await page.waitForFunction(() => window.PACKLABEL && window.PACKLABEL.fontsWarm, null, { timeout: 30000 });
  await page.waitForTimeout(opts.settle || 300);
  return { browser, ctx, page, errors, requests, url };
}

// Run an export button by label text and return the saved file path.
async function download(page, trigger, outDir) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), trigger()]);
  const p = path.join(outDir, dl.suggestedFilename());
  await dl.saveAs(p);
  return p;
}

function report(rows) {
  let bad = 0;
  rows.forEach(r => { if (!r.ok) bad++; console.log((r.ok ? 'PASS ' : 'FAIL ') + r.id + ' · ' + r.what + (r.detail ? ' · ' + r.detail : '')); });
  console.log('---- ' + (rows.length - bad) + '/' + rows.length + ' pass');
  return bad;
}

module.exports = { open, download, report, ROOT, fs, path };
