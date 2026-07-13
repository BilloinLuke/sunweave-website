// Knowledge-base retrieval from any public CSV URL (Google Sheet, Gitee raw,
// or any host that serves plain CSV text).
//
// The site owner maintains a CSV as the "cloud knowledge base":
//   columns: Topic | Keywords | Answer   (header names are auto-detected,
//   Chinese or English both work)
// Examples of a source URL:
//   - Google Sheet "Publish to web" CSV link
//   - Gitee public repo raw file: https://gitee.com/USER/REPO/raw/master/kb.csv
//
// On every chat turn this module fetches the CSV (cached for `ttl` seconds),
// scores each row against the user's latest question with simple lexical
// matching, and returns the top-K relevant entries as text to be injected
// into the system prompt. No extra API calls, no cost.
//
// Usage (server-side):
//   const kb = require('./kb');
//   const ctx = await kb(latestUserQuery, { url, ttl, topK });
//   // ctx === '' when disabled / nothing matched / fetch failed

const net = require('./net');
const cache = { text: null, ts: 0 };

// Minimal CSV parser that handles quoted fields and embedded commas/newlines.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Lexical score: keyword-column matches weigh more than answer-column matches,
// and an exact full-phrase match in the keyword column gets a big boost.
function scoreRow(tokens, qNorm, rowNorm, kwNorm) {
  let score = 0;
  for (const t of tokens) {
    if (t.length < 3) continue; // ignore very short / weak tokens
    if (kwNorm && kwNorm.includes(t)) score += 3;
    else if (rowNorm.includes(t)) score += 1;
  }
  if (kwNorm && qNorm && kwNorm.includes(qNorm) && qNorm.length > 3) score += 6;
  return score;
}

async function fetchCSV(url, ttl) {
  const now = Date.now();
  if (cache.text && now - cache.ts < ttl * 1000) return cache.text;
  const r = await net.smartFetch(url);
  if (!r.ok) throw new Error('KB fetch failed: ' + r.status);
  const t = await r.text();
  cache.text = t;
  cache.ts = now;
  return t;
}

module.exports = async function retrieve(query, opts) {
  const url = opts && opts.url;
  if (!url) return '';
  let text;
  try {
    text = await fetchCSV(url, (opts && opts.ttl) || 300);
  } catch (e) {
    return ''; // degraded: skip KB rather than break the chat
  }

  const rows = parseCSV(text);
  if (rows.length < 2) return '';

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const findCol = (...names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const iTopic = findCol('topic', 'question', '问题', '主题', '关键词');
  const iKw = findCol('keywords', 'keyword', '关键词');
  const iAns = findCol('answer', '回答', '内容', 'content');
  if (iTopic === -1 && iAns === -1) return '';

  const qNorm = normalize(query);
  const tokens = qNorm.split(' ').filter(Boolean);

  const scored = [];
  for (let i = 1; i < rows.length; i++) {
    const topic = rows[i][iTopic] || '';
    const ans = rows[i][iAns] || '';
    if (!topic && !ans) continue;
    const kw = iKw !== -1 ? rows[i][iKw] || '' : '';
    const rowNorm = normalize(topic + ' ' + ans);
    const kwNorm = normalize(kw || topic);
    const sc = scoreRow(tokens, qNorm, rowNorm, kwNorm);
    if (sc >= 3) scored.push({ sc, topic, ans }); // require a real signal, avoid noise
  }
  if (!scored.length) return '';

  scored.sort((a, b) => b.sc - a.sc);
  const top = scored.slice(0, (opts && opts.topK) || 3);
  return top
    .map((r) => '- ' + (r.topic || 'Note') + ': ' + r.ans)
    .join('\n');
};
