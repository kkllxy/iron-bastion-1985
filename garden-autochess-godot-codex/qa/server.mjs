import { createReadStream, statSync } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);

function option(name, fallback) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const root = resolve(option('dir', process.env.WEB_ROOT ?? 'build/web'));
const host = option('host', process.env.WEB_HOST ?? '127.0.0.1');
const port = Number.parseInt(option('port', process.env.WEB_PORT ?? '5194'), 10);
const isolated =
  args.includes('--isolation') || /^(1|true|yes)$/i.test(process.env.WEB_CROSS_ORIGIN_ISOLATION ?? '');

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.ogg', 'audio/ogg'],
  ['.pck', 'application/octet-stream'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json'],
  ['.webp', 'image/webp'],
]);

function commonHeaders(filePath) {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': mimeTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  };
  if (isolated) {
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
    headers['Cross-Origin-Opener-Policy'] = 'same-origin';
    headers['Cross-Origin-Resource-Policy'] = 'same-origin';
  }
  return headers;
}

function safePath(urlString) {
  const url = new URL(urlString ?? '/', `http://${host}:${port}`);
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const candidate = resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  return candidate;
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!match) return null;
  const start = match[1] === '' ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(size - 1, Number(match[2]));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    return { invalid: true };
  }
  return { start, end };
}

const server = createServer(async (request, response) => {
  let filePath = safePath(request.url);
  if (!filePath) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
    return;
  }

  try {
    if ((await stat(filePath)).isDirectory()) filePath = resolve(filePath, 'index.html');
    await access(filePath);
    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) throw new Error('Not a file');

    const headers = { ...commonHeaders(filePath), 'Accept-Ranges': 'bytes' };
    const range = parseRange(request.headers.range, fileStat.size);
    if (range?.invalid) {
      response.writeHead(416, { ...headers, 'Content-Range': `bytes */${fileStat.size}` });
      response.end();
      return;
    }

    if (range) {
      const contentLength = range.end - range.start + 1;
      response.writeHead(206, {
        ...headers,
        'Content-Length': contentLength,
        'Content-Range': `bytes ${range.start}-${range.end}/${fileStat.size}`,
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(filePath, { start: range.start, end: range.end }).pipe(response);
      return;
    }

    response.writeHead(200, { ...headers, 'Content-Length': fileStat.size });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Godot Web export not found under ${root}. Run npm run export:web first.`);
  }
});

server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port} (cross-origin isolation: ${isolated})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
