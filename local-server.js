// Local test server: serves public/ and the room API with an in-memory store.
process.env.DT_LOCAL = '1';
const http = require('http'), fs = require('fs'), path = require('path');
const handler = require('./api/room.js');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/api/room') {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      req.body = data ? JSON.parse(data) : {};
      res.status = c => { res.statusCode = c; return res; };
      res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
      handler(req, res);
    });
    return;
  }
  const f = path.join(__dirname, 'public', u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream');
  res.end(fs.readFileSync(f));
}).listen(+process.env.PORT || 3111, () => console.log('local server on', process.env.PORT || 3111));
