#!/usr/bin/env node
// Diagnostic for the SUNWEAVE chat backend.
// Run on the SAME machine that runs `node server.js` (your Mac, with internet):
//   node tools/doctor.js
// It prints config + connectivity tests for DeepSeek and the Gitee knowledge
// base, testing BOTH a direct connection and a proxy-aware one, so we learn
// exactly why the chat may be failing.

const fs = require('fs');
const path = require('path');
const { smartFetch, hasProxy, getProxyUrl } = require('../api/net');

function loadEnv(fp) {
  if (!fs.existsSync(fp)) return;
  fs.readFileSync(fp, 'utf8').split('\n').forEach(function (line) {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const i = t.indexOf('=');
    if (i === -1) return;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  });
}
loadEnv(path.join(__dirname, '..', '.env'));

const line = '='.repeat(64);
function log(x) { console.log(x); }

const PROXY_KEYS = ['CHAT_PROXY_URL', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];

// Try DeepSeek with the proxy env TEMPORARILY removed (i.e. a "direct" attempt).
async function testDirect(proxyUrl) {
  const saved = {};
  PROXY_KEYS.forEach(function (k) { saved[k] = process.env[k]; delete process.env[k]; });
  let out;
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.DEEPSEEK_API_KEY },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', messages: [{ role: 'user', content: 'ping' }] })
    });
    const d = await r.json().catch(function () { return {}; });
    out = r.ok
      ? { ok: true, msg: 'HTTP ' + r.status + ' — DeepSeek reachable directly' }
      : { ok: false, msg: 'HTTP ' + r.status + ' — ' + ((d.error && d.error.message) || JSON.stringify(d)) };
  } catch (e) {
    out = { ok: false, msg: 'cannot connect directly: ' + e.message };
  }
  PROXY_KEYS.forEach(function (k) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  });
  return out;
}

// Try DeepSeek the way the SERVER will (proxy-aware via smartFetch).
async function testServerStyle() {
  try {
    const r = await smartFetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.DEEPSEEK_API_KEY },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', messages: [{ role: 'user', content: 'ping' }] })
    });
    const d = await r.json().catch(function () { return {}; });
    return r.ok
      ? { ok: true, msg: 'HTTP ' + r.status + ' — DeepSeek reachable the same way server.js will call it' }
      : { ok: false, msg: 'HTTP ' + r.status + ' — ' + ((d.error && d.error.message) || JSON.stringify(d)) };
  } catch (e) {
    return { ok: false, msg: 'cannot connect: ' + e.message };
  }
}

async function testKB() {
  const url = process.env.KB_CSV_URL;
  if (!url) return { ok: false, msg: 'KB_CSV_URL is empty (KB disabled)' };
  try {
    const r = await smartFetch(url);
    const t = await r.text();
    return r.ok
      ? { ok: true, msg: 'HTTP ' + r.status + ', ' + t.length + ' chars, starts: ' + JSON.stringify(t.slice(0, 36)) }
      : { ok: false, msg: 'HTTP ' + r.status + ' — repo not public / wrong branch / file missing?' };
  } catch (e) {
    return { ok: false, msg: 'cannot fetch KB: ' + e.message };
  }
}

(async function () {
  log('\n' + line);
  log(' SUNWEAVE chat backend — diagnostic');
  log(line);

  log('\n[1] Environment');
  log('  CHAT_PROVIDER = ' + (process.env.CHAT_PROVIDER || '(default gemini)'));
  log('  KB_ENABLED     = ' + process.env.KB_ENABLED);
  log('  proxy env      = ' + (hasProxy() ? getProxyUrl() + '  <-- a proxy is configured' : '(none — Node will connect directly)'));

  log('\n[2] DeepSeek API — DIRECT (proxy env removed)');
  const dDirect = await testDirect();
  log('  ' + (dDirect.ok ? '✓' : '✗') + ' ' + dDirect.msg);

  log('\n[3] DeepSeek API — SERVER STYLE (proxy-aware, like server.js)');
  const dServer = await testServerStyle();
  log('  ' + (dServer.ok ? '✓' : '✗') + ' ' + dServer.msg);

  log('\n[4] Knowledge base (Gitee CSV)');
  const kb = await testKB();
  log('  ' + (kb.ok ? '✓' : '✗') + ' ' + kb.msg);

  log('\n' + line);
  log(' VERDICT');
  log(line);
  if (dServer.ok && kb.ok) {
    log('  All good. Restart `node server.js` and the chat should work.');
  } else if (!dDirect.ok && dServer.ok) {
    log('  The proxy was the problem. server.js now auto-uses your proxy,');
    log('  so just restart `node server.js` and the chat will work.');
  } else if (!dDirect.ok && !dServer.ok) {
    log('  DeepSeek is unreachable from this machine either way.');
    log('  - If [2] says "cannot connect": you likely have NO working internet here,');
    log('    or a firewall blocks api.deepseek.com. Check the key and network.');
    log('  - If [2] says "HTTP 401": your DEEPSEEK_API_KEY is invalid/expired.');
    log('  - If [2] says "HTTP 429": rate limited / out of balance, top up at platform.deepseek.com.');
  }
  if (!kb.ok) {
    log('  Knowledge base not reachable: open KB_CSV_URL in a browser —');
    log('  it must show CSV text (not a 404 or login page), and the Gitee repo');
    log('  must be PUBLIC with branch name matching the URL (master vs main).');
  }
  log(line + '\n');
})();
