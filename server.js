const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.opus': 'audio/ogg',
  '.webp': 'image/webp',
  '.css': 'text/css',
};

function serve(req, res) {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  let decoded;
  try {
    decoded = decodeURIComponent(p);
  } catch (_) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  // Dev-only trees are never shipped or served.
  const rel = path.normalize(decoded).replace(/^[\\/]+/, '');
  const top = rel.split(/[\\/]/)[0];
  if (top === 'tests' || top === 'tools' || top === 'node_modules') {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const file = path.join(ROOT, path.normalize(decoded));
  if ((file !== ROOT && !file.startsWith(ROOT + path.sep)) || path.relative(ROOT, file).split(path.sep).some(part => part.startsWith('.'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(serve);
server.listen(PORT, () => console.log(`Hollow Feast listening on port ${PORT}`));

module.exports = server;
