const http = require('http');
const url = require('url');

// Import our consolidated handlers
const authHandler = require('./api/auth').default;
const githubHandler = require('./api/github').default;

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  console.log(`${req.method} ${pathname}`);
  
  // Mock Vercel request and response objects
  const mockReq = {
    method: req.method,
    url: pathname,
    headers: req.headers,
    query: parsedUrl.query,
    body: {}
  };
  
  const mockRes = {
    statusCode: 200,
    headers: {},
    setHeader: (key, value) => {
      mockRes.headers[key] = value;
    },
    status: (code) => {
      mockRes.statusCode = code;
      return mockRes;
    },
    json: (data) => {
      res.writeHead(mockRes.statusCode, {
        'Content-Type': 'application/json',
        ...mockRes.headers
      });
      res.end(JSON.stringify(data));
    },
    end: () => {
      res.writeHead(mockRes.statusCode, mockRes.headers);
      res.end();
    }
  };
  
  // Collect body data for POST requests
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    await new Promise(resolve => {
      req.on('end', () => {
        try {
          mockReq.body = JSON.parse(body);
        } catch (e) {
          mockReq.body = body;
        }
        resolve();
      });
    });
  }
  
  // Route to appropriate handler
  if (pathname.startsWith('/api/auth')) {
    await authHandler(mockReq, mockRes);
  } else if (pathname.startsWith('/api/github')) {
    await githubHandler(mockReq, mockRes);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  POST /api/auth - Login');
  console.log('  GET  /api/auth - Get current user');
  console.log('  POST /api/auth/refresh - Refresh token');
  console.log('  GET  /api/github/health - GitHub health check');
  console.log('  POST /api/github/connect - Connect GitHub repository');
  console.log('  GET  /api/github/connections/{project_id} - Get connections');
  console.log('  DELETE /api/github/connections/{project_id} - Delete connection');
});