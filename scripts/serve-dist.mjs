import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { containedPath, projectRoot } from './integrity.mjs';

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.onnx': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
};
export function createDistServer(root = containedPath(projectRoot, 'dist')) {
  return http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const requested = decodeURIComponent(request.url.split('?')[0]);
      // Host the exact same distribution under a second ordinary nested path.
      const prefix = '/nested/components/privacy-mask-video/';
      let relative = requested.startsWith(prefix) ? requested.slice(prefix.length) : requested.slice(1);
      if (!relative || relative.endsWith('/')) relative += 'demo/index.html';
      const file = await realpath(containedPath(root, relative));
      const resolvedRoot = await realpath(root);
      if (!file.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('Outside static root');
      const info = await stat(file);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      const headers = {
        'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
      };
      let start = 0;
      let end = info.size - 1;
      let status = 200;
      if (request.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!range || (!range[1] && !range[2])) {
          response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return;
        }
        if (!range[1]) start = Math.max(0, info.size - Number(range[2]));
        else {
          start = Number(range[1]);
          if (range[2]) end = Math.min(end, Number(range[2]));
        }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
          response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return;
        }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      }
      headers['Content-Length'] = String(Math.max(0, end - start + 1));
      response.writeHead(status, headers);
      if (request.method === 'HEAD' || !info.size) response.end();
      else {
        const stream = createReadStream(file, { start, end });
        stream.on('error', () => response.destroy());
        response.on('close', () => stream.destroy());
        stream.pipe(response);
      }
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 400).end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Fail immediately on a missing build; Playwright must not wait on an empty host.
  const root = containedPath(projectRoot, 'dist');
  await stat(containedPath(root, 'demo/index.html'));
  const server = createDistServer(root);
  server.listen(4173, 'localhost', () => console.log('Distribution: http://localhost:4173/demo/index.html'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
