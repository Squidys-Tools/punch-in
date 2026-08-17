import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 18765);

const server = createServer(async (request, response) => {
  const name = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname.slice(1));
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    response.writeHead(400);
    response.end('invalid file name');
    return;
  }

  try {
    const content = await readFile(path.join(root, name));
    response.writeHead(200);
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});

server.listen(port, '127.0.0.1');
