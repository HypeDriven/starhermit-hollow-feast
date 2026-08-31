const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.opus': 'audio/ogg',
};

function serve(req, res) {
  let p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(p).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(serve);
server.listen(PORT, () => console.log(`Hollow Feast listening on port ${PORT}`));

module.exports = server;
