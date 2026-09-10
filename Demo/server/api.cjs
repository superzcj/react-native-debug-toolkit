// Deliberately synthetic shop data. Requests still travel through the real RN network stack.
const http = require('node:http');

function createDemoServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'X-Demo-API': 'atelier', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 65536) return reply(413, { error: 'Request too large' });
      }
      const input = body ? JSON.parse(body) : {};
      if (url.pathname === '/health') return reply(200, { ok: true, name: 'atelier-demo-api' });
      if (url.pathname === '/checkout' && req.method === 'POST') {
        if (input.scenario === 'sold-out') {
          return reply(409, {
            error: 'INVENTORY_CONFLICT',
            message: 'Linen Lounge Chair is out of stock.',
            productId: 'linen-chair', requested: 1, available: 0,
            suggestion: 'Keep the cart and ask the customer to choose another item.',
          });
        }
        return reply(201, { orderId: 'AT-1042', status: 'confirmed', ...input });
      }
      if (url.pathname === '/posts' && req.method === 'GET') return reply(200, [
        { id: 1, title: 'A quieter corner', body: 'Warm light, a comfortable chair, and room to think.' },
        { id: 2, title: 'Made for everyday living', body: 'Thoughtful objects for the spaces you spend time in.' },
      ]);
      if (url.pathname === '/posts' && req.method === 'POST') return reply(201, { ...input, id: 1042 });
      if (url.pathname === '/posts/1' && req.method === 'DELETE') return reply(200, { deleted: true });
      if (url.pathname === '/comments') return reply(200, [
        { id: 1, name: 'Mei · Verified buyer', body: 'Comfortable enough for an entire afternoon of reading.' },
        { id: 2, name: 'Alex · Verified buyer', body: 'The natural finish fits our apartment beautifully.' },
      ]);
      if (url.pathname === '/users/1') return reply(200, {
        name: 'Sam Chen', email: 'sam@example.com',
        address: { city: 'Shanghai' }, company: { name: 'Atelier Studio' }, ...input,
      });
      if (url.pathname === '/todos/1') return reply(200, { id: 1, title: 'Inspect a real XHR request', completed: true });
      return reply(404, { error: 'NOT_FOUND', path: url.pathname });
    } catch {
      if (!res.headersSent) reply(400, { error: 'INVALID_JSON' });
    }
  });
}

if (require.main === module) {
  const server = createDemoServer();
  server.listen(3801, '0.0.0.0', () => console.log('Atelier demo API: http://localhost:3801'));
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { createDemoServer };
