import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PORT || 5177);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const resolved = path.resolve(root, decoded.replace(/^\/+/, ''));
  return resolved.startsWith(root + path.sep) || resolved === root ? resolved : null;
}

const server = http.createServer(async (request, response) => {
  const requestPath = request.url === '/' ? '/tests/JobAutofill.ScannerFixtures/runner.html' : request.url || '/';
  const localPath = safePath(requestPath);
  if (!localPath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const body = await fs.readFile(localPath);
    const type = contentTypes[path.extname(localPath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type });
    response.end(body);
  } catch (error) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Not found: ${requestPath}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Scanner fixture runner: http://127.0.0.1:${port}/tests/JobAutofill.ScannerFixtures/runner.html`);
  console.log('Press Ctrl+C to stop.');
});
