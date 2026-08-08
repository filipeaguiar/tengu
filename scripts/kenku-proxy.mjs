import http from 'node:http';
import { request as httpRequest } from 'node:http';
import { URL } from 'node:url';

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
const TARGET = process.env.KENKU_TARGET ?? 'http://127.0.0.1:3333';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN ?? 'https://filipeaguiar.github.io';

const server = http.createServer((req, res) => {
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

  const upstream = new URL(req.url, TARGET);
  const proxy = httpRequest(
    upstream,
    {
      method: req.method,
      headers: sanitizeHeaders(req.headers),
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
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Kenku proxy listening on http://127.0.0.1:${PORT}`);
  console.log(`Upstream: ${TARGET}`);
  console.log(`Allowed origin: ${ALLOW_ORIGIN}`);
});

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
  return result;
}

function filterResponseHeaders(headers) {
  const result = { ...headers };
  delete result['content-encoding'];
  delete result['transfer-encoding'];
  delete result['connection'];
  return result;
}
