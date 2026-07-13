// api/net.js
// Proxy-aware fetch helper using ONLY Node built-ins (no dependencies).
//
// Why this exists: Node's built-in global fetch (undici) does NOT honor the
// HTTP(S)_PROXY environment variables. On a machine behind a proxy (Clash,
// Shadowsocks, corporate gateway, etc.) `node server.js` therefore cannot reach
// api.deepseek.com or fetch the Gitee CSV — even though the user's browser can.
// That mismatch is the classic "site loads but the chat always fails" symptom.
//
// This module exports smartFetch(url, options):
//   - If no proxy env is set -> delegates straight to global fetch (unchanged).
//   - If a proxy IS set -> tunnels the request through it via HTTP CONNECT,
//     so outbound HTTPS works transparently. Callers keep using .ok / .status /
//     .text() / .json() exactly as with fetch.

const http = require('http');
const https = require('https');
const tls = require('tls');
const { URL } = require('url');

function getProxyUrl() {
  // CHAT_PROXY_URL is the explicit override:
  //   - set to a URL  => force that proxy
  //   - set to ''     => explicitly disable proxy (do not fall back to system env)
  //   - not set at all => auto-detect from standard HTTPS_PROXY / HTTP_PROXY env vars
  if (process.env.CHAT_PROXY_URL !== undefined) {
    return process.env.CHAT_PROXY_URL;
  }
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    ''
  );
}

function hasProxy() {
  return Boolean(getProxyUrl());
}

function isHttps(u) {
  try { return new URL(u).protocol === 'https:'; } catch (_) { return false; }
}

// Perform one HTTP/HTTPS request through an HTTP proxy via CONNECT tunneling.
function proxiedRequest(targetUrl, options) {
  return new Promise((resolve, reject) => {
    let target, proxy;
    try {
      target = new URL(targetUrl);
      proxy = new URL(getProxyUrl());
    } catch (e) {
      return reject(new Error('Invalid URL for proxy request: ' + e.message));
    }

    const method = (options.method || 'GET').toUpperCase();
    const headers = Object.assign({}, options.headers || {});
    const body = options.body;
    const targetPort = target.port || (isHttps(targetUrl) ? 443 : 80);

    const connectReq = http.request({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: 'CONNECT',
      path: target.hostname + ':' + targetPort,
      headers: { Host: target.hostname + ':' + targetPort }
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        return reject(new Error('Proxy CONNECT failed with HTTP ' + res.statusCode));
      }
      const onSocket = (s) => {
        const proto = isHttps(targetUrl) ? https : http;
        const clientReq = proto.request({
          host: target.hostname,
          port: targetPort,
          method,
          path: target.pathname + target.search,
          headers: Object.assign({ Host: target.hostname + ':' + targetPort }, headers),
          socket: s,
          agent: false
        }, (clientRes) => {
          let data = '';
          clientRes.on('data', (c) => { data += c; });
          clientRes.on('end', () => resolve({
            status: clientRes.statusCode,
            body: data,
            headers: clientRes.headers
          }));
        });
        clientReq.on('error', reject);
        if (body) clientReq.write(body);
        clientReq.end();
      };
      if (isHttps(targetUrl)) {
        const tlsSock = tls.connect({ socket, servername: target.hostname }, () => onSocket(tlsSock));
        tlsSock.on('error', reject);
      } else {
        onSocket(socket);
      }
    });

    connectReq.on('error', reject);
    connectReq.end();
  });
}

// fetch-like wrapper around the proxied request.
function proxiedFetch(url, options) {
  return proxiedRequest(url, options || {}).then(function (r) {
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: function () { return Promise.resolve(r.body); },
      json: function () { return Promise.resolve(JSON.parse(r.body)); }
    };
  });
}

// Public entry point: same signature/return shape as fetch.
function smartFetch(url, options) {
  if (hasProxy()) return proxiedFetch(url, options || {});
  return fetch(url, options || {});
}

module.exports = { smartFetch, hasProxy, getProxyUrl };
