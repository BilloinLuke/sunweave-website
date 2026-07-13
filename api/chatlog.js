// api/chatlog.js
// Per-IP buyer chat logging, persisted to Gitee via the Gitee Contents API.
//
// Design
// ------
// - Each buyer IP gets ONE csv file: <GITEE_LOG_PATH>/<ip>.csv
//   (default: chat-logs/<ip>.csv inside the configured Gitee repo).
// - Every visit from that IP is APPENDED to the same file, so one IP = one
//   consolidated table of the whole conversation history.
// - Columns: timestamp, ip, role, message   (role = user | assistant)
// - Zero dependencies. Uses api/net.js so it honors CHAT_PROXY_URL on macOS.
// - Failures are best-effort and TIME-BOXED: logging can NEVER break or
//   noticeably slow down the buyer's chat response.
//
// Required env (see .env): GITEE_TOKEN, GITEE_LOG_REPO, GITEE_LOG_BRANCH,
// GITEE_LOG_PATH, CHAT_LOG_ENABLED, CHAT_LOG_TIMEOUT.

const net = require('./net');

const GITEE_API = 'https://gitee.com/api/v5';

function enabled() {
  return (process.env.CHAT_LOG_ENABLED !== 'false') && !!process.env.GITEE_TOKEN;
}
function token() {
  return process.env.GITEE_TOKEN || '';
}
function repoParts() {
  const r = (process.env.GITEE_LOG_REPO || 'luke888888/sunweave-kb').trim();
  const i = r.indexOf('/');
  return i === -1 ? { owner: r, name: '' } : { owner: r.slice(0, i), name: r.slice(i + 1) };
}
function branch() {
  return (process.env.GITEE_LOG_BRANCH || 'master').trim();
}
function baseDir() {
  return (process.env.GITEE_LOG_PATH || 'chat-logs').trim().replace(/\/+$/, '');
}

// In-memory cache of file state so a turn only needs 1 write (not read+write)
// within the same process. On serverless (Vercel) each invocation is fresh,
// so it falls back to read-then-write — still correct, just one extra call.
const cache = new Map(); // path -> { sha, content }

// Serialize writes per IP so two messages from the same IP can't clobber.
const queues = {};
function enqueue(ip, fn) {
  const k = 'q:' + ip;
  const prev = queues[k] || Promise.resolve();
  const next = prev.then(fn, fn);
  queues[k] = next.catch(() => {});
  return queues[k];
}

function getIp(req) {
  let ip = '';
  if (req && req.headers) {
    const xff = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
    if (xff) ip = String(xff).split(',')[0].trim();
  }
  if (!ip && req && req.socket) ip = req.socket.remoteAddress || '';
  if (!ip) ip = 'unknown';
  return ip;
}

