import { verifyToken } from '@clerk/backend';

const secretKey = process.env.CLERK_SECRET_KEY || '';
const publishableKey = process.env.CLERK_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  || '';
const basicUser = process.env.DASHBOARD_USER || '';
const basicPass = process.env.DASHBOARD_PASS || '';

export const clerkConfig = {
  publishableKey,
  configured: Boolean(secretKey && publishableKey)
};

export function isAuthConfigPath(pathname) {
  return pathname === '/api/auth/config' || pathname === '/auth/config';
}

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
  if (basicCredentialsValid(req)) return { type: 'basic' };
  if (!secretKey) {
    return basicUser && basicPass
      ? { ok: false, status: 401, message: 'Não autorizado' }
      : { ok: false, status: 503, message: 'Autenticação não configurada no servidor' };
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'Sessão necessária' };
  }

  try {
    const payload = await verifyToken(header.slice(7), { secretKey });
    return { ok: true, type: 'clerk', session: payload };
  } catch (error) {
    console.warn('[auth] token inválido:', error.message);
    return { ok: false, status: 401, message: 'Sessão inválida ou expirada' };
  }
}

export function authChallenge(res, status = 401, message = 'Não autorizado') {
  res.writeHead(status, {
    ...(status === 401 && basicUser && basicPass ? { 'WWW-Authenticate': 'Basic realm="Dashboard"' } : {}),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify({ error: message }));
}
