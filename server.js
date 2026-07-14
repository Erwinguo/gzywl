const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const MESSAGE_FILE = path.join(DATA_DIR, 'messages.json');
const PORT = Number(process.env.PORT || 8765);
const SECRET = process.env.CAPTCHA_SECRET || 'gzywl-local-captcha-change-me';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Gzywl@2026!';
const captchas = new Map();
const lastSubmit = new Map();
const sessions = new Map();
const loginAttempts = new Map();

function randomId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : [Date.now().toString(16), crypto.randomBytes(12).toString('hex')].join('-');
}

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(MESSAGE_FILE)) fs.writeFileSync(MESSAGE_FILE, '[]', 'utf8');

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 20000) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (_) { reject(new Error('invalid json')); } });
    req.on('error', reject);
  });
}

function makeToken(id, answer) {
  return crypto.createHmac('sha256', SECRET).update(`${id}:${answer}`).digest('hex');
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}

function isAdmin(req) {
  const token = parseCookies(req).admin_session;
  const expires = token && sessions.get(token);
  if (!expires || expires < Date.now()) { if (token) sessions.delete(token); return false; }
  return true;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a)); const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function serveFile(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.resolve(ROOT, `.${relative}`);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: 'Not found' });
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
  res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/admin/login') {
      const ip = req.socket.remoteAddress || 'unknown';
      const attempt = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
      if (attempt.blockedUntil > Date.now()) return json(res, 429, { error: '登录尝试过多，请稍后再试。' });
      const body = await readBody(req);
      if (!safeEqual(body.username, ADMIN_USER) || !safeEqual(body.password, ADMIN_PASSWORD)) {
        attempt.count += 1; if (attempt.count >= 5) { attempt.count = 0; attempt.blockedUntil = Date.now() + 5 * 60 * 1000; }
        loginAttempts.set(ip, attempt);
        return json(res, 401, { error: '用户名或密码错误。' });
      }
      loginAttempts.delete(ip);
      const session = crypto.randomBytes(32).toString('hex');
      sessions.set(session, Date.now() + 8 * 60 * 60 * 1000);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': `admin_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`, 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ success: true })); return;
    }
    if (req.method === 'POST' && req.url === '/api/admin/logout') {
      const token = parseCookies(req).admin_session; if (token) sessions.delete(token);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': 'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
      res.end(JSON.stringify({ success: true })); return;
    }
    if (req.method === 'GET' && req.url === '/api/admin/session') { json(res, 200, { authenticated: isAdmin(req) }); return; }
    if (req.method === 'GET' && req.url === '/api/admin/messages') {
      if (!isAdmin(req)) return json(res, 401, { error: '请先登录。' });
      const messages = JSON.parse(fs.readFileSync(MESSAGE_FILE, 'utf8')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      json(res, 200, { messages }); return;
    }
    if (req.method === 'GET' && req.url.startsWith('/api/captcha')) {
      const a = crypto.randomInt(1, 10); const b = crypto.randomInt(1, 10); const id = randomId();
      const answer = String(a + b); captchas.set(id, { answer, expires: Date.now() + 5 * 60 * 1000 });
      json(res, 200, { question: `${a} + ${b} = ?`, token: `${id}.${makeToken(id, answer)}` }); return;
    }
    if (req.method === 'POST' && req.url === '/api/messages') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (lastSubmit.has(ip) && Date.now() - lastSubmit.get(ip) < 30000) return json(res, 429, { error: '提交过于频繁，请稍后再试。' });
      const body = await readBody(req);
      if (body.website) return json(res, 400, { error: '提交失败。' });
      const required = ['first_name', 'last_name', 'email', 'message', 'captcha', 'captcha_token'];
      if (required.some(key => typeof body[key] !== 'string' || !body[key].trim())) return json(res, 400, { error: '请完整填写表单和验证码。' });
      if (!/^\S+@\S+\.\S+$/.test(body.email) || body.message.length > 2000) return json(res, 400, { error: '请检查邮箱或留言内容。' });
      const [id, signature] = body.captcha_token.split('.'); const challenge = captchas.get(id);
      if (!challenge || challenge.expires < Date.now() || !crypto.timingSafeEqual(Buffer.from(signature || ''), Buffer.from(makeToken(id, challenge.answer))) || body.captcha.trim() !== challenge.answer) return json(res, 400, { error: '验证码错误，请重试。' });
      captchas.delete(id); lastSubmit.set(ip, Date.now());
      const messages = JSON.parse(fs.readFileSync(MESSAGE_FILE, 'utf8'));
      messages.push({ id: randomId(), createdAt: new Date().toISOString(), firstName: body.first_name.trim().slice(0, 80), lastName: body.last_name.trim().slice(0, 80), email: body.email.trim().slice(0, 160), phone: (body.phone || '').trim().slice(0, 40), message: body.message.trim().slice(0, 2000) });
      fs.writeFileSync(MESSAGE_FILE, JSON.stringify(messages, null, 2), 'utf8');
      json(res, 201, { success: true }); return;
    }
    if (req.method === 'GET') return serveFile(req, res);
    json(res, 405, { error: 'Method not allowed' });
  } catch (error) { json(res, 500, { error: '服务器暂时无法处理请求。' }); }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Website preview: http://127.0.0.1:${PORT}`));