function safeIp(ip) {
  return String(ip || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

// CSV cell escaping + defense against formula injection when opened in Excel
// (a buyer typing "=cmd" should not become a live formula).
function csvCell(s) {
  s = String(s == null ? '' : s);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function b64enc(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}
function b64dec(b64) {
  return Buffer.from(b64 || '', 'base64').toString('utf-8');
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + ms + 'ms')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function giteeGetFile(filePath) {
  const { owner, name } = repoParts();
  const url =
    GITEE_API + '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name) +
    '/contents/' + filePath +
    '?access_token=' + encodeURIComponent(token()) +
    '&ref=' + encodeURIComponent(branch());
  const res = await net.smartFetch(url, { method: 'GET' });
  console.error('[chatlog] GET', filePath, 'status=', res.status);
  if (res.status === 404) {
    const t = await res.text().catch(() => '');
    console.error('[chatlog] GET 404 body:', t.slice(0, 300));
    return null;
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[chatlog] GET', filePath, 'status=', res.status, 'body=', t.slice(0, 300));
    throw new Error('GET ' + res.status + ' ' + t.slice(0, 200));
  }
  const data = await res.json().catch(() => ({}));
  console.error('[chatlog] GET', filePath, 'data keys=', Object.keys(data).join(','), 'sha=', data && data.sha, 'hasContent=', !!(data && data.content));
  return data;
}

async function giteeGetDirFile(dirPath, fileName) {
  // Fallback: if direct file GET fails, list the parent directory and pick the file.
  const { owner, name } = repoParts();
  const url =
    GITEE_API + '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name) +
    '/contents/' + dirPath +
    '?access_token=' + encodeURIComponent(token()) +
    '&ref=' + encodeURIComponent(branch());
  console.error('[chatlog] DIR', dirPath, 'looking for', fileName);
  const res = await net.smartFetch(url, { method: 'GET' });
  console.error('[chatlog] DIR', dirPath, 'status=', res.status);
  if (!res.ok) return null;
  const data = await res.json().catch(() => []);
  if (!Array.isArray(data)) return null;
  const f = data.find(function (x) { return x && x.name === fileName; });
  console.error('[chatlog] DIR found', fileName, '=', !!f, 'sha=', f && f.sha);
  return f || null;
}

async function giteeGetRaw(filePath) {
  // Fetch the raw file content (used when directory listing gives SHA but no content).
  const { owner, name } = repoParts();
  const url = 'https://gitee.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name) +
    '/raw/' + encodeURIComponent(branch()) + '/' + filePath +
    '?access_token=' + encodeURIComponent(token());
  console.error('[chatlog] RAW', filePath);
  const res = await net.smartFetch(url, { method: 'GET' });
  console.error('[chatlog] RAW', filePath, 'status=', res.status);
  if (!res.ok) return null;
  return res.text().catch(() => null);
}

async function giteeGet(filePath) {
  const data = await giteeGetFile(filePath);
  if (data && data.sha && data.content) return data;

  // Fallback: try to read the directory listing to obtain the SHA / content.
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash > 0) {
    const dir = filePath.slice(0, lastSlash);
    const name = filePath.slice(lastSlash + 1);
    const f = await giteeGetDirFile(dir, name);
    if (f && f.sha) {
      if (f.content) return f;
      // Directory listing gives SHA but not content. Re-fetch the file with the SHA we now know.
      const full = await giteeGetFile(filePath);
      if (full && full.sha && full.content) return full;
      // Still no content from direct read — return the directory entry so we at least have a SHA.
      return f;
    }
  }
  return data;
}

async function giteePut(filePath, contentB64, message, sha) {
  const { owner, name } = repoParts();
  const url = GITEE_API + '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name) + '/contents/' + filePath;
  const body = {
    access_token: token(),
    content: contentB64,
    message: message,
    branch: branch()
  };
  if (sha) body.sha = sha;
  // Gitee: POST creates a new file, PUT updates an existing file.
  // Using the wrong method for an existing file produces "400 文件名已存在".
  const method = sha ? 'PUT' : 'POST';
  const res = await net.smartFetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const err = new Error(method + ' ' + res.status + ' ' + t.slice(0, 200));
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function loadEntry(filePath, data) {
  // Turn a Gitee contents API response (or fallback directory entry) into
  // { sha, content }. If we have SHA but no content, fetch the raw file.
  let sha = data && data.sha;
  let content = data && data.content ? b64dec(data.content) : null;
  if (sha && !content) {
    content = await giteeGetRaw(filePath);
    console.error('[chatlog] raw content', filePath, content ? 'ok' : 'failed');
  }
  if (!content) {
    content = 'timestamp,ip,role,message\n';
    sha = null;
  }
  return { sha, content };
}

// Append one chat turn (the buyer's question + the assistant's reply) to the
// IP's CSV. Wrapped by logTurn() which time-boxes it so chat never waits long.
async function appendTurn({ ip, userText, assistantText, ok }) {
  if (!enabled()) return;
  const rawIp = ip || 'unknown';
  const fileIp = safeIp(rawIp);
  const filePath = baseDir() + '/' + fileIp + '.csv';
  const ts = new Date().toISOString();
  let lines = ts + ',' + csvCell(rawIp) + ',user,' + csvCell(userText || '') + '\n';
  if (assistantText) lines += ts + ',' + csvCell(rawIp) + ',assistant,' + csvCell(assistantText) + '\n';

  await enqueue(ip, async () => {
    let entry = cache.get(filePath);
    if (!entry) {
      try {
        const data = await giteeGet(filePath);
        entry = await loadEntry(filePath, data);
      } catch (e) {
        console.error('[chatlog] read failed:', e.message);
        return; // skip this turn; try again next message
      }
      cache.set(filePath, entry);
    }

    let content = entry.content;
    if (content && !content.endsWith('\n')) content += '\n';
    content += lines;
    const b64 = b64enc(content);

    try {
      const r = await giteePut(filePath, b64, 'chat log ' + ip + ' ' + (ok ? 'ok' : 'err'), entry.sha || undefined);
      cache.set(filePath, { sha: (r && r.content && r.content.sha) || entry.sha, content });
    } catch (e) {
      cache.delete(filePath); // drop stale cache so the next turn re-reads
      const isConflict = e.status === 409 || /409|conflict/i.test(e.message || '');
      const isDuplicate = e.status === 400 && /文件名已存在|already.exists/i.test(e.message || '');
      if (isConflict || isDuplicate) {
        // someone else wrote first / file appeared since last read -> re-read and retry once
        try {
          const data = await giteeGet(filePath);
          const reEntry = await loadEntry(filePath, data);
          let c = reEntry.content;
          if (c && !c.endsWith('\n')) c += '\n';
          c += lines;
          const rr = await giteePut(filePath, b64enc(c), 'chat log ' + ip + ' retry', reEntry.sha || undefined);
          cache.set(filePath, { sha: (rr && rr.content && rr.content.sha) || reEntry.sha, content: c });
        } catch (e2) {
          console.error('[chatlog] retry failed:', e2.message);
        }
      } else {
        console.error('[chatlog] write failed:', filePath, e.message);
      }
    }
  });
}

// Public: time-boxed, never throws. Call from the chat handler.
async function logTurn(meta) {
  if (!enabled()) return;
  const ms = parseInt(process.env.CHAT_LOG_TIMEOUT || '5000', 10);
  try {
    await withTimeout(appendTurn(meta), ms);
  } catch (e) {
    console.error('[chatlog] log skipped (timeout/error):', e.message);
  }
}

module.exports = { appendTurn, logTurn, getIp, enabled };
