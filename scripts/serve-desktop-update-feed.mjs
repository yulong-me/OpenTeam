#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const feedDir = resolve(root, process.argv[2] ?? 'release/mac-local-update-new');
const port = Number(process.env.PORT ?? process.env.DESKTOP_UPDATE_PORT ?? 7333);
const host = process.env.HOST ?? '127.0.0.1';

const mimeTypes = new Map([
  ['.yml', 'text/yaml'],
  ['.yaml', 'text/yaml'],
  ['.zip', 'application/zip'],
  ['.dmg', 'application/x-apple-diskimage'],
  ['.blockmap', 'application/octet-stream'],
]);

if (!existsSync(feedDir)) {
  throw new Error(`Update feed directory does not exist: ${feedDir}`);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  const pathname = url.pathname === '/' ? '/latest-mac.yml' : url.pathname;
  const filePath = resolve(feedDir, `.${pathname}`);

  if (!filePath.startsWith(feedDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes.get(extname(filePath)) ?? 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Serving desktop update feed at http://${host}:${port}/ from ${feedDir}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());

export const __filename = fileURLToPath(import.meta.url);
