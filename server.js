// Cloud City — Secure Backend Server (Zero Dependencies)
// Run with: node server.js
// Or set environment variables: PORT=3000 ADMIN_TOKEN=your_secure_token node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'cloudcity_secret_token_2026';
const DATA_DIR = path.join(__dirname, 'data');
const RESIDENTS_FILE = path.join(DATA_DIR, 'residents.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory cache + disk persistence
let residents = [{ n: 'the_mayor', lvl: 3 }];
let state = {
  friends: {},
  votes: {},
  claims: [],
  mall: 0
};
let settings = {
  claimText: 'Claim it on Instagram',
  claimUrl: 'https://www.instagram.com/cloudcity/',
  claimEnabled: true,
  claimDesc: 'Comment HOUSE under our latest post and your home goes up here.'
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    }
  } catch (err) {
    console.error('Could not load settings.json:', err.message);
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save settings.json:', err.message);
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Could not load state.json:', err.message);
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save state.json:', err.message);
  }
}

function loadResidents() {
  try {
    if (fs.existsSync(RESIDENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(RESIDENTS_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        residents = data;
        return;
      }
    }
  } catch (err) {
    console.error('Could not load residents.json:', err.message);
  }

  // Fallback: the_mayor only
  residents = [{ n: 'the_mayor', lvl: 3 }];
  saveResidents();
}

function saveResidents() {
  try {
    fs.writeFileSync(RESIDENTS_FILE, JSON.stringify(residents, null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save residents.json:', err.message);
  }
}

loadState();
loadResidents();
loadSettings();

// MIME Types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Parse Cookies Helper
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers['cookie'];
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(c => {
    const parts = c.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

// Request Body Parser
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Token Verification
function verifyAuth(req, parsedUrl) {
  const authHeader = req.headers['authorization'] || '';
  const xToken = req.headers['x-admin-token'] || '';
  const cookies = parseCookies(req);

  // 1. Bearer Token
  if (authHeader.startsWith('Bearer ')) {
    if (authHeader.slice(7).trim() === ADMIN_TOKEN) return true;
  }
  // 2. Direct Auth header or X-Admin-Token
  if (authHeader === ADMIN_TOKEN || xToken === ADMIN_TOKEN) return true;

  // 3. HTTP Basic Auth (user can be "admin" and password = ADMIN_TOKEN)
  if (authHeader.startsWith('Basic ')) {
    try {
      const creds = Buffer.from(authHeader.slice(6), 'base64').toString('utf8').split(':');
      const password = creds[1] || creds[0];
      if (password === ADMIN_TOKEN) return true;
    } catch {}
  }

  // 4. Session cookie
  if (cookies.admin_token === ADMIN_TOKEN) return true;

  // 5. Query parameter (?token=... or ?key=...)
  if (parsedUrl) {
    const qToken = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('key');
    if (qToken && qToken === ADMIN_TOKEN) return true;
  }

  return false;
}

// Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  // --- RESTRICT ADMIN PAGE ACCESS ---
  if (pathname === '/admin' || pathname === '/admin.html') {
    if (!verifyAuth(req, parsedUrl)) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="Cloud City Admin Area"',
        'Content-Type': 'text/html; charset=utf-8'
      });
      res.end(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>401 Unauthorized — Cloud City</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{background:#17302a;color:#f3f7f6;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;box-sizing:border-box}
.box{text-align:center;padding:36px 30px;background:#0f201c;border-radius:14px;border:1px solid rgba(255,255,255,0.1);max-width:420px;box-shadow:0 10px 40px rgba(0,0,0,0.5)}
h1{color:#f6c81e;margin:0 0 12px;font-size:24px}
p{color:#b8ccc7;font-size:14px;line-height:1.5;margin:0 0 20px}
a{display:inline-block;background:#f6c81e;color:#17302a;text-decoration:none;font-weight:700;padding:10px 20px;border-radius:8px;font-size:14px}
</style>
</head>
<body>
<div class="box">
  <h1>🔒 Access Restricted</h1>
  <p>The Resident Manager is restricted to authorized town administrators only. Valid credentials or secret token are required.</p>
  <a href="/">Return to Cloud City</a>
</div>
</body>
</html>`);
      return;
    }

    // Set auth cookie if passed via query param
    const qToken = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('key');
    if (qToken === ADMIN_TOKEN) {
      res.setHeader('Set-Cookie', `admin_token=${ADMIN_TOKEN}; Path=/; HttpOnly; SameSite=Strict`);
    }
  }

  // --- API ROUTES ---

  // POST /api/admin/verify (Auth check endpoint)
  if (method === 'POST' && pathname === '/api/admin/verify') {
    try {
      const body = await readBody(req);
      const testToken = (body && body.token) ? body.token.trim() : '';
      if (testToken === ADMIN_TOKEN || verifyAuth(req, parsedUrl)) {
        res.setHeader('Set-Cookie', `admin_token=${ADMIN_TOKEN}; Path=/; HttpOnly; SameSite=Strict`);
        return sendJson(200, { ok: true, message: 'Authenticated successfully' });
      }
      return sendJson(401, { ok: false, error: 'Invalid secret admin token' });
    } catch {
      return sendJson(401, { ok: false, error: 'Authentication failed' });
    }
  }

  // GET /api/state
  if (method === 'GET' && pathname === '/api/state') {
    return sendJson(200, { ...state, settings });
  }

  // GET /api/settings
  if (method === 'GET' && pathname === '/api/settings') {
    return sendJson(200, settings);
  }

  // POST /api/settings (Requires Admin Token)
  if (method === 'POST' && pathname === '/api/settings') {
    if (!verifyAuth(req, parsedUrl)) {
      return sendJson(401, { error: 'Unauthorized: Invalid or missing Bearer token' });
    }
    try {
      const body = await readBody(req);
      if (typeof body.claimText === 'string') settings.claimText = body.claimText;
      if (typeof body.claimUrl === 'string') settings.claimUrl = body.claimUrl;
      if (typeof body.claimDesc === 'string') settings.claimDesc = body.claimDesc;
      if (typeof body.claimEnabled === 'boolean') settings.claimEnabled = body.claimEnabled;
      saveSettings();
      return sendJson(200, { ok: true, settings });
    } catch (err) {
      return sendJson(400, { error: err.message });
    }
  }

  // GET /api/residents
  if (method === 'GET' && pathname === '/api/residents') {
    return sendJson(200, residents);
  }

  // POST /api/residents (Requires Admin Token)
  if (method === 'POST' && pathname === '/api/residents') {
    if (!verifyAuth(req, parsedUrl)) {
      return sendJson(401, { error: 'Unauthorized: Invalid or missing Bearer token' });
    }
    try {
      const item = await readBody(req);
      if (!item || !item.n) {
        return sendJson(400, { error: 'Resident nickname (n) is required' });
      }
      const existingIdx = residents.findIndex(r => (typeof r === 'string' ? r : r.n).toLowerCase() === item.n.toLowerCase());
      if (existingIdx !== -1) {
        residents[existingIdx] = item;
      } else {
        residents.push(item);
      }
      saveResidents();
      return sendJson(201, { ok: true, resident: item, total: residents.length });
    } catch (err) {
      return sendJson(400, { error: err.message });
    }
  }

  // PUT /api/residents/:nick (Requires Admin Token)
  if (method === 'PUT' && pathname.startsWith('/api/residents/')) {
    if (!verifyAuth(req, parsedUrl)) {
      return sendJson(401, { error: 'Unauthorized: Invalid or missing Bearer token' });
    }
    const nick = decodeURIComponent(pathname.slice('/api/residents/'.length));
    try {
      const item = await readBody(req);
      const existingIdx = residents.findIndex(r => (typeof r === 'string' ? r : r.n).toLowerCase() === nick.toLowerCase());
      if (existingIdx === -1) {
        residents.push(item);
      } else {
        residents[existingIdx] = item;
      }
      saveResidents();
      return sendJson(200, { ok: true, resident: item });
    } catch (err) {
      return sendJson(400, { error: err.message });
    }
  }

  // DELETE /api/residents/:nick (Requires Admin Token)
  if (method === 'DELETE' && pathname.startsWith('/api/residents/')) {
    if (!verifyAuth(req, parsedUrl)) {
      return sendJson(401, { error: 'Unauthorized: Invalid or missing Bearer token' });
    }
    const nick = decodeURIComponent(pathname.slice('/api/residents/'.length));
    const prevCount = residents.length;
    residents = residents.filter(r => (typeof r === 'string' ? r : r.n).toLowerCase() !== nick.toLowerCase());
    saveResidents();
    return sendJson(200, { ok: true, deleted: prevCount !== residents.length });
  }

  // POST /api/residents/sync (Bulk sync from residents.js or admin)
  if (method === 'POST' && pathname === '/api/residents/sync') {
    if (!verifyAuth(req, parsedUrl)) {
      return sendJson(401, { error: 'Unauthorized: Invalid or missing Bearer token' });
    }
    try {
      const body = await readBody(req);
      if (body && Array.isArray(body.residents)) {
        residents = body.residents;
        saveResidents();
        return sendJson(200, { ok: true, count: residents.length });
      }
      return sendJson(400, { error: 'Missing residents array' });
    } catch (err) {
      return sendJson(400, { error: err.message });
    }
  }

  // POST /api/claim
  if (method === 'POST' && pathname === '/api/claim') {
    try {
      const body = await readBody(req);
      const { nick, style, wish, device, ref, lot } = body;
      state.claims = state.claims || [];
      state.claims.push({ n: nick, style, wish, device, ref, lot, at: Date.now() });
      saveState();
      return sendJson(200, { ok: true });
    } catch (err) {
      return sendJson(400, { error: err.message });
    }
  }

  // POST /api/like
  if (method === 'POST' && pathname === '/api/like') {
    state.mall = (state.mall || 0) + 1;
    saveState();
    return sendJson(200, { ok: true, likes: state.mall });
  }

  // POST /api/vote
  if (method === 'POST' && pathname === '/api/vote') {
    try {
      const { option } = await readBody(req);
      state.votes = state.votes || {};
      state.votes[option] = (state.votes[option] || 0) + 1;
      saveState();
      return sendJson(200, { ok: true, votes: state.votes });
    } catch (err) {
      return sendJson(400, { error: err.message });
    }
  }

  // POST /api/join
  if (method === 'POST' && pathname === '/api/join') {
    try {
      const { inviter } = await readBody(req);
      state.friends = state.friends || {};
      state.friends[inviter] = (state.friends[inviter] || 0) + 1;
      saveState();
      return sendJson(200, { ok: true, friends: state.friends[inviter] });
    } catch (err) {
      return sendJson(400, { error: err.message });
    }
  }

  // POST /api/follow
  if (method === 'POST' && pathname === '/api/follow') {
    return sendJson(200, { ok: true });
  }

  // --- STATIC FILE SERVING ---
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  
  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = PORT + 1;
    console.warn(`Port ${PORT} is in use, falling back to port ${nextPort}...`);
    server.listen(nextPort, '0.0.0.0');
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const actualPort = server.address().port;
  console.log(`\n======================================================`);
  console.log(`🏔️  Cloud City Secure Server running at http://localhost:${actualPort}`);
  console.log(`🔒  Admin Manager:   http://localhost:${actualPort}/admin.html?token=${ADMIN_TOKEN}`);
  console.log(`🔑  Admin API Token: ${ADMIN_TOKEN}`);
  console.log(`📁  Residents Data:  data/residents.json (${residents.length} loaded)`);
  console.log(`======================================================\n`);
});
