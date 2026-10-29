import crypto from 'node:crypto';

const basicUser = process.env.DASHBOARD_USER || '';
const basicPass = process.env.DASHBOARD_PASS || '';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const sessions = new Map();
const loginFailures = new Map();

function basicCredentialsValid(req) {
  if (!basicUser || !basicPass) return false;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    return separator >= 0
      && decoded.slice(0, separator) === basicUser
      && decoded.slice(separator + 1) === basicPass;
  } catch {
    return false;
  }
}

export async function authenticateRequest(req) {
  if (!basicUser || !basicPass) return { ok: true, type: 'disabled' };
  const token = parseCookies(req.headers.cookie || '').dashboard_session;
  const session = token && sessions.get(token);
  if (session && session.expiresAt > Date.now()) {
    session.expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
    return { ok: true, type: 'session' };
  }
  if (token) sessions.delete(token);
  if (basicCredentialsValid(req)) return { ok: true, type: 'basic' };
  return { ok: false, status: 401, message: 'Não autorizado' };
}

function parseCookies(header) {
  const cookies = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    const key = (separator < 0 ? part : part.slice(0, separator)).trim();
    if (!key) continue;
    const value = separator < 0 ? '' : part.slice(separator + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = '';
    }
  }
  return cookies;
}

export function isPublicPath(pathname) {
  return pathname === '/login'
    || pathname === '/login.html'
    || pathname === '/login.js'
    || pathname === '/styles.css'
    || pathname.startsWith('/assets/');
}

export function isLoginRequest(req) {
  return req.method === 'POST' && new URL(req.url, 'http://localhost').pathname === '/api/login';
}

export async function loginRequest(req, res) {
  if (!basicUser || !basicPass) {
    res.writeHead(200, {
      ...securityHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ ok: true, authDisabled: true }));
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) return authChallenge(res, 413, 'Requisição muito grande');
    chunks.push(chunk);
  }
  let credentials;
  try {
    credentials = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return authChallenge(res, 400, 'Dados de login inválidos');
  }
  const user = String(credentials?.username || '');
  const pass = String(credentials?.password || '');
  const ipKey = clientIp(req);
  const attemptKeys = [ipKey, `${ipKey}:${user.toLowerCase()}`];
  const blocked = attemptKeys.map((key) => loginFailures.get(key))
    .find((attempt) => attempt && attempt.expiresAt > Date.now() && attempt.count >= LOGIN_MAX_ATTEMPTS);
  if (blocked) {
    return authChallenge(res, 429, 'Muitas tentativas. Tente novamente mais tarde.', {
      'Retry-After': Math.ceil((blocked.expiresAt - Date.now()) / 1000)
    });
  }
  if (user !== basicUser || pass !== basicPass) {
    attemptKeys.forEach((key) => recordLoginFailure(key));
    return authChallenge(res, 401, 'Usuário ou senha inválidos');
  }
  attemptKeys.forEach((key) => loginFailures.delete(key));
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 });
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  res.writeHead(200, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Set-Cookie': `dashboard_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`
  });
  res.end(JSON.stringify({ ok: true }));
}

export function logoutRequest(req, res) {
  const token = parseCookies(req.headers.cookie || '').dashboard_session;
  if (token) sessions.delete(token);
  res.writeHead(200, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Set-Cookie': 'dashboard_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  });
  res.end(JSON.stringify({ ok: true }));
}

export function authChallenge(res, status = 401, message = 'Não autorizado', extraHeaders = {}) {
  res.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify({ error: message }));
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (typeof forwarded === 'string' ? forwarded.split(',')[0] : null)?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

function recordLoginFailure(key) {
  const now = Date.now();
  const current = loginFailures.get(key);
  const next = current && current.expiresAt > now
    ? { count: current.count + 1, expiresAt: current.expiresAt }
    : { count: 1, expiresAt: now + LOGIN_WINDOW_MS };
  loginFailures.set(key, next);
  if (loginFailures.size > 10000) {
    for (const [storedKey, value] of loginFailures) {
      if (value.expiresAt <= now) loginFailures.delete(storedKey);
    }
  }
}

export function securityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}
