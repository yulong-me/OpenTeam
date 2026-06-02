import assert from 'node:assert/strict';

const { createExpressProtocolHandler } = await import('../desktop/express-protocol.cjs');

function createMockExpressApp() {
  return (req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/echo?from=desktop') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      res.statusCode = 201;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        method: req.method,
        url: req.url,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }));
    });
  };
}

const handler = createExpressProtocolHandler(createMockExpressApp());
const response = await handler(new Request('opencouncil-api://local/api/echo?from=desktop', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ok: true }),
}));

assert.equal(response.status, 201);
assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
assert.deepEqual(await response.json(), {
  method: 'POST',
  url: '/api/echo?from=desktop',
  body: { ok: true },
});

console.log('desktop-express-protocol: ok');
