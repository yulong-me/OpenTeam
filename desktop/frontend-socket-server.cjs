const fs = require('node:fs');
const http = require('node:http');
const { createRequire } = require('node:module');

const nextDir = process.env.NEXT_DIR || process.cwd();
const nextRequire = createRequire(`${nextDir}/package.json`);
const next = nextRequire('next');

const socketPath = process.env.FRONTEND_SOCKET_PATH;
if (!socketPath) {
  console.error('FRONTEND_SOCKET_PATH is required');
  process.exit(1);
}

if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);

const app = next({
  dev: false,
  dir: nextDir,
});
const handle = app.getRequestHandler();

app.prepare()
  .then(() => {
    const server = http.createServer((req, res) => handle(req, res));
    server.listen(socketPath, () => {
      console.log(`Frontend running on unix://${socketPath}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
