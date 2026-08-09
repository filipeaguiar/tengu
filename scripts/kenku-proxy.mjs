import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

const SOCKET = process.env.TS_SOCKET ?? '/home/deck/.tailscale/tailscaled.sock';
const KENKU_TARGET = process.env.KENKU_TARGET ?? 'http://127.0.0.1:3333';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN ?? 'https://filipeaguiar.github.io';
const PORT = Number.parseInt(process.env.PORT ?? (process.env.PROXY_HTTPS ? '8788' : '8787'), 10);
const ENABLE_HTTPS = truthy(process.env.PROXY_HTTPS);
const CERT_DIR = process.env.CERT_DIR ?? path.join(os.homedir(), '.local/share/tailscale/certs');

fs.mkdirSync(CERT_DIR, { recursive: true });

const hostname = ENABLE_HTTPS ? await resolveHostname() : '';
const certPaths = ENABLE_HTTPS ? await ensureCertificate(hostname) : null;

const handler = (req, res) => {
  const origin = req.headers.origin ?? '';
  const allowed = origin === ALLOW_ORIGIN ? origin : ALLOW_ORIGIN;

  setCors(res, allowed);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!req.url) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing URL' }));
    return;
  }

  const upstream = new URL(req.url, KENKU_TARGET);
  const proxyRequest = upstream.protocol === 'https:' ? httpsRequest : httpRequest;
  const proxy = proxyRequest(
    upstream,
    {
      method: req.method,
      headers: sanitizeHeaders(req.headers),
      rejectUnauthorized: false,
    },
    (upstreamRes) => {
      setCors(res, allowed);
      res.writeHead(upstreamRes.statusCode ?? 502, {
        ...filterResponseHeaders(upstreamRes.headers),
      });
      upstreamRes.pipe(res);
    },
  );

  proxy.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Proxy error' }));
  });

  req.pipe(proxy);
};

const server = ENABLE_HTTPS
  ? https.createServer(
      {
        cert: fs.readFileSync(certPaths.certPath),
        key: fs.readFileSync(certPaths.keyPath),
      },
      handler,
    )
  : http.createServer(handler);

server.listen(PORT, '127.0.0.1', () => {
  const proto = ENABLE_HTTPS ? 'https' : 'http';
  console.log(`Kenku proxy listening on ${proto}://127.0.0.1:${PORT}`);
  console.log(`Upstream: ${KENKU_TARGET}`);
  console.log(`Allowed origin: ${ALLOW_ORIGIN}`);
  if (ENABLE_HTTPS) console.log(`TLS host: ${hostname}`);
});

async function resolveHostname() {
  const json = execFileSync('/home/deck/.local/bin/tailscale', ['--socket', SOCKET, 'status', '--json'], {
    encoding: 'utf8',
  });
  const status = JSON.parse(json);
  const dnsName = status?.Self?.DNSName || status?.DNSName;
  if (!dnsName) throw new Error('Could not determine Tailscale DNS name.');
  return String(dnsName).replace(/\.$/, '');
}

async function ensureCertificate(dnsName) {
  const safe = dnsName.replace(/[^A-Za-z0-9.-]/g, '_');
  const certPath = path.join(CERT_DIR, `${safe}.crt`);
  const keyPath = path.join(CERT_DIR, `${safe}.key`);

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    execFileSync(
      '/home/deck/.local/bin/tailscale',
      ['--socket', SOCKET, 'cert', '--cert-file', certPath, '--key-file', keyPath, dnsName],
      { stdio: 'inherit' },
    );
  }

  return { certPath, keyPath };
}

function truthy(value) {
  return value === '1' || value === 'true' || value === 'yes';
}

function setCors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

function sanitizeHeaders(headers) {
  const result = { ...headers };
  delete result.host;
  delete result.origin;
  delete result.referer;
  delete result['content-length'];
  delete result['accept-encoding'];
  return result;
}

function filterResponseHeaders(headers) {
  const result = { ...headers };
  delete result['content-encoding'];
  delete result['transfer-encoding'];
  delete result['connection'];
  return result;
}
